const { Lead, Job, Sale, Customer, Setting, Tenant, JobStatusHistory, Shop, StudioLocation, SalesAgent } = require('../models');
const { Op } = require('sequelize');
const emailService = require('../services/emailService');
const salesAgentService = require('../services/salesAgentService');
const { formatToE164, normalizePhoneNumber } = require('../utils/phoneUtils');
const { resolveBusinessType } = require('../config/businessTypes');
const { getTenantLogoUrl } = require('../utils/tenantLogo');
const { resolveDocumentOrganization } = require('../utils/documentOrganizationUtils');

const FEATURE_REQUEST_RECIPIENT_EMAIL = (
  process.env.FEATURE_REQUEST_EMAIL || 'info@absghana.com'
).trim().toLowerCase();
const SALES_AGENT_APPLICATION_RECIPIENT_EMAIL = (
  process.env.SALES_AGENT_APPLICATION_EMAIL || process.env.FEATURE_REQUEST_EMAIL || 'info@absghana.com'
).trim().toLowerCase();

const JOB_INVOICE_TRACK_DEFAULTS = {
  customerJobTrackingEnabled: false
};

/** @param {{ deliveryStatus?: string|null, deliveryRequired?: boolean }} job */
function publicTimelineKindForJob(job) {
  if (job?.deliveryRequired === true) return 'delivery';
  return job?.deliveryStatus ? 'delivery' : 'job';
}

/** @param {{ metadata?: object }} tenant @param {{ deliveryStatus?: string|null, orderStatus?: string|null }} sale */
function publicTimelineKindForSale(tenant, sale) {
  if (sale?.deliveryStatus) return 'delivery';
  const shopType =
    tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata.shopType : null;
  if (shopType === 'restaurant' && sale?.orderStatus) return 'kitchen';
  return 'order';
}
/** Same outcome for wrong slug / wrong combo — do not reveal which failed. */
const LOOKUP_NO_MATCH_MESSAGE = 'No match found';
const LOOKUP_NO_MATCH_HINT = 'Check your ID and phone, then try again—or contact the business.';

const LOOKUP_PHONE_INVALID_MESSAGE = 'Check your phone number';
const LOOKUP_PHONE_INVALID_HINT = 'Try adding your country code (e.g. +233).';

function lookupNoMatchResponse() {
  return {
    success: false,
    message: LOOKUP_NO_MATCH_MESSAGE,
    hint: LOOKUP_NO_MATCH_HINT
  };
}

function lookupPhoneInvalidResponse() {
  return {
    success: false,
    message: LOOKUP_PHONE_INVALID_MESSAGE,
    hint: LOOKUP_PHONE_INVALID_HINT
  };
}

function normalizeLookupPhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;

  const e164 = formatToE164(trimmed);
  const normalized = normalizePhoneNumber(trimmed);
  const normalizedNoPlus = normalized.replace(/^\+/, '');

  const candidates = new Set(
    [trimmed, normalized, e164, normalizedNoPlus].filter(Boolean)
  );

  return Array.from(candidates);
}

function buildOrganizationPublicPayload(organization, tenant) {
  const phone = typeof organization?.phone === 'string' ? organization.phone.trim().slice(0, 50) : '';
  const email = typeof organization?.email === 'string' ? organization.email.trim().slice(0, 255) : '';
  return {
    name: organization?.name || tenant?.name || '',
    logoUrl: organization?.logoUrl || getTenantLogoUrl(tenant),
    primaryColor: organization?.primaryColor || tenant?.metadata?.primaryColor || '#166534',
    phone: phone || null,
    email: email || null,
  };
}

function buildSafeCustomer(customer) {
  if (!customer) return null;
  return {
    name: customer.name || customer.company || 'Customer'
  };
}

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toDisplay = (value, fallback = 'N/A') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

/**
 * Submit a demo booking from the marketing site. Creates an admin lead (control center)
 * so platform admins can see and follow up. No auth required.
 * POST /api/public/demo-booking
 * Body: { name, email, phone, preferredDate?, preferredTime? }
 */
exports.submitDemoBooking = async (req, res, next) => {
  try {
    const { name, email, phone, preferredDate, preferredTime } = req.body || {};

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';

    if (!trimmedName || trimmedName.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Name must be at least 2 characters',
        errorCode: 'VALIDATION_ERROR'
      });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Valid email is required',
        errorCode: 'VALIDATION_ERROR'
      });
    }
    if (!trimmedPhone || trimmedPhone.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required (at least 6 characters)',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    const notes = [preferredDate, preferredTime].filter(Boolean).length
      ? `Demo requested: ${[preferredDate, preferredTime].filter(Boolean).join(' at ')}`
      : 'Demo requested from website';

    const lead = await Lead.create({
      tenantId: null,
      name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      source: 'website_demo',
      status: 'new',
      priority: 'medium',
      notes: notes || null,
      metadata: {
        preferredDate: preferredDate || null,
        preferredTime: preferredTime || null,
        source: 'website_demo'
      },
      createdBy: null
    });

    res.status(201).json({
      success: true,
      data: { id: lead.id }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit a feature request / idea from the marketing site.
 * POST /api/public/feature-request
 * Body: { name, email, problem }
 */
exports.submitFeatureRequest = async (req, res, next) => {
  try {
    const { name, email, problem } = req.body || {};

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const trimmedProblem = typeof problem === 'string' ? problem.trim() : '';

    if (!trimmedName || trimmedName.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Name must be at least 2 characters',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Valid email is required',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    if (!trimmedProblem || trimmedProblem.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Please describe your problem or feature need (at least 10 characters)',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    const lead = await Lead.create({
      tenantId: null,
      name: trimmedName,
      email: trimmedEmail,
      phone: null,
      source: 'website_feature_request',
      status: 'new',
      priority: 'medium',
      notes: trimmedProblem,
      metadata: {
        source: 'website_feature_request',
        recipientEmail: FEATURE_REQUEST_RECIPIENT_EMAIL
      },
      createdBy: null
    });

    const subject = `New ABS website idea from ${trimmedName}`;
    const html = `
      <h2>New feature request / idea</h2>
      <p>A visitor submitted an idea from the ABS marketing site.</p>
      <ul>
        <li><strong>Name:</strong> ${escapeHtml(toDisplay(trimmedName))}</li>
        <li><strong>Email:</strong> ${escapeHtml(toDisplay(trimmedEmail))}</li>
        <li><strong>Lead ID:</strong> ${escapeHtml(toDisplay(lead.id))}</li>
      </ul>
      <h3>Idea / problem</h3>
      <p>${escapeHtml(trimmedProblem).replace(/\n/g, '<br>')}</p>
    `.trim();
    const text = [
      'New feature request / idea',
      '',
      `Name: ${toDisplay(trimmedName)}`,
      `Email: ${toDisplay(trimmedEmail)}`,
      `Lead ID: ${toDisplay(lead.id)}`,
      '',
      'Idea / problem:',
      trimmedProblem
    ].join('\n');

    const emailResult = await emailService.sendPlatformMessage(
      FEATURE_REQUEST_RECIPIENT_EMAIL,
      subject,
      html,
      text,
      [],
      {
        categories: ['website', 'feature-request'],
        context: {
          requestId: req.id || req.headers?.['x-request-id'],
          source: 'website_feature_request',
        },
      }
    );

    if (!emailResult?.success) {
      console.error('[FeatureRequest] Email delivery failed', {
        leadId: lead.id,
        recipient: emailService.maskEmail(FEATURE_REQUEST_RECIPIENT_EMAIL),
        error: emailResult?.error || 'Unknown error',
      });
      return res.status(502).json({
        success: false,
        error: 'We could not send your request right now. Please try again.',
        errorCode: 'EMAIL_DELIVERY_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: { id: lead.id }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit a sales agent application from the marketing site.
 * POST /api/public/sales-agent-application
 * Body: { name, phone, email, cityRegion, experience?, whyJoin? }
 */
exports.submitSalesAgentApplication = async (req, res, next) => {
  try {
    const { name, phone, email, cityRegion, experience, whyJoin } = req.body || {};

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const trimmedCityRegion = typeof cityRegion === 'string' ? cityRegion.trim() : '';
    const trimmedExperience = typeof experience === 'string' ? experience.trim() : '';
    const trimmedWhyJoin = typeof whyJoin === 'string' ? whyJoin.trim() : '';

    if (!trimmedName || trimmedName.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Name must be at least 2 characters',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    if (!trimmedPhone || trimmedPhone.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Phone or WhatsApp number is required (at least 6 characters)',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Valid email is required',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    if (!trimmedCityRegion || trimmedCityRegion.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'City or region is required',
        errorCode: 'VALIDATION_ERROR'
      });
    }

    const notes = [
      `City/Region: ${trimmedCityRegion}`,
      trimmedExperience ? `Experience: ${trimmedExperience}` : null,
      trimmedWhyJoin ? `Why they want to join: ${trimmedWhyJoin}` : null
    ].filter(Boolean).join('\n\n');

    const lead = await Lead.create({
      tenantId: null,
      name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      source: 'website_sales_agent_application',
      status: 'new',
      priority: 'medium',
      notes,
      tags: ['sales-agent'],
      metadata: {
        source: 'website_sales_agent_application',
        cityRegion: trimmedCityRegion,
        experience: trimmedExperience || null,
        whyJoin: trimmedWhyJoin || null,
        recipientEmail: SALES_AGENT_APPLICATION_RECIPIENT_EMAIL
      },
      createdBy: null
    });

    let salesAgentStatusLine = null;
    try {
      const existingAgent = await SalesAgent.findOne({ where: { email: trimmedEmail } });
      if (existingAgent) {
        salesAgentStatusLine = `Already exists (status: ${existingAgent.status})`;
      } else {
        await salesAgentService.createSalesAgent({
          name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone,
          status: 'pending',
          notes,
          leadId: lead.id,
          metadata: {
            source: 'website_sales_agent_application',
            cityRegion: trimmedCityRegion,
            experience: trimmedExperience || null,
            whyJoin: trimmedWhyJoin || null
          },
          createCode: false
        }, {});
        salesAgentStatusLine = 'Created (pending review in Admin > Sales Agents)';
      }
    } catch (salesAgentError) {
      console.error('[SalesAgentApplication] Failed to auto-create pending sales agent', {
        leadId: lead.id,
        email: emailService.maskEmail(trimmedEmail),
        error: salesAgentError?.message || salesAgentError,
      });
      salesAgentStatusLine = null;
    }

    const subject = `New ABS sales agent application from ${trimmedName}`;
    const html = `
      <h2>New ABS sales agent application</h2>
      <p>A visitor applied to help shops, studios, and pharmacies go digital with ABS.</p>
      <ul>
        <li><strong>Name:</strong> ${escapeHtml(toDisplay(trimmedName))}</li>
        <li><strong>Phone / WhatsApp:</strong> ${escapeHtml(toDisplay(trimmedPhone))}</li>
        <li><strong>Email:</strong> ${escapeHtml(toDisplay(trimmedEmail))}</li>
        <li><strong>City / Region:</strong> ${escapeHtml(toDisplay(trimmedCityRegion))}</li>
        <li><strong>Lead ID:</strong> ${escapeHtml(toDisplay(lead.id))}</li>
        ${salesAgentStatusLine ? `<li><strong>Sales Agent record:</strong> ${escapeHtml(salesAgentStatusLine)}</li>` : ''}
      </ul>
      <h3>Experience</h3>
      <p>${escapeHtml(toDisplay(trimmedExperience, 'Not provided')).replace(/\n/g, '<br>')}</p>
      <h3>Why they want to join</h3>
      <p>${escapeHtml(toDisplay(trimmedWhyJoin, 'Not provided')).replace(/\n/g, '<br>')}</p>
    `.trim();
    const text = [
      'New ABS sales agent application',
      '',
      `Name: ${toDisplay(trimmedName)}`,
      `Phone / WhatsApp: ${toDisplay(trimmedPhone)}`,
      `Email: ${toDisplay(trimmedEmail)}`,
      `City / Region: ${toDisplay(trimmedCityRegion)}`,
      `Lead ID: ${toDisplay(lead.id)}`,
      salesAgentStatusLine ? `Sales Agent record: ${salesAgentStatusLine}` : null,
      '',
      'Experience:',
      toDisplay(trimmedExperience, 'Not provided'),
      '',
      'Why they want to join:',
      toDisplay(trimmedWhyJoin, 'Not provided')
    ].filter((line) => line !== null).join('\n');

    const emailResult = await emailService.sendPlatformMessage(
      SALES_AGENT_APPLICATION_RECIPIENT_EMAIL,
      subject,
      html,
      text,
      [],
      {
        categories: ['website', 'sales-agent-application'],
        context: {
          requestId: req.id || req.headers?.['x-request-id'],
          source: 'website_sales_agent_application',
        },
      }
    );

    if (!emailResult?.success) {
      console.error('[SalesAgentApplication] Email delivery failed', {
        leadId: lead.id,
        recipient: emailService.maskEmail(SALES_AGENT_APPLICATION_RECIPIENT_EMAIL),
        error: emailResult?.error || 'Unknown error',
      });
      return res.status(502).json({
        success: false,
        error: 'We could not send your application right now. Please try again.',
        errorCode: 'EMAIL_DELIVERY_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: { id: lead.id }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Public job tracking (no login). Requires tenant to enable customer job tracking.
 * GET /api/public/jobs/track/:token
 */
exports.getJobTrackByToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token || typeof token !== 'string' || token.length < 16) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const job = await Job.findOne({
      where: {
        viewToken: token,
        tenantId: { [Op.ne]: null }
      },
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'company']
        },
        { model: StudioLocation, as: 'studioLocation', required: false }
      ]
    });

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const settingRow = await Setting.findOne({ where: { tenantId: job.tenantId, key: 'job-invoice' } });
    const flags = { ...JOB_INVOICE_TRACK_DEFAULTS, ...(settingRow?.value || {}) };
    if (flags.customerJobTrackingEnabled !== true) {
      return res.status(404).json({
        success: false,
        message: 'This tracking link is not available.'
      });
    }

    const tenant = await Tenant.findByPk(job.tenantId, {
      attributes: ['id', 'name', 'metadata']
    });
    const organization = await resolveDocumentOrganization({
      tenantId: job.tenantId,
      studioLocation: job.studioLocation || null,
    });

    const latestInProgressHistory = await JobStatusHistory.findOne({
      where: {
        jobId: job.id,
        tenantId: job.tenantId,
        status: 'in_progress'
      },
      order: [['createdAt', 'DESC']],
      attributes: ['createdAt']
    });
    const inProgressAt = latestInProgressHistory?.createdAt || null;

    const safeJob = {
      jobNumber: job.jobNumber,
      title: job.title,
      status: job.status,
      deliveryRequired: job.deliveryRequired === true,
      deliveryStatus: job.deliveryStatus || null,
      timelineKind: publicTimelineKindForJob(job),
      priority: job.priority,
      orderDate: job.orderDate,
      startDate: job.startDate,
      inProgressAt,
      dueDate: job.dueDate,
      completionDate: job.completionDate,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      customer: job.customer
        ? { name: job.customer.name, company: job.customer.company }
        : null
    };

    res.status(200).json({
      success: true,
      data: {
        job: safeJob,
        organization: buildOrganizationPublicPayload(organization, tenant)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Branding for public slug tracking page (no login). No PII when tracking is disabled.
 * GET /api/public/track/:tenantSlug/branding
 */
exports.getPublicTrackBranding = async (req, res, next) => {
  try {
    const { tenantSlug } = req.params;
    if (!tenantSlug) {
      return res.status(404).json({ success: false, message: 'Not found.' });
    }

    const tenant = await Tenant.findOne({
      where: { slug: tenantSlug },
      attributes: ['id', 'name', 'metadata', 'businessType']
    });

    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Not found.' });
    }

    const flags = await Setting.findOne({ where: { tenantId: tenant.id, key: 'job-invoice' } });
    const trackingSettings = { ...JOB_INVOICE_TRACK_DEFAULTS, ...(flags?.value || {}) };
    if (trackingSettings.customerJobTrackingEnabled !== true) {
      return res.status(200).json({
        success: true,
        data: { trackingEnabled: false }
      });
    }

    const organizationRow = await Setting.findOne({ where: { tenantId: tenant.id, key: 'organization' } });
    const organization = buildOrganizationPublicPayload(organizationRow?.value, tenant);

    res.status(200).json({
      success: true,
      data: {
        trackingEnabled: true,
        organization,
        businessType: tenant.businessType || null,
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Public lookup page submit (no login).
 * POST /api/public/track/:tenantSlug/lookup
 * Body: { trackingId, phone }
 */
exports.lookupPublicTracking = async (req, res, next) => {
  try {
    const { tenantSlug } = req.params;
    const trackingId = typeof req.body?.trackingId === 'string' ? req.body.trackingId.trim() : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

    if (!tenantSlug || !trackingId || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Missing details',
        hint: 'Enter your ID and phone.'
      });
    }

    const tenant = await Tenant.findOne({
      where: { slug: tenantSlug },
      attributes: ['id', 'name', 'slug', 'businessType', 'metadata']
    });

    if (!tenant) {
      return res.status(404).json(lookupNoMatchResponse());
    }

    const flags = await Setting.findOne({ where: { tenantId: tenant.id, key: 'job-invoice' } });
    const trackingSettings = { ...JOB_INVOICE_TRACK_DEFAULTS, ...(flags?.value || {}) };
    if (trackingSettings.customerJobTrackingEnabled !== true) {
      return res.status(404).json({
        success: false,
        message: 'Tracking unavailable',
        hint: 'Contact the business.'
      });
    }

    const phoneCandidates = normalizeLookupPhone(phone);
    if (!phoneCandidates || phoneCandidates.length === 0) {
      return res.status(404).json(lookupPhoneInvalidResponse());
    }

    const effectiveBusinessType = resolveBusinessType(tenant.businessType);

    if (effectiveBusinessType === 'studio') {
      const job = await Job.findOne({
        where: {
          tenantId: tenant.id,
          jobNumber: trackingId
        },
        include: [{
          model: Customer,
          as: 'customer',
          attributes: ['name', 'company', 'phone'],
          where: {
            [Op.or]: [
              { phone: { [Op.in]: phoneCandidates } },
              { phone: { [Op.in]: phoneCandidates.map((value) => value.replace(/^\+/, '')) } }
            ]
          }
        }, { model: StudioLocation, as: 'studioLocation', required: false }]
      });

      if (!job) {
        return res.status(404).json(lookupNoMatchResponse());
      }

      const organization = buildOrganizationPublicPayload(
        await resolveDocumentOrganization({
          tenantId: tenant.id,
          studioLocation: job.studioLocation || null,
        }),
        tenant
      );

      const lookupLatestInProgress = await JobStatusHistory.findOne({
        where: {
          jobId: job.id,
          tenantId: tenant.id,
          status: 'in_progress'
        },
        order: [['createdAt', 'DESC']],
        attributes: ['createdAt']
      });

      return res.status(200).json({
        success: true,
        data: {
          organization,
          tracking: {
            kind: 'job',
            timelineKind: publicTimelineKindForJob(job),
            idLabel: 'Job ID',
            idValue: job.jobNumber,
            status: job.status,
            deliveryRequired: job.deliveryRequired === true,
            deliveryStatus: job.deliveryStatus || null,
            orderStatus: null,
            titleOrSummary: job.title || 'Job',
            orderDate: job.orderDate || null,
            startDate: job.startDate || null,
            inProgressAt: lookupLatestInProgress?.createdAt || null,
            dueDate: job.dueDate || null,
            completionDate: job.completionDate || null,
            createdAt: job.createdAt || null,
            updatedAt: job.updatedAt || null
          },
          customer: buildSafeCustomer(job.customer)
        }
      });
    }

    const sale = await Sale.findOne({
      where: {
        tenantId: tenant.id,
        saleNumber: trackingId
      },
      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['name', 'company', 'phone'],
        where: {
          [Op.or]: [
            { phone: { [Op.in]: phoneCandidates } },
            { phone: { [Op.in]: phoneCandidates.map((value) => value.replace(/^\+/, '')) } }
          ]
        }
      }, { model: Shop, as: 'shop', required: false }],
      order: [['createdAt', 'DESC']]
    });

    if (!sale) {
      return res.status(404).json(lookupNoMatchResponse());
    }

    const summary = sale.notes || `Order total: ${sale.total || '0.00'}`;
    const organization = buildOrganizationPublicPayload(
      await resolveDocumentOrganization({
        tenantId: tenant.id,
        shop: sale.shop || null,
      }),
      tenant
    );

    return res.status(200).json({
      success: true,
      data: {
        organization,
        tracking: {
          kind: 'order',
          timelineKind: publicTimelineKindForSale(tenant, sale),
          idLabel: 'Order ID',
          idValue: sale.saleNumber,
          status: sale.orderStatus || sale.status,
          deliveryStatus: sale.deliveryStatus || null,
          orderStatus: sale.orderStatus || null,
          titleOrSummary: summary,
          orderDate: sale.createdAt || null,
          startDate: null,
          dueDate: null,
          completionDate: sale.status === 'completed' ? sale.updatedAt : null,
          createdAt: sale.createdAt || null,
          updatedAt: sale.updatedAt || null
        },
        customer: buildSafeCustomer(sale.customer)
      }
    });
  } catch (error) {
    next(error);
  }
};
