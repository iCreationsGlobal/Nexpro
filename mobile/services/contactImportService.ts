import { api } from './api';
import { buildScopedQueryString } from '@/utils/shopScope';

export type ContactImportDestination = 'customers' | 'leads';

export type ContactImportItem = {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
  source?: string;
};

export type ContactImportResult = {
  success?: boolean;
  successCount?: number;
  skippedCount?: number;
  errorCount?: number;
  errors?: Array<{ row: number; message: string }>;
  skipped?: Array<{ row: number; message: string }>;
  message?: string;
};

const CONTACT_IMPORT_BATCH_SIZE = 50;

function mergeImportResults(
  aggregate: ContactImportResult,
  batch: ContactImportResult
): ContactImportResult {
  return {
    success: aggregate.success !== false && batch.success !== false,
    successCount: (aggregate.successCount || 0) + (batch.successCount || 0),
    skippedCount: (aggregate.skippedCount || 0) + (batch.skippedCount || 0),
    errorCount: (aggregate.errorCount || 0) + (batch.errorCount || 0),
    errors: [...(aggregate.errors || []), ...(batch.errors || [])],
    skipped: [...(aggregate.skipped || []), ...(batch.skipped || [])],
  };
}

async function postContactImportBatch(
  destination: ContactImportDestination,
  contacts: ContactImportItem[]
): Promise<ContactImportResult> {
  const query = await buildScopedQueryString({});
  const res = await api.post(
    query ? `/contacts/import?${query}` : '/contacts/import',
    { destination, contacts },
    { timeout: 60000 }
  );
  return (res.data as ContactImportResult) ?? res.data;
}

export const contactImportService = {
  importFromContacts: async (
    destination: ContactImportDestination,
    contacts: ContactImportItem[]
  ): Promise<ContactImportResult> => {
    if (contacts.length <= CONTACT_IMPORT_BATCH_SIZE) {
      return postContactImportBatch(destination, contacts);
    }

    let aggregate: ContactImportResult = {
      success: true,
      successCount: 0,
      skippedCount: 0,
      errorCount: 0,
      errors: [],
      skipped: [],
    };

    for (let offset = 0; offset < contacts.length; offset += CONTACT_IMPORT_BATCH_SIZE) {
      const batch = contacts.slice(offset, offset + CONTACT_IMPORT_BATCH_SIZE);
      const result = await postContactImportBatch(destination, batch);
      aggregate = mergeImportResults(aggregate, result);
    }

    return aggregate;
  },

  importFromFile: async (
    destination: ContactImportDestination,
    file: { uri: string; name: string; mimeType?: string | null }
  ): Promise<ContactImportResult> => {
    const query = await buildScopedQueryString({});
    const path = destination === 'leads' ? '/leads/import' : '/customers/import';
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name || 'contacts.csv',
      type: file.mimeType || 'text/csv',
    } as unknown as Blob);

    const res = await api.post(query ? `${path}?${query}` : path, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return (res.data as ContactImportResult) ?? res.data;
  },
};
