import { useMemo } from 'react';
import { Mail, MessageSquare } from 'lucide-react';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { useDebounce } from '../../hooks/useDebounce';
import { DEBOUNCE_DELAYS } from '../../constants';
import { MESSAGING_ACTION_TYPES, isInternalStaffTrigger } from '../../utils/automationForm';
import {
  buildPreviewContextFromForm,
  resolveAutomationTemplatePreview,
  resolveWhatsAppParametersPreview,
} from '../../utils/automationTemplatePreview';

const PREVIEW_META = {
  send_sms: { label: 'SMS', Icon: MessageSquare },
  send_email_platform: { label: 'Email', Icon: Mail },
  send_whatsapp: { label: 'WhatsApp', Icon: WhatsAppIcon },
};

/**
 * Live message preview for automation builder messaging actions.
 * @param {object} props
 * @param {object} props.builder - Automation builder state
 * @param {string} [props.businessName] - Real workspace display name for {{businessName}}
 * @param {string} [props.tenantSlug] - Workspace slug for {{reviewLink}} preview
 */
export default function MessagePreview({ builder, businessName, tenantSlug }) {
  const debouncedActionRows = useDebounce(builder.actionRows, DEBOUNCE_DELAYS.SEARCH);

  const previewContext = useMemo(
    () => {
      const base = buildPreviewContextFromForm({
        name: builder.name,
        triggerType: builder.triggerType,
        triggerForm: builder.triggerForm,
        conditionForm: builder.conditionForm,
        actionRows: debouncedActionRows,
        businessName,
      });
      const slug = tenantSlug?.trim();
      if (!slug || typeof window === 'undefined') return base;
      const reviewLink = `${window.location.origin}/review/${encodeURIComponent(slug)}`;
      return {
        ...base,
        reviewLink,
        reviewUrl: reviewLink,
      };
    },
    [
      builder.name,
      builder.triggerType,
      builder.triggerForm,
      builder.conditionForm,
      debouncedActionRows,
      businessName,
      tenantSlug,
    ]
  );

  const messagingPreviews = useMemo(() => {
    return (debouncedActionRows || [])
      .map((row, index) => {
        if (!MESSAGING_ACTION_TYPES.includes(row?.type)) return null;

        if (row.type === 'send_sms') {
          return {
            key: `sms-${index}`,
            type: row.type,
            label: PREVIEW_META.send_sms.label,
            Icon: PREVIEW_META.send_sms.Icon,
            body: resolveAutomationTemplatePreview(row.body, previewContext),
          };
        }

        if (row.type === 'send_email_platform') {
          return {
            key: `email-${index}`,
            type: row.type,
            label: PREVIEW_META.send_email_platform.label,
            Icon: PREVIEW_META.send_email_platform.Icon,
            subject: resolveAutomationTemplatePreview(row.subject, previewContext),
            body: resolveAutomationTemplatePreview(row.body, previewContext),
          };
        }

        if (row.type === 'send_whatsapp') {
          const parameters = resolveWhatsAppParametersPreview(row.parametersText, previewContext);
          return {
            key: `whatsapp-${index}`,
            type: row.type,
            label: PREVIEW_META.send_whatsapp.label,
            Icon: PREVIEW_META.send_whatsapp.Icon,
            templateName: String(row.templateName || '').trim() || 'hello_world',
            parameters,
          };
        }

        return null;
      })
      .filter(Boolean);
  }, [debouncedActionRows, previewContext]);

  if (!messagingPreviews.length) return null;

  const staffPreview = isInternalStaffTrigger(builder.triggerType);

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-950">Message preview</p>
      <p className="mt-1 text-xs text-slate-500">
        {staffPreview
          ? 'Staff context sample — messages fan out to configured recipients'
          : 'Sample data for preview'}
      </p>
      <div className="mt-3 space-y-3">
        {messagingPreviews.map((preview) => {
          const Icon = preview.Icon;
          return (
            <div key={preview.key} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Icon className={`h-4 w-4 ${preview.type === 'send_whatsapp' ? 'text-green-700' : 'text-slate-500'}`} aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{preview.label}</p>
              </div>
              {preview.type === 'send_email_platform' ? (
                <div className="space-y-2">
                  {preview.subject ? (
                    <p className="text-xs font-medium text-slate-700">
                      Subject: <span className="font-normal text-slate-600">{preview.subject}</span>
                    </p>
                  ) : null}
                  <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-slate-800">
                    {preview.body || 'Enter a message to see preview.'}
                  </pre>
                </div>
              ) : preview.type === 'send_whatsapp' ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">
                    Template: <span className="font-mono text-slate-800">{preview.templateName}</span>
                  </p>
                  {preview.parameters.length ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-700">Parameters</p>
                      <ul className="space-y-1">
                        {preview.parameters.map((param, paramIndex) => (
                          <li
                            key={`${preview.key}-param-${paramIndex}`}
                            className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-sm text-slate-800"
                          >
                            {param || '—'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No template parameters configured.</p>
                  )}
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-slate-800">
                  {preview.body || 'Enter a message to see preview.'}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
