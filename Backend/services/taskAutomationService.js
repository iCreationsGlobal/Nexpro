const { Op } = require('sequelize');
const { Quote, Setting, UserTask, UserTenant, User, Tenant } = require('../models');
const { normalizeTaskAutomation } = require('../utils/taskAutomationConfig');
const emailService = require('./emailService');
const emailTemplates = require('./emailTemplates');
const { getTenantLogoUrl } = require('../utils/tenantLogo');

const OPEN_TASK_STATUSES = ['todo', 'in_progress', 'on_hold'];

const SOURCE_EVENT_REASON = {
  follow_up: 'Lead follow-up is due',
  overdue_follow_up: 'Invoice is overdue',
  no_response_follow_up: 'Quote has had no response',
  low_stock_restock: 'Stock is below reorder level',
};

async function getTaskAutomationConfig(tenantId) {
  const org = await Setting.findOne({ where: { tenantId, key: 'organization' } });
  return normalizeTaskAutomation(org?.value?.taskAutomation || {});
}

async function resolveActorUserId(tenantId, preferredUserId = null) {
  if (preferredUserId) return preferredUserId;
  const ownerOrManager = await UserTenant.findOne({
    where: {
      tenantId,
      status: 'active',
      role: { [Op.in]: ['owner', 'admin', 'manager'] }
    },
    attributes: ['userId'],
    order: [['createdAt', 'ASC']]
  });
  return ownerOrManager?.userId || null;
}

function buildSourceLink(sourceType, sourceId) {
  const id = sourceId ? String(sourceId) : '';
  switch (sourceType) {
    case 'lead':
      return id ? `/leads?openLeadId=${encodeURIComponent(id)}` : '/leads';
    case 'invoice':
      return id ? `/invoices?openInvoiceId=${encodeURIComponent(id)}` : '/invoices';
    case 'quote':
      return id ? `/quotes?openQuoteId=${encodeURIComponent(id)}` : '/quotes';
    case 'stock':
      return id ? `/materials?openItemId=${encodeURIComponent(id)}` : '/materials';
    default:
      return null;
  }
}

async function createOrUpsertAutomatedTask({
  tenantId,
  title,
  description,
  dueDate = null,
  assigneeId = null,
  priority = 'medium',
  sourceType,
  sourceId,
  sourceEvent,
  actorUserId = null,
  link = null,
  reason = null,
  shopId = null,
  studioLocationId = null
}) {
  if (!tenantId || !title || !sourceType || !sourceId || !sourceEvent) return null;
  const dedupeKey = `${sourceType}:${sourceId}:${sourceEvent}`;
  const actorId = await resolveActorUserId(tenantId, actorUserId || assigneeId);
  if (!actorId) return null;

  const existing = await UserTask.findOne({
    where: {
      tenantId,
      dedupeKey,
      status: { [Op.in]: OPEN_TASK_STATUSES }
    },
    order: [['updatedAt', 'DESC']]
  });

  const resolvedLink = link || buildSourceLink(sourceType, sourceId);
  const resolvedReason = reason || SOURCE_EVENT_REASON[sourceEvent] || null;
  const existingMeta =
    existing?.metadata && typeof existing.metadata === 'object' ? { ...existing.metadata } : {};

  const payload = {
    tenantId,
    userId: actorId,
    title,
    status: existing?.status || 'todo',
    dueDate: dueDate || existing?.dueDate || null,
    priority,
    description: description || null,
    assigneeId: assigneeId || existing?.assigneeId || actorId,
    isPrivate: false,
    sourceType,
    sourceId: String(sourceId),
    sourceEvent,
    dedupeKey,
    shopId: shopId || existing?.shopId || null,
    studioLocationId: studioLocationId || existing?.studioLocationId || null,
    metadata: {
      ...existingMeta,
      automation: true,
      link: resolvedLink,
      reason: resolvedReason
    }
  };

  if (existing) {
    await existing.update(payload);
    return existing;
  }

  return UserTask.create(payload);
}

async function createLeadFollowUpTask({ lead, followUpDate, nextStep, tenantId, triggeredBy }) {
  const cfg = await getTaskAutomationConfig(tenantId);
  if (!cfg.leadFollowUpToTask || !lead?.id || !followUpDate) return null;
  const leadName = lead.name || lead.company || 'Lead';
  return createOrUpsertAutomatedTask({
    tenantId,
    title: `Lead follow-up: ${leadName}`,
    description: nextStep || `Follow up with lead ${leadName}`.trim(),
    dueDate: new Date(followUpDate).toISOString().slice(0, 10),
    assigneeId: lead.assignedTo || lead.createdBy || triggeredBy || null,
    priority: lead.priority || 'medium',
    sourceType: 'lead',
    sourceId: lead.id,
    sourceEvent: 'follow_up',
    actorUserId: triggeredBy || lead.createdBy || null,
    reason: `Follow-up scheduled for ${leadName}`,
    shopId: lead.shopId || null,
    studioLocationId: lead.studioLocationId || null
  });
}

async function createInvoiceOverdueTask({ invoice, tenantId, triggeredBy }) {
  const cfg = await getTaskAutomationConfig(tenantId);
  if (!cfg.invoiceOverdueToTask || !invoice?.id) return null;
  const invoiceLabel = invoice.invoiceNumber || invoice.id;
  const customerHint = invoice.customer?.name || invoice.customerName || null;
  const amountHint =
    invoice.balanceDue != null
      ? ` Balance due: ${invoice.balanceDue}.`
      : invoice.total != null
        ? ` Total: ${invoice.total}.`
        : '';
  return createOrUpsertAutomatedTask({
    tenantId,
    title: `Collect overdue invoice ${invoice.invoiceNumber || ''}`.trim(),
    description: `Invoice ${invoiceLabel} is overdue.${customerHint ? ` Customer: ${customerHint}.` : ''}${amountHint} Follow up for payment collection.`,
    dueDate: new Date().toISOString().slice(0, 10),
    assigneeId: invoice.createdBy || invoice.userId || triggeredBy || null,
    priority: 'high',
    sourceType: 'invoice',
    sourceId: invoice.id,
    sourceEvent: 'overdue_follow_up',
    actorUserId: triggeredBy || invoice.createdBy || null,
    reason: `Invoice ${invoiceLabel} is overdue`,
    shopId: invoice.shopId || null,
    studioLocationId: invoice.studioLocationId || null
  });
}

async function createLowStockTask({ item, tenantId, triggeredBy }) {
  const cfg = await getTaskAutomationConfig(tenantId);
  if (!cfg.lowStockToTask || !item?.id) return null;
  const qty = item.quantityOnHand ?? item.currentStock ?? 0;
  const reorder = item.reorderLevel ?? 0;
  return createOrUpsertAutomatedTask({
    tenantId,
    title: `Restock: ${item.name || 'Item'}`,
    description: `${item.name || 'Item'} is low on stock (${qty} left, reorder at ${reorder}).`,
    dueDate: new Date().toISOString().slice(0, 10),
    assigneeId: item.createdBy || triggeredBy || null,
    priority: 'high',
    sourceType: 'stock',
    sourceId: item.id,
    sourceEvent: 'low_stock_restock',
    actorUserId: triggeredBy || item.createdBy || null,
    reason: `${item.name || 'Item'} is below reorder level (${qty}/${reorder})`,
    shopId: item.shopId || null,
    studioLocationId: item.studioLocationId || null
  });
}

async function runQuoteNoResponseScan() {
  const orgSettings = await Setting.findAll({
    where: { key: 'organization' },
    attributes: ['tenantId', 'value']
  });

  let createdOrUpdated = 0;
  const now = new Date();

  for (const row of orgSettings) {
    if (!row.tenantId) continue;
    const cfg = normalizeTaskAutomation(row.value?.taskAutomation || {});
    if (!cfg.quoteNoResponseToTask) continue;

    const thresholdDate = new Date(now.getTime() - cfg.quoteNoResponseDays * 24 * 60 * 60 * 1000);
    const staleQuotes = await Quote.findAll({
      where: {
        tenantId: row.tenantId,
        status: 'sent',
        createdAt: { [Op.lte]: thresholdDate }
      },
      attributes: ['id', 'quoteNumber', 'title', 'createdBy', 'createdAt', 'shopId', 'studioLocationId']
    });

    for (const quote of staleQuotes) {
      const daysSince = Math.max(
        1,
        Math.floor((now.getTime() - new Date(quote.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      );
      const task = await createOrUpsertAutomatedTask({
        tenantId: row.tenantId,
        title: `Quote follow-up: ${quote.quoteNumber || quote.title || 'Quote'}`,
        description: `No response yet for quote ${quote.quoteNumber || quote.id} (sent ${daysSince} day${daysSince === 1 ? '' : 's'} ago). Follow up with customer.`,
        dueDate: new Date().toISOString().slice(0, 10),
        assigneeId: quote.createdBy || null,
        priority: 'medium',
        sourceType: 'quote',
        sourceId: quote.id,
        sourceEvent: 'no_response_follow_up',
        actorUserId: quote.createdBy || null,
        reason: `Quote ${quote.quoteNumber || quote.id} has had no response for ${daysSince} day${daysSince === 1 ? '' : 's'}`,
        shopId: quote.shopId || null,
        studioLocationId: quote.studioLocationId || null
      });
      if (task) createdOrUpdated += 1;
    }
  }

  return { createdOrUpdated };
}

/**
 * Email assignee for due-today / overdue open tasks (once per day per kind).
 * @returns {Promise<{ reminded: number }>}
 */
async function runTaskDueReminderScan() {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = await UserTask.findAll({
    where: {
      status: { [Op.in]: OPEN_TASK_STATUSES },
      assigneeId: { [Op.ne]: null },
      dueDate: { [Op.lte]: today }
    },
    include: [
      { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] }
    ],
    limit: 500
  });

  let reminded = 0;

  for (const task of tasks) {
    const assignee = task.assignee;
    if (!assignee?.email) continue;

    const due = String(task.dueDate).slice(0, 10);
    const kind = due < today ? 'overdue' : 'due';
    const metadata = task.metadata && typeof task.metadata === 'object' ? { ...task.metadata } : {};
    const reminder = metadata.reminder && typeof metadata.reminder === 'object' ? metadata.reminder : {};
    if (reminder.lastSentOn === today && reminder.kind === kind) continue;

    let company = { name: 'African Business Suite', primaryColor: '#166534', logoUrl: '' };
    try {
      const tenant = await Tenant.findByPk(task.tenantId, { attributes: ['name', 'metadata'] });
      if (tenant) {
        company = {
          name: tenant.name || company.name,
          logoUrl: getTenantLogoUrl(tenant),
          primaryColor: tenant.metadata?.primaryColor || company.primaryColor
        };
      }
    } catch (_) {
      /* defaults */
    }

    const { subject, html, text } = emailTemplates.workspaceTaskDueReminderEmail(
      assignee,
      task,
      company,
      kind
    );
    const result = await emailService.sendMessage(task.tenantId, assignee.email, subject, html, text);
    if (!result?.success) {
      console.warn(
        `[Tasks][due-reminder] failed tenantId=${task.tenantId} taskId=${task.id} error=${result?.error || 'unknown'}`
      );
      continue;
    }

    metadata.reminder = { lastSentOn: today, kind };
    task.set('metadata', metadata);
    task.changed('metadata', true);
    await task.save();
    reminded += 1;
  }

  return { reminded };
}

module.exports = {
  getTaskAutomationConfig,
  createLeadFollowUpTask,
  createInvoiceOverdueTask,
  createLowStockTask,
  runQuoteNoResponseScan,
  runTaskDueReminderScan,
  buildSourceLink,
  SOURCE_EVENT_REASON
};
