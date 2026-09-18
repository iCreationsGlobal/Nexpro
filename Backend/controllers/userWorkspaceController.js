const { normalizeCalendar } = require('../utils/calendarTask');
const { UserTodo, UserWeekFocus, UserTask, UserChecklist, UserChecklistItem, UserTenant, User, Tenant } = require('../models');
const { getTenantLogoUrl } = require('../utils/tenantLogo');
const { Op } = require('sequelize');
const emailService = require('../services/emailService');
const emailTemplates = require('../services/emailTemplates');
const { attachScopedToPayload } = require('../utils/shopUtils');
const {
  shouldUseAutomationInsteadOfBuiltIn,
  TEMPLATE_KEYS,
} = require('../services/customerNotificationBridgeService');

const ALLOWED_TASK_STATUSES = ['todo', 'in_progress', 'on_hold', 'completed'];
const isAllLocationParam = (value) => String(value || '').trim().toLowerCase() === 'all';
const withTaskLocationCondition = (where, condition) => ({
  [Op.and]: [where, condition]
});
const taskScopeWhere = (req, extra = {}) => {
  const where = { tenantId: req.tenantId, ...extra };

  if (req.shopScoped) {
    if (isAllLocationParam(req.query?.shopId)) {
      if (req.allowedShopIds?.length) {
        return withTaskLocationCondition(where, {
          [Op.or]: [{ shopId: { [Op.in]: req.allowedShopIds } }, { shopId: null }]
        });
      }
      return where;
    }
    if (req.shopFilterId) {
      return withTaskLocationCondition(where, {
        [Op.or]: [{ shopId: req.shopFilterId }, { shopId: null }]
      });
    }
    if (req.allowedShopIds?.length) {
      return withTaskLocationCondition(where, {
        [Op.or]: [{ shopId: { [Op.in]: req.allowedShopIds } }, { shopId: null }]
      });
    }
  }

  if (req.studioLocationScoped) {
    if (isAllLocationParam(req.query?.studioLocationId)) {
      if (req.canAccessAllStudioLocations) return where;
      if (req.allowedStudioLocationIds?.length) {
        return withTaskLocationCondition(where, {
          [Op.or]: [{ studioLocationId: { [Op.in]: req.allowedStudioLocationIds } }, { studioLocationId: null }]
        });
      }
      return where;
    }
    if (req.studioLocationFilterId) {
      return withTaskLocationCondition(where, {
        [Op.or]: [{ studioLocationId: req.studioLocationFilterId }, { studioLocationId: null }]
      });
    }
    if (!req.canAccessAllStudioLocations && req.allowedStudioLocationIds?.length) {
      return withTaskLocationCondition(where, {
        [Op.or]: [{ studioLocationId: { [Op.in]: req.allowedStudioLocationIds } }, { studioLocationId: null }]
      });
    }
  }

  return where;
};

const normalizeTaskMetadata = (value) => (value && typeof value === 'object' ? value : {});
const normalizeTaskComments = (metadata) => (Array.isArray(metadata.comments) ? metadata.comments : []);
const normalizeTaskActivity = (metadata) => (Array.isArray(metadata.activityLog) ? metadata.activityLog : []);
const buildActivityEntry = (type, payload = {}) => ({
  id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  type,
  createdAt: new Date().toISOString(),
  ...payload
});

const normalizeTaskChecklistsInput = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .slice(0, 50)
    .map((item, index) => ({
      id: String(item.id || `cl_${Date.now()}_${index}`).slice(0, 80),
      text: String(item.text || '').trim().slice(0, 300),
      done: Boolean(item.done),
      createdAt: item.createdAt || new Date().toISOString()
    }))
    .filter((item) => item.text);
};

const normalizeTaskTagsInput = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const tags = [];
  for (const raw of value) {
    const tag = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '')
      .slice(0, 32);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= 5) break;
  }
  return tags;
};

const sendTaskAssignmentEmail = async ({
  tenantId,
  assignee,
  actor,
  task
}) => {
  if (!tenantId || !assignee?.email || !task?.title) return;

  let company = { name: 'African Business Suite', primaryColor: '#166534', logoUrl: '' };
  try {
    const tenant = await Tenant.findByPk(tenantId, { attributes: ['name', 'metadata'] });
    if (tenant) {
      company = {
        name: tenant.name || company.name,
        logoUrl: getTenantLogoUrl(tenant),
        primaryColor: tenant.metadata?.primaryColor || company.primaryColor
      };
    }
  } catch (_) {
    /* use defaults */
  }

  const { subject, html, text } = emailTemplates.workspaceTaskAssignedEmail(assignee, actor, task, company);
  const result = await emailService.sendMessage(tenantId, assignee.email, subject, html, text);
  if (!result?.success) {
    console.warn(
      `[Tasks][assignment-email] failed tenantId=${tenantId} taskId=${task.id} assigneeId=${assignee.id} error=${result?.error || 'unknown'}`
    );
  }
};

/**
 * Notify assignee via automation rules, falling back to the built-in email when no rule is enabled.
 * @param {object} params
 */
const notifyTaskAssignee = async ({
  tenantId,
  task,
  assignee,
  actor,
}) => {
  if (!tenantId || !task?.id || !assignee?.id) return;
  if (actor?.id && assignee.id === actor.id) return;

  try {
    const { runTaskAssignedStaffAutomations } = require('../services/automationEngineService');
    await runTaskAssignedStaffAutomations({
      tenantId,
      task,
      assignee,
      assignedByUser: actor || null,
      actorUserId: actor?.id || null,
    });
  } catch (err) {
    console.error(
      `[Tasks][assignment-automation] failed tenantId=${tenantId} taskId=${task.id} assigneeId=${assignee.id} error=${err?.message || err}`
    );
  }

  try {
    const useAutomation = await shouldUseAutomationInsteadOfBuiltIn(
      tenantId,
      TEMPLATE_KEYS.TASK_ASSIGNED_STAFF
    );
    if (useAutomation) return;
    if (!assignee.email) return;
    await sendTaskAssignmentEmail({
      tenantId,
      assignee,
      actor,
      task,
    });
  } catch (err) {
    console.error(
      `[Tasks][assignment-email] failed tenantId=${tenantId} taskId=${task.id} assigneeId=${assignee.id} error=${err?.message || err}`
    );
  }
};

/**
 * Get Monday of the week for a given date (YYYY-MM-DD)
 * @param {Date} d
 * @returns {string}
 */
const getWeekStart = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().slice(0, 10);
};

/**
 * Get todos for the current user
 */
exports.getTodos = async (req, res, next) => {
  try {
    const todos = await UserTodo.findAll({
      where: { userId: req.user.id },
      order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']]
    });
    res.status(200).json({ success: true, data: todos });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new todo
 */
exports.createTodo = async (req, res, next) => {
  try {
    const { title, dueDate } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    const count = await UserTodo.count({ where: { userId: req.user.id } });
    const todo = await UserTodo.create({
      userId: req.user.id,
      title: title.trim(),
      done: false,
      dueDate: dueDate || null,
      sortOrder: count
    });
    res.status(201).json({ success: true, data: todo });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a todo (toggle done, edit title, etc.)
 */
exports.updateTodo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, done, dueDate, sortOrder } = req.body;

    const todo = await UserTodo.findOne({ where: { id, userId: req.user.id } });
    if (!todo) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }

    if (title !== undefined) todo.title = typeof title === 'string' ? title.trim() : todo.title;
    if (done !== undefined) todo.done = Boolean(done);
    if (dueDate !== undefined) todo.dueDate = dueDate || null;
    if (sortOrder !== undefined) todo.sortOrder = parseInt(sortOrder, 10) || 0;

    await todo.save();
    res.status(200).json({ success: true, data: todo });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a todo
 */
exports.deleteTodo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const todo = await UserTodo.findOne({ where: { id, userId: req.user.id } });
    if (!todo) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }
    await todo.destroy();
    res.status(200).json({ success: true, data: { id } });
  } catch (error) {
    next(error);
  }
};

/**
 * Get week focus for the current week
 */
exports.getWeekFocus = async (req, res, next) => {
  try {
    const weekStart = req.query.weekStart || getWeekStart(new Date());
    const focus = await UserWeekFocus.findOne({
      where: { userId: req.user.id, weekStart: weekStart }
    });
    const items = focus ? (focus.items || []) : [];
    res.status(200).json({
      success: true,
      data: { weekStart, items }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update week focus (upsert)
 */
exports.updateWeekFocus = async (req, res, next) => {
  try {
    const weekStart = req.body.weekStart || getWeekStart(new Date());
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    const normalized = items
      .filter((i) => i && typeof i.text === 'string' && i.text.trim())
      .map((i, idx) => ({ text: i.text.trim(), order: idx }));

    const [focus] = await UserWeekFocus.findOrCreate({
      where: { userId: req.user.id, weekStart },
      defaults: { userId: req.user.id, weekStart, items: normalized }
    });

    if (!focus.isNewRecord) {
      focus.items = normalized;
      await focus.save();
    }

    res.status(200).json({
      success: true,
      data: { weekStart, items: focus.items }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get tasks for the current tenant workspace.
 * Returns:
 *  - All non-private tasks for the tenant
 *  - Plus the current user's private tasks
 */
exports.getTasks = async (req, res, next) => {
  try {
    const { status } = req.query;

    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace tasks'
      });
    }

    const where = taskScopeWhere(req, {
      [Op.or]: [
        { isPrivate: false },
        { userId: req.user.id },
        { assigneeId: req.user.id }
      ]
    });

    if (status && typeof status === 'string') {
      where.status = status;
    }

    const tasks = await UserTask.findAll({
      where,
      include: [
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email', 'profilePicture'] },
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'profilePicture'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ success: true, data: tasks });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new workspace task
 */
exports.createTask = async (req, res, next) => {
  try {
    const { title, status, dueDate, startDate, priority, description, isPrivate, assigneeId } = req.body;

    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace tasks'
      });
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    let normalizedStatus = typeof status === 'string' && status.trim()
      ? status.trim()
      : 'todo';
    if (!ALLOWED_TASK_STATUSES.includes(normalizedStatus)) {
      normalizedStatus = 'todo';
    }

    let finalAssigneeId = req.user.id;
    if (assigneeId) {
      const membership = await UserTenant.findOne({
        where: {
          userId: assigneeId,
          tenantId: req.tenantId,
          status: 'active'
        }
      });
      if (!membership) {
        return res.status(400).json({ success: false, message: 'Assignee must be a member of this workspace' });
      }
      finalAssigneeId = assigneeId;
    }

    const calendar = req.body.calendar === undefined ? { enabled: false } : normalizeCalendar(req.body.calendar);
    const task = await UserTask.create(attachScopedToPayload(req, {
      tenantId: req.tenantId,
      userId: req.user.id,
      title: title.trim(),
      status: normalizedStatus,
      startDate: startDate || new Date().toISOString().slice(0, 10),
      dueDate: dueDate || null,
      priority: priority || null,
      description: description || null,
      assigneeId: finalAssigneeId,
      isPrivate: Boolean(isPrivate),
      metadata: {
        calendar,
        activityLog: [
          buildActivityEntry('created', {
            userId: req.user.id,
            userName: req.user.name || req.user.email || 'User',
            summary: 'Task created'
          })
        ]
      }
    }));

    const createdTask = await UserTask.findOne({
      where: taskScopeWhere(req, { id: task.id }),
      include: [
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email', 'profilePicture'] },
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'profilePicture'] }
      ]
    });

    // Notify assignee when a task is explicitly assigned to someone else on creation.
    if (assigneeId && finalAssigneeId && finalAssigneeId !== req.user.id && createdTask?.assignee) {
      notifyTaskAssignee({
        tenantId: req.tenantId,
        task: createdTask,
        assignee: createdTask.assignee,
        actor: req.user,
      }).catch((err) => {
        console.error(
          `[Tasks][assignment-notify] create taskId=${createdTask.id} assigneeId=${createdTask.assignee.id} error=${err?.message || err}`
        );
      });
    }

    res.status(201).json({ success: true, data: createdTask || task });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a workspace task
 * Only the creator can update for now.
 */
exports.updateTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, status, dueDate, startDate, priority, description, isPrivate, assigneeId, checklists, tags } = req.body;

    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace tasks'
      });
    }

    const task = await UserTask.findOne({
      where: taskScopeWhere(req, {
        id,
        [Op.or]: [
          { userId: req.user.id },
          { assigneeId: req.user.id }
        ]
      })
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const previousAssigneeId = task.assigneeId || null;

    const changes = [];
    if (title !== undefined && typeof title === 'string' && title.trim()) {
      if (task.title !== title.trim()) changes.push('title');
      task.title = title.trim();
    }
    if (status !== undefined && typeof status === 'string' && status.trim()) {
      const nextStatus = status.trim();
      if (ALLOWED_TASK_STATUSES.includes(nextStatus) && task.status !== nextStatus) changes.push('status');
      task.status = ALLOWED_TASK_STATUSES.includes(nextStatus) ? nextStatus : task.status;
    }
    if (startDate !== undefined) {
      const nextStart = startDate || null;
      if ((task.startDate || null) !== nextStart) changes.push('startDate');
      task.startDate = nextStart;
    }
    if (dueDate !== undefined) {
      const nextDue = dueDate || null;
      if ((task.dueDate || null) !== nextDue) changes.push('dueDate');
      task.dueDate = dueDate || null;
    }
    if (priority !== undefined) {
      const nextPriority = priority || null;
      if ((task.priority || null) !== nextPriority) changes.push('priority');
      task.priority = priority || null;
    }
    if (description !== undefined) {
      const nextDescription = description || null;
      if ((task.description || null) !== nextDescription) changes.push('description');
      task.description = description || null;
    }
    if (assigneeId !== undefined) {
      if (!assigneeId) {
        if (task.assigneeId !== null) changes.push('assignee');
        task.assigneeId = null;
      } else {
        const membership = await UserTenant.findOne({
          where: {
            userId: assigneeId,
            tenantId: req.tenantId,
            status: 'active'
          }
        });
        if (!membership) {
          return res.status(400).json({ success: false, message: 'Assignee must be a member of this workspace' });
        }
        if (task.assigneeId !== assigneeId) changes.push('assignee');
        task.assigneeId = assigneeId;
      }
    }
    if (isPrivate !== undefined) {
      if (task.isPrivate !== Boolean(isPrivate)) changes.push('isPrivate');
      task.isPrivate = Boolean(isPrivate);
    }

    const metadata = normalizeTaskMetadata(task.metadata);
    let metadataChanged = false;
    if (req.body.calendar !== undefined) {
      metadata.calendar = normalizeCalendar(req.body.calendar);
      metadataChanged = true;
      changes.push('calendar reminder');
    }

    if (checklists !== undefined) {
      const normalized = normalizeTaskChecklistsInput(checklists);
      metadata.checklists = normalized;
      metadataChanged = true;
      changes.push('checklists');
    }

    if (tags !== undefined) {
      const normalizedTags = normalizeTaskTagsInput(tags);
      metadata.tags = normalizedTags;
      metadataChanged = true;
      changes.push('tags');
    }

    if (changes.length > 0) {
      const activityLog = normalizeTaskActivity(metadata);
      const actor = req.user.name || req.user.email || 'User';
      metadata.activityLog = [
        ...activityLog,
        buildActivityEntry('updated', {
          userId: req.user.id,
          userName: actor,
          summary: `Updated ${changes.join(', ')}`,
          changes
        })
      ].slice(-300);
      metadataChanged = true;
    }

    if (metadataChanged) {
      task.set('metadata', metadata);
      task.changed('metadata', true);
    }

    await task.save();

    const updatedTask = await UserTask.findOne({
      where: taskScopeWhere(req, { id: task.id }),
      include: [
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email', 'profilePicture'] },
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'profilePicture'] }
      ]
    });

    const nextAssigneeId = updatedTask?.assigneeId || null;
    const assigneeChanged = previousAssigneeId !== nextAssigneeId;
    if (
      assigneeChanged &&
      nextAssigneeId &&
      nextAssigneeId !== req.user.id &&
      updatedTask?.assignee
    ) {
      notifyTaskAssignee({
        tenantId: req.tenantId,
        task: updatedTask,
        assignee: updatedTask.assignee,
        actor: req.user,
      }).catch((err) => {
        console.error(
          `[Tasks][assignment-notify] update taskId=${updatedTask.id} assigneeId=${updatedTask.assignee.id} error=${err?.message || err}`
        );
      });
    }

    res.status(200).json({ success: true, data: updatedTask || task });
  } catch (error) {
    next(error);
  }
};

/**
 * Get active task members in current tenant.
 */
exports.getTaskMembers = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for task members'
      });
    }

    const members = await UserTenant.findAll({
      where: {
        tenantId: req.tenantId,
        status: 'active'
      },
      attributes: ['userId', 'role'],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'profilePicture']
        }
      ],
      order: [[{ model: User, as: 'user' }, 'name', 'ASC']]
    });

    const data = members
      .filter((m) => m.user)
      .map((m) => ({
        id: m.user.id,
        name: m.user.name || 'Unknown User',
        email: m.user.email || '',
        profilePicture: m.user.profilePicture || '',
        role: m.role || 'staff'
      }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a workspace task
 */
exports.deleteTask = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace tasks'
      });
    }

    const task = await UserTask.findOne({
      where: taskScopeWhere(req, {
        id,
        userId: req.user.id
      })
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    await task.destroy();
    res.status(200).json({ success: true, data: { id } });
  } catch (error) {
    next(error);
  }
};

/**
 * Get task detail (single task) with access checks
 */
exports.getTaskById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace tasks'
      });
    }

    const task = await UserTask.findOne({
      where: taskScopeWhere(req, {
        id,
        [Op.or]: [
          { isPrivate: false },
          { userId: req.user.id },
          { assigneeId: req.user.id }
        ]
      }),
      include: [
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email', 'profilePicture'] },
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'profilePicture'] }
      ]
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.set('Cache-Control', 'no-store');
    res.status(200).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

/**
 * Get comments for one task (stored inside task.metadata.comments)
 */
exports.getTaskComments = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace tasks'
      });
    }

    const task = await UserTask.findOne({
      where: taskScopeWhere(req, {
        id,
        [Op.or]: [
          { isPrivate: false },
          { userId: req.user.id },
          { assigneeId: req.user.id }
        ]
      })
    });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const metadata = normalizeTaskMetadata(task.metadata);
    const comments = normalizeTaskComments(metadata);
    console.log(
      `[Tasks][comments:get] taskId=${id} tenantId=${req.tenantId} userId=${req.user?.id || 'unknown'} comments=${comments.length} activity=${normalizeTaskActivity(metadata).length}`
    );
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ success: true, data: comments });
  } catch (error) {
    next(error);
  }
};

exports.getTaskActivity = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace tasks'
      });
    }

    const task = await UserTask.findOne({
      where: taskScopeWhere(req, {
        id,
        [Op.or]: [
          { isPrivate: false },
          { userId: req.user.id },
          { assigneeId: req.user.id }
        ]
      })
    });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const metadata = normalizeTaskMetadata(task.metadata);
    const activity = normalizeTaskActivity(metadata);
    console.log(
      `[Tasks][activity:get] taskId=${id} tenantId=${req.tenantId} userId=${req.user?.id || 'unknown'} activity=${activity.length} comments=${normalizeTaskComments(metadata).length}`
    );
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ success: true, data: activity });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a comment to task metadata
 */
exports.addTaskComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const text = String(req.body?.text || '').trim();
    console.log(
      `[Tasks][comment:add:start] taskId=${id} tenantId=${req.tenantId || 'unknown'} userId=${req.user?.id || 'unknown'} textLength=${text.length}`
    );
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace tasks'
      });
    }
    if (!text) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    const task = await UserTask.findOne({
      where: taskScopeWhere(req, {
        id,
        [Op.or]: [
          { isPrivate: false },
          { userId: req.user.id },
          { assigneeId: req.user.id }
        ]
      })
    });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const metadata = normalizeTaskMetadata(task.metadata);
    const comments = normalizeTaskComments(metadata);
    const entry = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: text.slice(0, 2000),
      userId: req.user.id,
      userName: req.user.name || req.user.email || 'User',
      userEmail: req.user.email || '',
      createdAt: new Date().toISOString()
    };

    metadata.comments = [...comments, entry].slice(-200);
    const activityLog = normalizeTaskActivity(metadata);
    metadata.activityLog = [
      ...activityLog,
      buildActivityEntry('comment', {
        userId: req.user.id,
        userName: req.user.name || req.user.email || 'User',
        summary: `Commented: ${entry.text.slice(0, 120)}`
      })
    ].slice(-300);
    task.set('metadata', metadata);
    task.changed('metadata', true);
    await task.save();
    console.log(
      `[Tasks][comment:add:done] taskId=${id} commentId=${entry.id} comments=${metadata.comments.length} activity=${metadata.activityLog.length}`
    );

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    console.error(
      `[Tasks][comment:add:error] taskId=${req.params?.id || 'unknown'} tenantId=${req.tenantId || 'unknown'} userId=${req.user?.id || 'unknown'} message=${error?.message || error}`
    );
    next(error);
  }
};

/**
 * Get all checklists for the tenant with visible items for the current user.
 */
exports.getChecklists = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace checklists'
      });
    }

    const checklists = await UserChecklist.findAll({
      where: { tenantId: req.tenantId },
      order: [['createdAt', 'ASC']]
    });

    if (checklists.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const checklistIds = checklists.map((c) => c.id);

    const items = await UserChecklistItem.findAll({
      where: {
        checklistId: { [Op.in]: checklistIds },
        [Op.or]: [
          { isPrivate: false },
          { userId: req.user.id }
        ]
      },
      order: [['order', 'ASC'], ['createdAt', 'ASC']]
    });

    const itemsByChecklist = items.reduce((acc, item) => {
      const key = item.checklistId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const result = checklists.map((cl) => ({
      ...cl.toJSON(),
      items: itemsByChecklist[cl.id] || []
    }));

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new checklist
 */
exports.createChecklist = async (req, res, next) => {
  try {
    const { title } = req.body;

    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace checklists'
      });
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    const checklist = await UserChecklist.create({
      tenantId: req.tenantId,
      userId: req.user.id,
      title: title.trim()
    });

    res.status(201).json({ success: true, data: checklist });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a checklist (e.g. rename)
 */
exports.updateChecklist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace checklists'
      });
    }

    const checklist = await UserChecklist.findOne({
      where: {
        id,
        tenantId: req.tenantId,
        userId: req.user.id
      }
    });

    if (!checklist) {
      return res.status(404).json({ success: false, message: 'Checklist not found' });
    }

    if (title && typeof title === 'string' && title.trim()) {
      checklist.title = title.trim();
    }

    await checklist.save();
    res.status(200).json({ success: true, data: checklist });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a checklist (and its items)
 */
exports.deleteChecklist = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace checklists'
      });
    }

    const checklist = await UserChecklist.findOne({
      where: {
        id,
        tenantId: req.tenantId,
        userId: req.user.id
      }
    });

    if (!checklist) {
      return res.status(404).json({ success: false, message: 'Checklist not found' });
    }

    await checklist.destroy();
    res.status(200).json({ success: true, data: { id } });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a checklist item
 */
exports.createChecklistItem = async (req, res, next) => {
  try {
    const { checklistId } = req.params;
    const { label, isPrivate } = req.body;

    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace checklists'
      });
    }

    if (!label || typeof label !== 'string' || !label.trim()) {
      return res.status(400).json({ success: false, message: 'Label is required' });
    }

    const checklist = await UserChecklist.findOne({
      where: {
        id: checklistId,
        tenantId: req.tenantId
      }
    });

    if (!checklist) {
      return res.status(404).json({ success: false, message: 'Checklist not found' });
    }

    const count = await UserChecklistItem.count({
      where: { checklistId }
    });

    const item = await UserChecklistItem.create({
      checklistId,
      userId: req.user.id,
      label: label.trim(),
      done: false,
      order: count,
      isPrivate: Boolean(isPrivate)
    });

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a checklist item
 */
exports.updateChecklistItem = async (req, res, next) => {
  try {
    const { checklistId, itemId } = req.params;
    const { label, done, order, isPrivate } = req.body;

    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace checklists'
      });
    }

    const item = await UserChecklistItem.findOne({
      where: {
        id: itemId,
        checklistId,
        userId: req.user.id
      }
    });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Checklist item not found' });
    }

    if (label !== undefined && typeof label === 'string' && label.trim()) {
      item.label = label.trim();
    }
    if (done !== undefined) {
      item.done = Boolean(done);
    }
    if (order !== undefined) {
      item.order = parseInt(order, 10) || 0;
    }
    if (isPrivate !== undefined) {
      item.isPrivate = Boolean(isPrivate);
    }

    await item.save();
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a checklist item
 */
exports.deleteChecklistItem = async (req, res, next) => {
  try {
    const { checklistId, itemId } = req.params;

    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required for workspace checklists'
      });
    }

    const item = await UserChecklistItem.findOne({
      where: {
        id: itemId,
        checklistId,
        userId: req.user.id
      }
    });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Checklist item not found' });
    }

    await item.destroy();
    res.status(200).json({ success: true, data: { id: itemId } });
  } catch (error) {
    next(error);
  }
};


