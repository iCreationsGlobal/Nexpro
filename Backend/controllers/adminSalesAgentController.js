const salesAgentService = require('../services/salesAgentService');

const sendServiceError = (res, error) => {
  const status = error.statusCode || 500;
  return res.status(status).json({
    success: false,
    error: error.message || 'Unexpected error',
    errorCode: error.errorCode || (status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR'),
  });
};

/**
 * GET /api/admin/sales-agents
 */
exports.listSalesAgents = async (req, res, next) => {
  try {
    const result = await salesAgentService.listSalesAgents(req.query || {});
    return res.json({
      success: true,
      data: result.data,
      count: result.count,
      page: result.page,
      limit: result.limit,
    });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    return next(error);
  }
};

/**
 * GET /api/admin/sales-agents/:id
 */
exports.getSalesAgent = async (req, res, next) => {
  try {
    const detail = await salesAgentService.getSalesAgentDetail(req.params.id);
    return res.json({
      success: true,
      data: {
        ...detail.agent.toJSON(),
        tenants: detail.tenants,
        commissions: detail.commissions,
      },
    });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    return next(error);
  }
};

/**
 * POST /api/admin/sales-agents
 * Body: { name, email?, phone?, status?, commissionPercent?, notes?, code?, createCode? }
 */
exports.createSalesAgent = async (req, res, next) => {
  try {
    const { agent, code } = await salesAgentService.createSalesAgent(req.body || {}, {
      approvedBy: req.user?.id,
    });
    return res.status(201).json({
      success: true,
      data: {
        ...agent.toJSON(),
        codes: code ? [code] : [],
      },
    });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    return next(error);
  }
};

/**
 * PATCH /api/admin/sales-agents/:id
 */
exports.updateSalesAgent = async (req, res, next) => {
  try {
    const agent = await salesAgentService.updateSalesAgent(req.params.id, req.body || {}, {
      approvedBy: req.user?.id,
    });
    return res.json({ success: true, data: agent });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    return next(error);
  }
};

/**
 * POST /api/admin/sales-agents/:id/approve
 * Convenience: set status active and ensure a code exists.
 */
exports.approveSalesAgent = async (req, res, next) => {
  try {
    const agent = await salesAgentService.updateSalesAgent(
      req.params.id,
      { status: 'active' },
      { approvedBy: req.user?.id }
    );

    const detail = await salesAgentService.getSalesAgentDetail(agent.id);
    let code = detail.agent.codes?.find((c) => c.status === 'active') || null;
    if (!code) {
      code = await salesAgentService.createAgentCode(agent.id, {
        code: req.body?.code,
        label: req.body?.codeLabel || 'Primary',
      });
    }

    return res.json({
      success: true,
      data: {
        ...agent.toJSON(),
        codes: code ? [code] : detail.agent.codes || [],
      },
    });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    return next(error);
  }
};

/**
 * POST /api/admin/sales-agents/:id/codes
 */
exports.createSalesAgentCode = async (req, res, next) => {
  try {
    const code = await salesAgentService.createAgentCode(req.params.id, req.body || {});
    return res.status(201).json({ success: true, data: code });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    return next(error);
  }
};

/**
 * PATCH /api/admin/sales-agents/codes/:codeId
 * Body: { status: 'active' | 'disabled' }
 */
exports.updateSalesAgentCode = async (req, res, next) => {
  try {
    const status = req.body?.status;
    const code = await salesAgentService.setAgentCodeStatus(req.params.codeId, status);
    return res.json({ success: true, data: code });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    return next(error);
  }
};

/**
 * PATCH /api/admin/sales-agents/commissions/:commissionId
 * Body: { status: 'due' | 'paid', notes? }
 */
exports.updateSalesAgentCommission = async (req, res, next) => {
  try {
    const commission = await salesAgentService.setCommissionStatus(
      req.params.commissionId,
      req.body?.status,
      {
        paidBy: req.user?.id,
        notes: req.body?.notes,
      }
    );
    return res.json({ success: true, data: commission });
  } catch (error) {
    if (error.statusCode) return sendServiceError(res, error);
    return next(error);
  }
};
