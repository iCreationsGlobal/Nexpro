jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'attachment-1'),
}));

jest.mock('../../../models', () => ({
  Quote: { findOne: jest.fn() },
  QuoteItem: {},
  QuoteActivity: { create: jest.fn() },
  Customer: {},
  User: {},
  Job: {},
  JobItem: {},
  JobStatusHistory: {},
  Invoice: {},
  Sale: {},
  SaleItem: {},
  SaleActivity: {},
  Setting: {},
  Tenant: {},
  Shop: {},
  StudioLocation: {},
}));

jest.mock('../../../services/activityLogger', () => ({}));
jest.mock('../../../utils/taxConfig', () => ({
  getTaxConfigForTenant: jest.fn(),
}));
jest.mock('../../../utils/taxCalculation', () => ({
  computeQuoteTaxSummary: jest.fn(),
  computeDocumentTax: jest.fn(),
}));
jest.mock('../../../utils/documentOrganizationUtils', () => ({
  resolveDocumentOrganization: jest.fn(),
  organizationToEmailCompany: jest.fn(),
}));
jest.mock('../../../utils/resolveQuoteItemCategory', () => ({
  resolveQuoteItemCategory: jest.fn(),
}));
jest.mock('../../../utils/paginationUtils', () => ({
  getPagination: jest.fn(() => ({ page: 1, limit: 20, offset: 0 })),
}));
jest.mock('../../../utils/tenantUtils', () => ({
  applyTenantFilter: jest.fn((tenantId, extra = {}) => ({ tenantId, ...extra })),
  sanitizePayload: jest.fn((payload) => payload),
}));
jest.mock('../../../utils/studioLocationUtils', () => ({
  applyStudioLocationFilter: jest.fn((where) => where),
  attachStudioLocationToPayload: jest.fn((payload) => payload),
  resolveStudioLocationIdForJobFromQuote: jest.fn(),
}));
jest.mock('../../../utils/shopUtils', () => ({
  applyScopedFilters: jest.fn((_req, where) => where),
  attachScopedToPayload: jest.fn((payload) => payload),
  assertShopRecordAccess: jest.fn(),
}));

const { Quote, QuoteActivity } = require('../../../models');
const quoteController = require('../../../controllers/quoteController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('quoteController attachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats attachments without file payload for list responses', () => {
    const formatted = quoteController._formatQuoteResponse({
      id: 'q1',
      quoteNumber: 'QTE-202601-0001',
      title: 'Website build',
      attachments: [{
        id: 'a1',
        type: 'proposal',
        originalName: 'proposal.pdf',
        mimeType: 'application/pdf',
        size: 12,
        fileData: 'data:application/pdf;base64,AAA',
        uploadedAt: '2026-07-20T00:00:00.000Z',
      }],
    }, { includeAttachmentFiles: false });

    expect(formatted.attachments).toHaveLength(1);
    expect(formatted.attachments[0]).toEqual(expect.objectContaining({
      id: 'a1',
      type: 'proposal',
      originalName: 'proposal.pdf',
    }));
    expect(formatted.attachments[0].url).toBeUndefined();
  });

  it('includes attachment urls for detail/public responses', () => {
    const formatted = quoteController._formatQuoteResponse({
      id: 'q1',
      attachments: [{
        id: 'a1',
        type: 'agreement',
        originalName: 'msa.pdf',
        fileData: 'data:application/pdf;base64,BBB',
      }],
    });

    expect(formatted.attachments[0].url).toBe('data:application/pdf;base64,BBB');
  });

  it('uploads a typed attachment onto a draft quote', async () => {
    const quote = {
      id: 'quote-1',
      status: 'draft',
      attachments: [],
      changed: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    Quote.findOne.mockResolvedValue(quote);
    QuoteActivity.create.mockResolvedValue({});

    const req = {
      params: { id: 'quote-1' },
      tenantId: 'tenant-1',
      body: { type: 'proposal' },
      file: {
        originalname: 'proposal.pdf',
        mimetype: 'application/pdf',
        size: 100,
        buffer: Buffer.from('hello'),
      },
      user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' },
    };
    const res = mockRes();
    const next = jest.fn();

    await quoteController.uploadQuoteAttachment(req, res, next);

    expect(quote.save).toHaveBeenCalled();
    expect(QuoteActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Attachment added',
      metadata: expect.objectContaining({ attachmentType: 'proposal' }),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        id: 'attachment-1',
        type: 'proposal',
        originalName: 'proposal.pdf',
      }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects attachment upload on accepted quotes', async () => {
    Quote.findOne.mockResolvedValue({
      id: 'quote-1',
      status: 'accepted',
      attachments: [],
    });

    const req = {
      params: { id: 'quote-1' },
      tenantId: 'tenant-1',
      body: { type: 'proposal' },
      file: { originalname: 'a.pdf', mimetype: 'application/pdf', size: 1, buffer: Buffer.from('x') },
    };
    const res = mockRes();
    const next = jest.fn();

    await quoteController.uploadQuoteAttachment(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('draft or sent'),
    }));
  });

  it('deletes an attachment by id', async () => {
    const quote = {
      id: 'quote-1',
      status: 'sent',
      attachments: [{
        id: 'attachment-1',
        type: 'requirements',
        originalName: 'sow.pdf',
      }],
      changed: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    Quote.findOne.mockResolvedValue(quote);
    QuoteActivity.create.mockResolvedValue({});

    const req = {
      params: { id: 'quote-1', attachmentId: 'attachment-1' },
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
    };
    const res = mockRes();
    const next = jest.fn();

    await quoteController.deleteQuoteAttachment(req, res, next);

    expect(quote.attachments).toEqual([]);
    expect(quote.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      attachments: [],
    }));
  });
});
