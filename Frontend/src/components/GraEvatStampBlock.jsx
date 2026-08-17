import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

/**
 * Display GRA e-VAT IRN / QR / signature on printable receipts and invoices.
 * Generates a QR data URL from qrPayload when qrCodeDataUrl is absent (sandbox).
 */
export default function GraEvatStampBlock({
  stamp,
  compact = false,
  className = '',
}) {
  const [qrSrc, setQrSrc] = useState(stamp?.qrCodeDataUrl || null);

  useEffect(() => {
    let cancelled = false;
    setQrSrc(stamp?.qrCodeDataUrl || null);
    if (stamp?.qrCodeDataUrl || !stamp?.qrPayload) return undefined;
    import('qrcode')
      .then((QR) => QR.toDataURL(String(stamp.qrPayload), { margin: 1, width: compact ? 96 : 128 }))
      .then((url) => {
        if (!cancelled) setQrSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [stamp?.qrCodeDataUrl, stamp?.qrPayload, compact]);

  if (!stamp?.irn) return null;

  if (compact) {
    return (
      <div className={className} style={{ fontSize: '9px', textAlign: 'center' }}>
        <div>GRA e-VAT certified</div>
        <div>IRN: {stamp.irn}</div>
        {stamp.verificationEngineId && <div>Engine: {stamp.verificationEngineId}</div>}
        {qrSrc && (
          <img
            src={qrSrc}
            alt="GRA QR"
            style={{ width: 72, height: 72, margin: '6px auto', display: 'block' }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}
    >
      <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '8px' }}>GRA e-VAT</div>
      <div
        style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          fontSize: '11px',
        }}
      >
        <div>
          <div>IRN: {stamp.irn}</div>
          {stamp.verificationEngineId && (
            <div>Verification engine: {stamp.verificationEngineId}</div>
          )}
          {stamp.stampedAt && (
            <div>Stamped: {dayjs(stamp.stampedAt).format('MMMM D, YYYY HH:mm')}</div>
          )}
          {stamp.signature && (
            <div style={{ wordBreak: 'break-all', fontSize: '10px', marginTop: 4 }}>
              Signature: {String(stamp.signature).slice(0, 64)}
              {String(stamp.signature).length > 64 ? '…' : ''}
            </div>
          )}
        </div>
        {qrSrc && <img src={qrSrc} alt="GRA QR code" style={{ width: 96, height: 96 }} />}
      </div>
    </div>
  );
}
