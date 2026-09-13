import {
  buildLocalInvoicePaymentLink,
  formatInvoiceShareContent,
} from '@/utils/invoiceShareMessage';

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn() },
  Platform: { OS: 'android' },
  Share: {
    share: jest.fn(),
    dismissedAction: 'dismissedAction',
  },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/services/invoiceService', () => ({
  invoiceService: {
    ensurePaymentLink: jest.fn(),
  },
}));

jest.mock('@/services/pdfDocumentService', () => ({
  getInvoicePdfFilename: jest.fn(() => 'INV-001.pdf'),
  prepareInvoicePdf: jest.fn(),
}));

jest.mock('@/utils/whatsapp', () => ({
  normalizePhoneForWhatsApp: jest.fn((phone: string) => phone),
  openWhatsAppChat: jest.fn(),
  getCountryCallingCodeFromPhone: jest.fn(),
}));

import * as Sharing from 'expo-sharing';
import { invoiceService } from '@/services/invoiceService';
import { prepareInvoicePdf } from '@/services/pdfDocumentService';
import { shareInvoiceViaWhatsApp } from '@/utils/invoiceShare';
import { openWhatsAppChat } from '@/utils/whatsapp';

describe('invoiceShareMessage', () => {
  it('builds a local payment link from token', () => {
    expect(buildLocalInvoicePaymentLink('abc123')).toContain('/pay-invoice/abc123');
  });

  it('formats unpaid invoice share message with balance and payment link', () => {
    const content = formatInvoiceShareContent(
      {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        totalAmount: 150,
        amountPaid: 50,
        status: 'sent',
        customer: { name: 'Jane Doe' },
      },
      'https://myapp.example.com/pay-invoice/token',
      'ABS Hardware'
    );

    expect(content.subject).toBe('Invoice INV-001');
    expect(content.message).toContain('Hi Jane Doe');
    expect(content.message).toContain('INV-001');
    expect(content.message).toContain('₵');
    expect(content.message).toContain('Balance due');
    expect(content.message).toContain('https://myapp.example.com/pay-invoice/token');
  });

  it('formats paid invoice share message without payment link', () => {
    const content = formatInvoiceShareContent(
      {
        id: 'inv-2',
        invoiceNumber: 'INV-002',
        totalAmount: 80,
        status: 'paid',
        customer: { name: 'John Smith' },
      },
      'https://myapp.example.com/pay-invoice/token',
      'ABS Hardware'
    );

    expect(content.message).toContain('has been paid');
    expect(content.message).not.toContain('Pay here');
  });
});

describe('shareInvoiceViaWhatsApp', () => {
  const invoice = {
    id: 'inv-1',
    invoiceNumber: 'INV-001',
    totalAmount: 150,
    status: 'sent',
    customer: { name: 'Jane Doe', phone: '0241234567' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(invoiceService.ensurePaymentLink).mockResolvedValue({
      data: { paymentLink: 'https://myapp.example.com/pay-invoice/token' },
    });
    jest.mocked(prepareInvoicePdf).mockResolvedValue({
      uri: 'file:///cache/INV-001.pdf',
      filename: 'INV-001.pdf',
      title: 'Invoice INV-001',
    });
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
    jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined);
    jest.mocked(openWhatsAppChat).mockResolvedValue(true);
  });

  it('shares the invoice PDF via the native share sheet when available', async () => {
    const result = await shareInvoiceViaWhatsApp(invoice, { businessName: 'ABS Hardware' });

    expect(result).toBe(true);
    expect(prepareInvoicePdf).toHaveBeenCalledWith(
      invoice,
      expect.objectContaining({
        footerNote: expect.stringContaining('INV-001'),
      })
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/INV-001.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' })
    );
    expect(openWhatsAppChat).not.toHaveBeenCalled();
  });

  it('falls back to text-only WhatsApp when PDF sharing is unavailable', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);

    const result = await shareInvoiceViaWhatsApp(invoice, { businessName: 'ABS Hardware' });

    expect(result).toBe(true);
    expect(openWhatsAppChat).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '0241234567',
        message: expect.stringContaining('INV-001'),
      })
    );
  });

  it('falls back to text-only WhatsApp when PDF generation fails', async () => {
    jest.mocked(prepareInvoicePdf).mockRejectedValue(new Error('print failed'));

    const result = await shareInvoiceViaWhatsApp(invoice, { businessName: 'ABS Hardware' });

    expect(result).toBe(true);
    expect(openWhatsAppChat).toHaveBeenCalled();
  });
});
