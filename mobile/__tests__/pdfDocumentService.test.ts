const mockCopy = jest.fn();
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///cache/Print/abc.pdf' })) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: jest.fn().mockImplementation((...parts: string[]) => ({
    uri: parts.join('/'),
    copy: mockCopy,
  })),
}));
jest.mock('@/services/api', () => ({ API_BASE_URL: 'https://api.example.com' }));
jest.mock('@/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import * as Sharing from 'expo-sharing';
import { shareReceiptPdf } from '@/services/pdfDocumentService';

const SALE = { id: 's1', saleNumber: 'SALE-0001', total: 10, items: [] };

describe('receipt PDF', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shares the receipt only after its named copy is written', async () => {
    let finishCopy: () => void = () => {};
    mockCopy.mockImplementation(() => new Promise<void>((resolve) => { finishCopy = resolve; }));

    const sharing = shareReceiptPdf(SALE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockCopy).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///cache/SALE-0001.pdf' }), { overwrite: true });
    expect(Sharing.shareAsync).not.toHaveBeenCalled();

    finishCopy();
    await sharing;
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/SALE-0001.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
  });

  it('reports a failed copy instead of sharing a missing file', async () => {
    mockCopy.mockRejectedValue(new Error('disk full'));
    await expect(shareReceiptPdf(SALE)).rejects.toThrow('disk full');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});
