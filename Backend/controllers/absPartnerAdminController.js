const Account = require('../models/AbsPartnerAccount');
const Record = require('../models/AbsPartnerRecord');
const {
  SalesAgent
} = require('../models');
const service = require('../services/absPartnerPortalService');
const action = fn => async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await fn(req)
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode).json({
      success: false,
      message: error.message
    });else if (error.name === 'SequelizeUniqueConstraintError') res.status(409).json({
      message: 'This email already belongs to a partner account.'
    });else next(error);
  }
};
exports.invite = action(req => service.invite(req.params.id, req.body, req.user.id));
exports.list = action(async () => {
  const accounts = await Account.findAll({
    attributes: ['id', 'salesAgentId', 'email', 'role', 'distributorId', 'inviteExpiresAt', 'createdAt']
  });
  const agents = await SalesAgent.findAll({
    attributes: ['id', 'name', 'status']
  });
  const records = await Record.findAll({
    where: {
      kind: 'support'
    },
    order: [['createdAt', 'DESC']],
    limit: 500
  });
  return {
    accounts: accounts.map(a => ({
      ...a.toJSON(),
      name: agents.find(g => g.id === a.salesAgentId)?.name,
      status: agents.find(g => g.id === a.salesAgentId)?.status
    })),
    records
  };
});
exports.updateRecord = action(req => service.updateRecord(null, req.params.id, req.body, req.user.id));
exports.payouts = action(() => Record.findAll({
  where: {
    kind: 'payout'
  },
  order: [['createdAt', 'DESC']],
  limit: 500
}));
exports.updateSupport = action(async req => {
  const record = await Record.findOne({
    where: {
      id: req.params.id,
      kind: 'support'
    }
  });
  if (!record) throw Object.assign(new Error('Support request not found.'), {
    statusCode: 404
  });
  return service.updateRecord(null, record.id, req.body, req.user.id);
});
