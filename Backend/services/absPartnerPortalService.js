const { getCommissionPercent } = require('../utils/salesAgentCommissionRate');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  Op
} = require('sequelize');
const config = require('../config/config');
const {
  sequelize
} = require('../config/database');
const Account = require('../models/AbsPartnerAccount');
const Record = require('../models/AbsPartnerRecord');
const {
  SalesAgent,
  SalesAgentCode,
  SalesAgentCommission,
  Tenant
} = require('../models');
const fail = (message, statusCode = 400) => {
  throw Object.assign(new Error(message), {
    statusCode
  });
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const text = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const publicAccount = a => ({
  id: a.id,
  salesAgentId: a.salesAgentId,
  email: a.email,
  role: a.role,
  distributorId: a.distributorId
});
const issueToken = a => jwt.sign({
  partnerId: a.id,
  version: a.tokenVersion
}, config.jwt.secret, {
  audience: 'abs-partner-portal',
  issuer: 'abs',
  expiresIn: '8h'
});
async function authenticate(token) {
  let claims;
  try {
    claims = jwt.verify(token, config.jwt.secret, {
      audience: 'abs-partner-portal',
      issuer: 'abs',
      algorithms: ['HS256']
    });
  } catch {
    fail('Please sign in to the Partner Portal.', 401);
  }
  const account = await Account.findByPk(claims.partnerId);
  if (!account || !account.passwordHash || account.tokenVersion !== claims.version) fail('Session expired. Please sign in again.', 401);
  const agent = await SalesAgent.findByPk(account.salesAgentId);
  if (!agent || agent.status !== 'active') fail('Partner access is inactive. Contact ABS.', 403);
  return {
    account,
    agent
  };
}
async function invite(agentId, input, actorId) {
  const agent = await SalesAgent.findByPk(agentId);
  if (!agent || agent.status !== 'active') fail('Approve the sales agent before inviting them.');
  const email = text(agent.email, 255).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Add a valid email to this sales agent first.');
  const role = input.role || 'reseller';
  if (!['reseller', 'distributor'].includes(role)) fail('Invalid partner role.');
  const distributorId = input.distributorId || null;
  if (distributorId) {
    const parent = await Account.findByPk(distributorId);
    const parentAgent = parent && (await SalesAgent.findByPk(parent.salesAgentId));
    if (role !== 'reseller' || !parent || parent.role !== 'distributor' || parentAgent?.status !== 'active' || parent.salesAgentId === agentId) fail('Choose an active distributor.');
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const account = await sequelize.transaction(async transaction => {
    let row = await Account.findOne({
      where: {
        salesAgentId: agentId
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (row && role !== 'distributor' && (await Account.count({
      where: {
        distributorId: row.id
      },
      transaction
    }))) fail('Reassign this distributor’s resellers before changing their role.');
    const values = {
      email,
      role,
      distributorId,
      inviteHash: hash(token),
      inviteExpiresAt: expiresAt
    };
    if (row) await row.update({
      ...values,
      tokenVersion: row.tokenVersion + 1,
      passwordHash: null
    }, {
      transaction
    });else row = await Account.create({
      ...values,
      salesAgentId: agentId
    }, {
      transaction
    });
    await Record.create({
      partnerId: row.id,
      kind: 'support',
      title: 'Partner portal invitation',
      status: 'closed',
      details: {
        message: 'ABS issued a portal invitation.'
      },
      history: [{
        at: new Date().toISOString(),
        actor: actorId,
        action: 'invited',
        role,
        distributorId
      }]
    }, {
      transaction
    });
    return row;
  });
  return {
    account: publicAccount(account),
    token,
    expiresAt
  };
}
async function accept(input) {
  if (!/^[a-f0-9]{64}$/.test(input.token || '') || typeof input.password !== 'string' || input.password.length < 12 || Buffer.byteLength(input.password) > 72) fail('Use a valid invitation and a password of at least 12 characters (maximum 72 bytes).');
  const passwordHash = await bcrypt.hash(input.password, 12);
  const account = await sequelize.transaction(async transaction => {
    const a = await Account.findOne({
      where: {
        inviteHash: hash(input.token),
        inviteExpiresAt: {
          [Op.gt]: new Date()
        }
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!a) fail('This invitation has expired or has already been used.');
    const agent = await SalesAgent.findByPk(a.salesAgentId, {
      transaction
    });
    if (agent?.status !== 'active') fail('Partner access is inactive.', 403);
    await a.update({
      passwordHash,
      inviteHash: null,
      inviteExpiresAt: null
    }, {
      transaction
    });
    return a;
  });
  return {
    token: issueToken(account),
    account: publicAccount(account)
  };
}
async function login(input) {
  const a = await Account.findOne({
    where: {
      email: text(input.email, 255).toLowerCase()
    }
  });
  const valid = typeof input.password === 'string' && Buffer.byteLength(input.password) <= 72 && (await bcrypt.compare(input.password, a?.passwordHash || '$2a$12$C6UzMDM.H6dfI/f/IKcEe.6hbgAChMyTmESwi/hjmLHOFm3ObOR2a'));
  if (!a || !a.passwordHash || !valid) fail('Email or password is incorrect.', 401);
  if ((await SalesAgent.findByPk(a.salesAgentId))?.status !== 'active') fail('Partner access is inactive.', 403);
  return {
    token: issueToken(a),
    account: publicAccount(a)
  };
}
async function overview(account, agent) {
  const children = account.role === 'distributor' ? await Account.findAll({
    where: {
      distributorId: account.id
    },
    attributes: ['id', 'salesAgentId', 'email', 'role']
  }) : [];
  const teamAgents = children.length ? await SalesAgent.findAll({
    where: {
      id: {
        [Op.in]: children.map(c => c.salesAgentId)
      }
    },
    attributes: ['id', 'name', 'status']
  }) : [];
  const codes = await SalesAgentCode.findAll({
    where: {
      salesAgentId: agent.id,
      status: 'active'
    },
    attributes: ['id', 'code', 'label']
  });
  const businesses = await Tenant.scope('withOptionalColumns').findAll({
    where: {
      referredByAgentId: agent.id
    },
    attributes: ['id', 'name', 'plan', 'status', 'trialEndsAt', 'createdAt', 'referredByAgentCode'],
    order: [['createdAt', 'DESC']]
  });
  const commissions = await SalesAgentCommission.findAll({
    where: {
      salesAgentId: agent.id
    },
    attributes: ['id', 'tenantId', 'amount', 'currency', 'periodNumber', 'status', 'paidAt', 'createdAt'],
    order: [['createdAt', 'DESC']]
  });
  const records = await Record.findAll({
    where: {
      partnerId: account.id
    },
    order: [['createdAt', 'DESC']]
  });
  const team = await Promise.all(children.map(async c => ({
    ...publicAccount(c),
    name: teamAgents.find(a => a.id === c.salesAgentId)?.name,
    status: teamAgents.find(a => a.id === c.salesAgentId)?.status,
    businessCount: await Tenant.count({
      where: {
        referredByAgentId: c.salesAgentId
      }
    })
  })));
  return {
    account: publicAccount(account),
    name: agent.name,
    commissionAmount: agent.commissionAmount,
    commissionPercent: getCommissionPercent(agent),
    payoutDetails: account.payoutDetails,
    codes,
    businesses,
    commissions,
    records,
    team
  };
}
async function savePayoutDetails(account, input) {
  const method = input.method;
  if (!['mobile_money', 'bank'].includes(method)) fail('Choose bank or mobile money.');
  const details = {
    method,
    accountName: text(input.accountName, 150),
    accountNumber: text(input.accountNumber, 60),
    provider: text(input.provider, 100)
  };
  if (!details.accountName || !details.accountNumber || !details.provider) fail('Complete all payout details.');
  await account.update({
    payoutDetails: details
  });
  return details;
}
async function createRecord(account, input) {
  const kind = input.kind;
  if (!['lead', 'support', 'payout'].includes(kind)) fail('Invalid request type.');
  if (kind === 'payout') return sequelize.transaction(async transaction => {
    const a = await Account.findByPk(account.id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!a.payoutDetails?.accountNumber) fail('Save your payout details first.');
    if (await Record.findOne({
      where: {
        partnerId: a.id,
        kind,
        status: 'pending'
      },
      transaction
    })) fail('You already have a pending payout request.');
    const commissions = await SalesAgentCommission.findAll({
      where: {
        salesAgentId: a.salesAgentId,
        status: 'due'
      },
      transaction
    });
    if (!commissions.length) fail('No commissions are due yet.');
    if (commissions.some(c => c.currency !== 'GHS')) fail('Contact ABS to arrange a payout in this currency.');
    return Record.create({
      partnerId: a.id,
      kind,
      title: 'Commission payout',
      status: 'pending',
      details: {
        amount: commissions.reduce((sum, c) => sum + Number(c.amount), 0),
        currency: 'GHS',
        commissionIds: commissions.map(c => c.id),
        payoutDetails: a.payoutDetails
      },
      history: []
    }, {
      transaction
    });
  });
  const title = text(input.title);
  if (!title) fail('A business name or subject is required.');
  const details = kind === 'lead' ? {
    contactName: text(input.contactName, 150),
    email: text(input.email, 255),
    phone: text(input.phone, 40),
    notes: text(input.notes, 4000)
  } : {
    message: text(input.message, 4000)
  };
  if (kind === 'support' && !details.message) fail('Describe your request.');
  return Record.create({
    partnerId: account.id,
    kind,
    title,
    status: kind === 'lead' ? 'new' : 'open',
    details,
    history: []
  });
}
async function updateRecord(account, id, input, adminId = null) {
  return sequelize.transaction(async transaction => {
    const where = adminId ? {
      id
    } : {
      id,
      partnerId: account.id
    };
    const row = await Record.findOne({
      where,
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!row) fail('Request not found.', 404);
    const allowed = row.kind === 'lead' ? ['new', 'contacted', 'onboarding', 'won', 'lost'] : row.kind === 'support' ? ['open', 'closed'] : adminId ? ['pending', 'paid', 'rejected'] : [];
    if (input.status && !allowed.includes(input.status)) fail('This status change is not allowed.', 403);
    if (row.kind === 'payout' && row.status !== 'pending') fail('This payout has already been resolved.');
    const note = text(input.note, 4000);
    if (!input.status && !note) fail('Choose a status or add a note.');
    if (row.kind === 'payout' && !adminId) fail('Only ABS can resolve payouts.', 403);
    if (row.kind === 'payout' && input.status === 'paid') {
      if (!note) fail('Enter the payment reference before marking this payout paid.');
      const owner = await Account.findByPk(row.partnerId, {
        transaction
      });
      const due = await SalesAgentCommission.findAll({
        where: {
          id: {
            [Op.in]: row.details.commissionIds
          },
          salesAgentId: owner.salesAgentId
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (due.length !== row.details.commissionIds.length || due.some(c => c.status !== 'due')) fail('Commission balances changed. Reject this request and ask the partner to request the remaining balance.');
      for (const c of due) await c.update({
        status: 'paid',
        paidAt: new Date(),
        paidBy: adminId
      }, {
        transaction
      });
    }
    await row.update({
      status: input.status || row.status,
      history: [...row.history, {
        at: new Date().toISOString(),
        actor: adminId ? 'ABS' : 'Partner',
        status: input.status || row.status,
        note
      }]
    }, {
      transaction
    });
    return row;
  });
}
module.exports = {
  authenticate,
  invite,
  accept,
  login,
  overview,
  createRecord,
  updateRecord,
  savePayoutDetails,
  publicAccount
};
