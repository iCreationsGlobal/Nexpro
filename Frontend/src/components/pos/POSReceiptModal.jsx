/**
 * POSReceiptModal Component
 * 
 * Receipt delivery options modal with support for:
 * - Print receipt
 * - SMS receipt
 * - WhatsApp receipt
 * - Email receipt
 * 
 * Optimized for African context with SMS as primary delivery method.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
  Printer, 
  MessageSquare, 
  Mail, 
  Check, 
  Loader2,
  Phone,
  AlertCircle,
  CheckCircle,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import PrintableReceipt from '../PrintableReceipt';
import { isDealerSale } from '../../utils/saleParty';
import PrintableInvoice from '../PrintableInvoice';
import { usePOSConfig } from '../../hooks/usePOSConfig';
import { getEffectiveReceiptChannels } from '../../utils/receiptChannels';
import { CURRENCY } from '../../constants';
import { showSuccess, showError } from '../../utils/toast';
import { normalizePhone, validatePhone } from '../../utils/phoneUtils';
import { mergeBranchOrganization } from '../../utils/branchOrganization';

/**
 * Format currency value (handles string/number from API or form state)
 */
const formatCurrency = (amount) => {
  const num = Number(amount);
  const value = Number.isFinite(num) ? num : 0;
  const decimals = typeof CURRENCY?.DECIMAL_PLACES === 'number' ? CURRENCY.DECIMAL_PLACES : 2;
  return `${CURRENCY?.SYMBOL ?? '₵'} ${value.toFixed(decimals)}`;
};

/**
 * Delivery option checkbox
 */
const DeliveryOption = ({ 
  id, 
  icon: Icon, 
  label, 
  description, 
  checked, 
  onChange, 
  disabled,
  status 
}) => {
  return (
    <div 
      className={`
        p-4 rounded-lg border-2 cursor-pointer transition-all
        ${checked 
          ? 'bg-green-50 border-green-500' 
          : 'bg-card border-border hover:border-green-300'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      onClick={() => !disabled && onChange(!checked)}
    >
      <div className="flex items-start gap-3">
        <Checkbox 
          id={id} 
          checked={checked} 
          disabled={disabled}
          className="mt-0.5"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${checked ? 'text-green-600' : 'text-muted-foreground'}`} />
            <Label 
              htmlFor={id} 
              className={`font-medium cursor-pointer ${checked ? 'text-green-700' : 'text-foreground'}`}
            >
              {label}
            </Label>
            {status === 'sent' && (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
            {status === 'sending' && (
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
            )}
            {status === 'failed' && (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Main POSReceiptModal component
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {function} props.onClose - Called to close the modal
 * @param {Object} props.sale - The completed sale object
 * @param {Object} [props.customer] - Customer object
 * @param {Object} props.organizationSettings - Organization settings for receipt
 * @param {function} props.onSendReceipt - Called to send receipt via selected channels
 */
const POSReceiptModal = ({
  isOpen,
  onClose,
  sale,
  customer,
  organizationSettings,
  onSendReceipt
}) => {
  const printRef = useRef(null);
  const { posConfig } = usePOSConfig();

  const receiptMode = posConfig.receipt?.mode || 'ask';
  const printConfig = posConfig.print || { format: 'a4' };
  // Hide SMS/email/WhatsApp when a sale_completed receipt automation already covers that channel; print stays.
  const enabledChannels = useMemo(
    () => getEffectiveReceiptChannels(posConfig),
    [posConfig]
  );

  const isCreditSale = sale?.paymentMethod === 'credit';
  const docLabel = isCreditSale ? 'Invoice' : 'Receipt';

  // Delivery options state
  const [deliveryOptions, setDeliveryOptions] = useState({
    print: false,
    sms: true, // Default to SMS for African context
    whatsapp: false,
    email: false
  });

  // Contact info state
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');

  // Populate phone/email when modal opens with customer (selected or entered at checkout)
  useEffect(() => {
    if (isOpen && customer) {
      setPhone(customer.phone || '');
      setEmail(customer.email || '');
    }
  }, [isOpen, customer]);

  // Sync delivery options with enabled channels when modal opens - default SMS or first channel
  useEffect(() => {
    if (isOpen && enabledChannels.length > 0) {
      const defaultChannel = enabledChannels.includes('sms') ? 'sms' : enabledChannels[0];
      setDeliveryOptions({
        print: enabledChannels.includes('print') && defaultChannel === 'print',
        sms: enabledChannels.includes('sms') && defaultChannel === 'sms',
        whatsapp: enabledChannels.includes('whatsapp') && defaultChannel === 'whatsapp',
        email: enabledChannels.includes('email') && defaultChannel === 'email',
      });
    }
  }, [isOpen, enabledChannels]);

  // Sending state
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState({
    print: null,
    sms: null,
    whatsapp: null,
    email: null
  });

  // Validation (phone: African formats 0XX / +233)
  const needsPhone = deliveryOptions.sms || deliveryOptions.whatsapp;
  const needsEmail = deliveryOptions.email;
  const phoneValidation = validatePhone(phone);
  const isPhoneValid = !needsPhone || (phone.trim() && phoneValidation.valid);
  const isEmailValid = !needsEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const hasSelectedOption = Object.values(deliveryOptions).some(v => v);
  const canSend = hasSelectedOption && isPhoneValid && isEmailValid;

  // Button label based on selection: single = action-specific, multiple = "Continue"
  const selectedCount = Object.values(deliveryOptions).filter(Boolean).length;
  const sendButtonLabel = useMemo(() => {
    if (selectedCount > 1) return 'Continue';
    if (deliveryOptions.print) return isCreditSale ? 'Print Invoice' : 'Print Receipt';
    if (deliveryOptions.sms) return isCreditSale ? 'Send SMS Invoice' : 'Send SMS';
    if (deliveryOptions.whatsapp) return isCreditSale ? 'Send WhatsApp Invoice' : 'Send WhatsApp';
    if (deliveryOptions.email) return isCreditSale ? 'Send Email Invoice' : 'Send Email';
    return isCreditSale ? 'Send Invoice' : 'Send Receipt';
  }, [selectedCount, isCreditSale, deliveryOptions.print, deliveryOptions.sms, deliveryOptions.whatsapp, deliveryOptions.email]);

  // Toggle delivery option
  const toggleOption = useCallback((option, value) => {
    setDeliveryOptions(prev => ({ ...prev, [option]: value }));
  }, []);

  // Handle print
  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const docType = sale?.paymentMethod === 'credit' ? 'Invoice' : 'Receipt';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${docType} - ${sale?.saleNumber || ''}</title>
          <style>
            body { font-family: 'Courier New', monospace; padding: 20px; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();

    let printed = false;
    const triggerPrint = () => {
      if (printed) return;
      printed = true;
      printWindow.print();
    };

    // A logo embedded as a large data-URI can still be mid-decode when the popup first paints
    // (fresh document, no cache warm-up) — wait for every image to settle before printing,
    // otherwise the logo is silently skipped from the printed receipt.
    const images = Array.from(printWindow.document.images || []);
    const pending = images.filter((img) => !img.complete);
    if (pending.length === 0) {
      triggerPrint();
    } else {
      let remaining = pending.length;
      const onImageSettled = () => {
        remaining -= 1;
        if (remaining <= 0) triggerPrint();
      };
      pending.forEach((img) => {
        img.addEventListener('load', onImageSettled, { once: true });
        img.addEventListener('error', onImageSettled, { once: true });
      });
      setTimeout(triggerPrint, 1500);
    }
  }, [sale?.paymentMethod, sale?.saleNumber]);

  /**
   * Summarize a send-receipt API response as success/error toasts, checking the per-channel
   * result rather than assuming success just because the request itself didn't throw.
   * @param {{ data?: Record<string, { success?: boolean, error?: string }> }} response
   * @param {string[]} requestedChannels
   */
  const notifySendResult = useCallback((response, requestedChannels) => {
    const docLabel = sale?.paymentMethod === 'credit' ? 'Invoice' : 'Receipt';
    const channelResults = response?.data || {};
    const sentChannels = requestedChannels.filter((ch) => channelResults[ch]?.success);
    const failedChannels = requestedChannels.filter((ch) => !channelResults[ch]?.success);
    if (sentChannels.length > 0) {
      showSuccess(`${docLabel} sent via ${sentChannels.join(', ')}`);
    }
    failedChannels.forEach((ch) => {
      showError(channelResults[ch]?.error || `Failed to send via ${ch}`, `Failed to send via ${ch}`);
    });
  }, [sale?.paymentMethod]);

  // Auto modes: execute and close
  const integratedSendChannels = useMemo(() => enabledChannels.filter((c) => c !== 'print'), [enabledChannels]);
  const hasContactForSend = useMemo(() => {
    const needsPhone = integratedSendChannels.some((c) => ['sms', 'whatsapp'].includes(c));
    const needsEmail = integratedSendChannels.includes('email');
    return (!needsPhone || (phone || customer?.phone)) && (!needsEmail || (email || customer?.email));
  }, [integratedSendChannels, phone, email, customer]);

  useEffect(() => {
    if (!isOpen || !sale) return;
    let cancelled = false;
    const run = async () => {
      if (receiptMode === 'auto_print') {
        handlePrint();
        onClose();
        return;
      }
      if (receiptMode === 'auto_send') {
        // If no SMS/WhatsApp/Email integrated, close immediately without attempting send
        if (integratedSendChannels.length === 0) {
          if (!cancelled) onClose();
          return;
        }
        if (hasContactForSend && integratedSendChannels.length > 0) {
          try {
            const response = await onSendReceipt({
              saleId: sale.id,
              channels: integratedSendChannels,
              phone: ['sms', 'whatsapp'].some((c) => integratedSendChannels.includes(c)) ? (normalizePhone(phone || customer?.phone) || phone || customer?.phone) : undefined,
              email: integratedSendChannels.includes('email') ? (email || customer?.email) : undefined,
            });
            if (!cancelled) notifySendResult(response, integratedSendChannels);
          } catch (e) {
            if (!cancelled) showError(e);
          }
        }
        if (!cancelled) onClose();
        return;
      }
      if (receiptMode === 'auto_both') {
        handlePrint();
        if (hasContactForSend && integratedSendChannels.length > 0) {
          try {
            const response = await onSendReceipt({
              saleId: sale.id,
              channels: integratedSendChannels,
              phone: ['sms', 'whatsapp'].some((c) => integratedSendChannels.includes(c)) ? (normalizePhone(phone || customer?.phone) || phone || customer?.phone) : undefined,
              email: integratedSendChannels.includes('email') ? (email || customer?.email) : undefined,
            });
            if (!cancelled) notifySendResult(response, integratedSendChannels);
          } catch (e) {
            if (!cancelled) showError(e);
          }
        }
        if (!cancelled) onClose();
      }
    };
    const timer = setTimeout(run, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, sale, receiptMode, hasContactForSend, integratedSendChannels, phone, email, customer, onSendReceipt, onClose, handlePrint, notifySendResult]);

  // Handle send receipt
  const handleSendReceipt = useCallback(async () => {
    setIsSending(true);
    const channels = [];
    const results = { ...sendStatus };

    try {
      // Handle print
      if (deliveryOptions.print) {
        setSendStatus(prev => ({ ...prev, print: 'sending' }));
        try {
          handlePrint();
          results.print = 'sent';
        } catch (err) {
          results.print = 'failed';
        }
      }

      // Prepare channels for API call
      if (deliveryOptions.sms) channels.push('sms');
      if (deliveryOptions.whatsapp) channels.push('whatsapp');
      if (deliveryOptions.email) channels.push('email');

      // Send via API
      if (channels.length > 0) {
        channels.forEach(ch => {
          setSendStatus(prev => ({ ...prev, [ch]: 'sending' }));
        });

        try {
          const response = await onSendReceipt({
            saleId: sale.id,
            channels,
            phone: needsPhone ? (normalizePhone(phone) || phone) : undefined,
            email: needsEmail ? email : undefined
          });

          // The request itself can succeed (HTTP 200) while a specific channel still failed
          // to deliver (not configured, invalid phone, provider error, disabled, etc.) —
          // always check the per-channel result instead of assuming success.
          const channelResults = response?.data || {};
          channels.forEach(ch => {
            results[ch] = channelResults[ch]?.success ? 'sent' : 'failed';
          });
          notifySendResult(response, channels);
        } catch (err) {
          channels.forEach(ch => {
            results[ch] = 'failed';
          });
          showError(sale?.paymentMethod === 'credit' ? `Failed to send invoice: ${err.message}` : `Failed to send receipt: ${err.message}`);
        }
      }

      setSendStatus(results);

      // Auto-close after success
      const allSent = Object.entries(results)
        .filter(([key, val]) => deliveryOptions[key])
        .every(([key, val]) => val === 'sent');

      if (allSent) {
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } finally {
      setIsSending(false);
    }
  }, [deliveryOptions, phone, email, sale, needsPhone, needsEmail, handlePrint, onSendReceipt, onClose, sendStatus, notifySendResult]);

  // Receipt data for preview
  const receiptOrganization = useMemo(() => {
    if (sale?.invoice?.organization) return sale.invoice.organization;
    return mergeBranchOrganization(sale?.shop || null, organizationSettings || {});
  }, [sale, organizationSettings]);

  const receiptData = useMemo(() => {
    if (!sale) return null;
    return {
      ...sale,
      ...(isDealerSale(sale) ? { customer: null, customerId: null } : { customer }),
      organization: receiptOrganization
    };
  }, [sale, customer, receiptOrganization]);

  const canAutoExecute = receiptMode === 'auto_print'
    || receiptMode === 'auto_both'
    || (receiptMode === 'auto_send' && hasContactForSend);

  const printDocumentTitle = isCreditSale ? 'INVOICE' : 'RECEIPT';
  const renderPrintableContent = () => {
    if (!receiptData) return null;
    if (receiptData.invoice) {
      return (
        <PrintableInvoice
          invoice={receiptData.invoice}
          documentTitle={printDocumentTitle}
          saleNumber={receiptData.saleNumber}
          organization={receiptOrganization}
          printConfig={printConfig}
        />
      );
    }
    return (
      <PrintableReceipt
        sale={receiptData}
        documentTitle={printDocumentTitle}
        organization={receiptOrganization}
        printConfig={printConfig}
      />
    );
  };

  if (canAutoExecute && isOpen) {
    return (
      <div className="hidden" aria-hidden="true">
        <div ref={printRef}>
          {renderPrintableContent()}
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:w-[var(--modal-w-md)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Sale Complete!
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
        {/* Sale summary */}
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-muted-foreground">Sale Number</span>
              <span className="font-mono font-medium">{sale?.saleNumber}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Amount</span>
              <span className="text-xl font-bold text-green-700">
                {formatCurrency(sale?.total)}
              </span>
            </div>
            {sale?.change > 0 && (
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-green-200">
                <span className="text-muted-foreground">Change Given</span>
                <span className="font-medium text-orange-600">
                  {formatCurrency(sale?.change)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Delivery options - only show channels not handled by automations (print always available) */}
        <div className="space-y-3">
          <h4 className="font-medium text-foreground">Send {docLabel}</h4>

          {enabledChannels.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Receipt delivery is handled automatically. You can close this dialog.
            </p>
          )}
          
          {enabledChannels.includes('print') && (
            <DeliveryOption
              id="print"
              icon={Printer}
              label={isCreditSale ? 'Print Invoice' : 'Print Receipt'}
              description={isCreditSale ? 'Print invoice for customer to pay later' : 'Print a physical receipt'}
              checked={deliveryOptions.print}
              onChange={(v) => toggleOption('print', v)}
              status={sendStatus.print}
            />
          )}

          {enabledChannels.includes('sms') && (
            <DeliveryOption
              id="sms"
              icon={MessageSquare}
              label={isCreditSale ? 'SMS Invoice' : 'SMS Receipt'}
              description={isCreditSale ? 'Send invoice via SMS' : 'Send receipt via SMS'}
              checked={deliveryOptions.sms}
              onChange={(v) => toggleOption('sms', v)}
              status={sendStatus.sms}
            />
          )}

          {enabledChannels.includes('whatsapp') && (
            <DeliveryOption
              id="whatsapp"
              icon={Phone}
              label={isCreditSale ? 'WhatsApp Invoice' : 'WhatsApp Receipt'}
              description={isCreditSale ? 'Send invoice via WhatsApp' : 'Send receipt via WhatsApp'}
              checked={deliveryOptions.whatsapp}
              onChange={(v) => toggleOption('whatsapp', v)}
              status={sendStatus.whatsapp}
            />
          )}

          {enabledChannels.includes('email') && (
            <DeliveryOption
              id="email"
              icon={Mail}
              label={isCreditSale ? 'Email Invoice' : 'Email Receipt'}
              description={isCreditSale ? 'Send invoice via email' : 'Send receipt via email'}
              checked={deliveryOptions.email}
              onChange={(v) => toggleOption('email', v)}
              status={sendStatus.email}
            />
          )}
        </div>

        {/* Contact inputs */}
        {needsPhone && (
          <div>
            <Label>Phone Number</Label>
            <Input
              type="tel"
              placeholder="0XX XXX XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-12 mt-2"
            />
            {!isPhoneValid && phone.length > 0 && (
              <p className="text-sm text-red-500 mt-1">
                {phoneValidation.error || 'Please enter a valid phone (e.g. 0XX XXX XXXX or +233 XX XXX XXXX)'}
              </p>
            )}
          </div>
        )}

        {needsEmail && (
          <div>
            <Label>Email Address</Label>
            <Input
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 mt-2"
            />
            {!isEmailValid && email.length > 0 && (
              <p className="text-sm text-red-500 mt-1">
                Please enter a valid email address
              </p>
            )}
          </div>
        )}

        {/* Hidden printable content: invoice for credit sales, receipt otherwise */}
        <div className="hidden">
          <div ref={printRef}>
            {renderPrintableContent()}
          </div>
        </div>
        </DialogBody>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {enabledChannels.length > 0 && (
            <Button
              onClick={handleSendReceipt}
              disabled={!canSend}
              loading={isSending}
              className="w-full sm:w-auto bg-green-700 hover:bg-green-800"
            >
              <>
                <Send className="h-4 w-4 mr-2" />
                {sendButtonLabel}
              </>
            </Button>
          )}
          {enabledChannels.length === 0 && (
            <Button
              onClick={onClose}
              className="w-full sm:w-auto bg-green-700 hover:bg-green-800"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default POSReceiptModal;
