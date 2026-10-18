import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, Printer, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { showSuccess } from '../utils/toast';

/**
 * Public review link + QR and share actions (WhatsApp, SMS, download / print QR).
 * Used from Settings → Workspace → Organization.
 *
 * @param {{ tenantSlug?: string | null; organizationName?: string | null }} props
 */
export function OrganizationReviewShareSection({ tenantSlug, organizationName }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  const reviewPublicUrl = useMemo(() => {
    const slug = tenantSlug?.trim();
    if (!slug || typeof window === 'undefined') return '';
    return `${window.location.origin}/review/${encodeURIComponent(slug)}`;
  }, [tenantSlug]);

  useEffect(() => {
    if (!reviewPublicUrl) {
      setQrDataUrl('');
      setQrLoading(false);
      return;
    }
    let cancelled = false;
    setQrLoading(true);
    QRCode.toDataURL(reviewPublicUrl, { width: 320, margin: 2 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      })
      .finally(() => {
        if (!cancelled) setQrLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reviewPublicUrl]);

  const shareMessage = useMemo(() => {
    const name = (organizationName || 'us').trim() || 'us';
    return `Hi! We would love your review: ${reviewPublicUrl || ''}`.trim();
  }, [organizationName, reviewPublicUrl]);

  const handleCopyLink = () => {
    if (!reviewPublicUrl) return;
    navigator.clipboard.writeText(reviewPublicUrl);
    showSuccess('Review link copied');
  };

  const handleWhatsApp = () => {
    if (!reviewPublicUrl) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, '_blank', 'noopener,noreferrer');
  };

  const handleSms = () => {
    if (!reviewPublicUrl) return;
    window.location.href = `sms:?body=${encodeURIComponent(shareMessage)}`;
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `review-qr-${(tenantSlug || 'tenant').replace(/[^a-z0-9_-]/gi, '-')}.png`;
    a.click();
  };

  const handlePrintQr = () => {
    if (!qrDataUrl || !reviewPublicUrl) return;
    const popup = window.open('', '_blank');
    if (!popup) return;
    const businessName = (organizationName || 'Business').trim() || 'Business';
    const safeName = businessName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeUrl = reviewPublicUrl.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    popup.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${safeName} - Review QR</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 24px; }
            .card { max-width: 420px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; text-align: center; }
            h1 { font-size: 20px; margin: 0 0 8px; }
            p { margin: 0 0 12px; color: #475569; font-size: 14px; }
            img { border: 1px solid #e5e7eb; border-radius: 8px; }
            .url { margin-top: 10px; font-size: 11px; color: #64748b; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>${safeName}</h1>
            <p>Scan to leave a review</p>
            <img src="${qrDataUrl}" alt="Review QR code" width="220" height="220" />
            <div class="url">${safeUrl}</div>
          </div>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    setTimeout(() => {
      popup.print();
      popup.onafterprint = () => popup.close();
    }, 300);
  };

  return (
    <Card className="rounded-lg border border-border bg-card">
      <CardContent className="p-4 md:p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Share &amp; collect reviews</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Share your link or QR code with customers to collect feedback.
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Your review link</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  readOnly
                  value={
                    reviewPublicUrl ||
                    'Save your workspace (organization name and slug) so this link is available.'
                  }
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" className="shrink-0" onClick={handleCopyLink} disabled={!reviewPublicUrl}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleWhatsApp} disabled={!reviewPublicUrl}>
                Send WhatsApp
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleSms} disabled={!reviewPublicUrl}>
                Send SMS
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleDownloadQr} disabled={!qrDataUrl}>
                <Download className="mr-2 h-4 w-4" />
                Download QR
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handlePrintQr} disabled={!qrDataUrl}>
                <Printer className="mr-2 h-4 w-4" />
                Print QR
              </Button>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex min-h-[200px] min-w-[200px] items-center justify-center rounded-lg border border-border bg-background p-3">
              {qrLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt="Review QR code" width={200} height={200} className="rounded-md" />
              ) : (
                <span className="text-xs text-muted-foreground">QR unavailable</span>
              )}
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">Scan to leave a review</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
