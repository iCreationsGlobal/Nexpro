import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Trash2, ArrowLeft, ArrowRight, Search } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import saleService from '../../services/saleService';
import productService from '../../services/productService';
import { useDebounce } from '../../hooks/useDebounce';
import { showError, showSuccess } from '../../utils/toast';
import { formatAmount } from '../../utils/formatNumber';
import { numberInputValue, handleNumberChange } from '../../utils/formUtils';
import {
  SALE_RETURN_REASON_CODES,
  SALE_RETURN_REASON_LABELS,
  SALE_RETURN_DISPOSITIONS,
  SALE_RETURN_DISPOSITION_LABELS,
  SALE_RETURN_TYPES,
  PAYMENT_METHODS,
} from '../../constants';
import ScanSearchButton from '@/components/ScanSearchButton';

const STEPS = ['items', 'reason', 'exchange', 'money', 'confirm'];

const lineSchema = z.object({
  saleItemId: z.string(),
  selected: z.boolean(),
  name: z.string(),
  returnableQty: z.number(),
  unitAmount: z.number(),
  qtyReturned: z.coerce.number().min(0),
  disposition: z.enum(['restock', 'write_off']),
  reasonCode: z.string().min(1, 'Reason is required'),
});

const exchangeLineSchema = z.object({
  productId: z.string(),
  productVariantId: z.string().optional().nullable(),
  name: z.string(),
  quantity: z.coerce.number().min(0.01),
  unitPrice: z.coerce.number().min(0),
});

const wizardSchema = z.object({
  type: z.enum(['refund', 'exchange']),
  items: z.array(lineSchema),
  exchangeItems: z.array(exchangeLineSchema),
  refundMethod: z.string().optional(),
  collectMethod: z.string().optional(),
  refundAmount: z.coerce.number().min(0).optional(),
  collectAmount: z.coerce.number().min(0).optional(),
  reasonSummary: z.string().optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  const selected = data.items.filter((i) => i.selected && i.qtyReturned > 0);
  if (selected.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select at least one item to return', path: ['items'] });
  }
  for (const item of selected) {
    if (item.qtyReturned > item.returnableQty + 0.0001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Qty exceeds returnable for ${item.name}`,
        path: ['items'],
      });
    }
  }
  if (data.type === 'exchange' && data.exchangeItems.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Add at least one exchange product', path: ['exchangeItems'] });
  }
});

const PAYMENT_OPTIONS = [
  { value: PAYMENT_METHODS.CASH, label: 'Cash' },
  { value: PAYMENT_METHODS.MOBILE_MONEY, label: 'Mobile money' },
  { value: PAYMENT_METHODS.CARD, label: 'Card' },
  { value: PAYMENT_METHODS.BANK_TRANSFER, label: 'Bank transfer' },
  { value: PAYMENT_METHODS.OTHER, label: 'Other' },
];

/**
 * Multi-step sheet wizard for POS refunds and exchanges.
 * Steps: Select items → Reason & disposition → (optional) Exchange products → Money → Confirm.
 */
export default function SaleReturnWizard({
  open,
  onOpenChange,
  saleId,
  saleNumber,
  onCompleted,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [loadingReturnable, setLoadingReturnable] = useState(false);
  const [eligibility, setEligibility] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const debouncedProductSearch = useDebounce(productSearch, 500);

  const form = useForm({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      type: SALE_RETURN_TYPES.REFUND,
      items: [],
      exchangeItems: [],
      refundMethod: PAYMENT_METHODS.CASH,
      collectMethod: PAYMENT_METHODS.CASH,
      refundAmount: 0,
      collectAmount: 0,
      reasonSummary: '',
      notes: '',
    },
    mode: 'onChange',
  });

  const { fields: exchangeFields, append: appendExchange, remove: removeExchange } = useFieldArray({
    control: form.control,
    name: 'exchangeItems',
  });

  const watchedType = form.watch('type');
  const watchedItems = form.watch('items');
  const watchedExchange = form.watch('exchangeItems');

  const step = STEPS[stepIndex];
  const visibleSteps = useMemo(() => {
    if (watchedType === SALE_RETURN_TYPES.EXCHANGE) return STEPS;
    return STEPS.filter((s) => s !== 'exchange');
  }, [watchedType]);

  const visibleStepIndex = Math.max(0, visibleSteps.indexOf(step));

  const loadReturnable = useCallback(async () => {
    if (!saleId || !open) return;
    setLoadingReturnable(true);
    try {
      const res = await saleService.getReturnable(saleId);
      const data = res?.data ?? res;
      setEligibility(data?.eligibility || null);
      const lines = (data?.lines || []).map((line) => ({
        saleItemId: line.saleItemId,
        selected: false,
        name: line.name,
        returnableQty: Number(line.returnableQty) || 0,
        unitAmount: Number(line.unitAmount) || 0,
        qtyReturned: Number(line.returnableQty) > 0 ? 1 : 0,
        disposition: SALE_RETURN_DISPOSITIONS.RESTOCK,
        reasonCode: SALE_RETURN_REASON_CODES.CUSTOMER_CHANGED_MIND,
      }));
      form.reset({
        type: SALE_RETURN_TYPES.REFUND,
        items: lines,
        exchangeItems: [],
        refundMethod: PAYMENT_METHODS.CASH,
        collectMethod: PAYMENT_METHODS.CASH,
        refundAmount: 0,
        collectAmount: 0,
        reasonSummary: '',
        notes: '',
      });
      setStepIndex(0);
    } catch (error) {
      showError(error, 'Failed to load returnable items');
      onOpenChange?.(false);
    } finally {
      setLoadingReturnable(false);
    }
  }, [saleId, open, form, onOpenChange]);

  useEffect(() => {
    if (open && saleId) {
      loadReturnable();
    }
  }, [open, saleId, loadReturnable]);

  useEffect(() => {
    if (!open || watchedType !== SALE_RETURN_TYPES.EXCHANGE) return;
    const q = String(debouncedProductSearch || '').trim();
    if (q.length < 2) {
      setProductResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSearchingProducts(true);
      try {
        const res = await productService.searchProducts(q, { limit: 12 });
        const body = res?.data ?? res ?? [];
        const list = Array.isArray(body) ? body : (Array.isArray(body?.data) ? body.data : []);
        if (!cancelled) setProductResults(list);
      } catch {
        if (!cancelled) setProductResults([]);
      } finally {
        if (!cancelled) setSearchingProducts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedProductSearch, open, watchedType]);

  const moneySummary = useMemo(() => {
    const selected = (watchedItems || []).filter((i) => i.selected && Number(i.qtyReturned) > 0);
    const returnValue = selected.reduce(
      (sum, i) => sum + (Number(i.unitAmount) || 0) * (Number(i.qtyReturned) || 0),
      0
    );
    const exchangeValue = (watchedExchange || []).reduce(
      (sum, i) => sum + (Number(i.unitPrice) || 0) * (Number(i.quantity) || 0),
      0
    );
    const net = Math.round((returnValue - exchangeValue) * 100) / 100;
    return {
      returnValue: Math.round(returnValue * 100) / 100,
      exchangeValue: Math.round(exchangeValue * 100) / 100,
      refundAmount: Math.max(0, net),
      collectAmount: Math.max(0, -net),
    };
  }, [watchedItems, watchedExchange]);

  useEffect(() => {
    if (step === 'money') {
      form.setValue('refundAmount', moneySummary.refundAmount);
      form.setValue('collectAmount', moneySummary.collectAmount);
    }
  }, [step, moneySummary.refundAmount, moneySummary.collectAmount, form]);

  const goNext = async () => {
    if (step === 'items') {
      const selected = (form.getValues('items') || []).filter((i) => i.selected && Number(i.qtyReturned) > 0);
      if (selected.length === 0) {
        showError(null, 'Select at least one item and quantity to return');
        return;
      }
      for (const item of selected) {
        if (Number(item.qtyReturned) > Number(item.returnableQty) + 0.0001) {
          showError(null, `Quantity for ${item.name} exceeds returnable amount`);
          return;
        }
      }
    }
    if (step === 'exchange' && watchedType === SALE_RETURN_TYPES.EXCHANGE) {
      if ((form.getValues('exchangeItems') || []).length === 0) {
        showError(null, 'Add at least one product the customer is receiving');
        return;
      }
    }
    const nextVisible = visibleSteps[visibleStepIndex + 1];
    if (nextVisible) setStepIndex(STEPS.indexOf(nextVisible));
  };

  const goBack = () => {
    const prevVisible = visibleSteps[visibleStepIndex - 1];
    if (prevVisible) setStepIndex(STEPS.indexOf(prevVisible));
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const items = values.items
        .filter((i) => i.selected && Number(i.qtyReturned) > 0)
        .map((i) => ({
          saleItemId: i.saleItemId,
          qtyReturned: Number(i.qtyReturned),
          disposition: i.disposition,
          reasonCode: i.reasonCode,
        }));

      const payload = {
        type: values.type,
        items,
        reasonSummary: values.reasonSummary || undefined,
        notes: values.notes || undefined,
        refundAmount: Number(values.refundAmount) || 0,
        collectAmount: Number(values.collectAmount) || 0,
        refundMethod: Number(values.refundAmount) > 0 ? values.refundMethod : undefined,
        collectMethod: Number(values.collectAmount) > 0 ? values.collectMethod : undefined,
      };

      if (values.type === SALE_RETURN_TYPES.EXCHANGE) {
        payload.exchangeItems = values.exchangeItems.map((i) => ({
          productId: i.productId,
          productVariantId: i.productVariantId || undefined,
          name: i.name,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        }));
      }

      await saleService.createReturn(saleId, payload);
      showSuccess(values.type === 'exchange' ? 'Exchange recorded' : 'Refund recorded');
      onOpenChange?.(false);
      onCompleted?.();
    } catch (error) {
      showError(error, 'Failed to record return');
    } finally {
      setSubmitting(false);
    }
  });

  const addExchangeProduct = (product) => {
    const unitPrice = Number(product.sellingPrice ?? product.price ?? 0) || 0;
    appendExchange({
      productId: product.id,
      productVariantId: null,
      name: product.name,
      quantity: 1,
      unitPrice,
    });
    setProductSearch('');
    setProductResults([]);
  };

  const ineligible = eligibility && eligibility.eligible === false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Return / Exchange</SheetTitle>
          <SheetDescription>
            {saleNumber ? `Sale ${saleNumber}` : 'Record a refund or exchange'}
            {' · '}Step {visibleStepIndex + 1} of {visibleSteps.length}
          </SheetDescription>
        </SheetHeader>

        {loadingReturnable ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : ineligible ? (
          <Alert className="mt-6 border border-border">
            <AlertDescription>
              {eligibility.reason || 'This sale is not eligible for returns.'}
            </AlertDescription>
          </Alert>
        ) : (
          <Form {...form}>
            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              {step === 'items' && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={SALE_RETURN_TYPES.REFUND}>Refund</SelectItem>
                            <SelectItem value={SALE_RETURN_TYPES.EXCHANGE}>Exchange</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <Separator />
                  <div className="space-y-3">
                    <Label>Items to return</Label>
                    {(watchedItems || []).map((item, index) => (
                      <div
                        key={item.saleItemId}
                        className="rounded-lg border border-border p-3 space-y-3"
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={item.selected}
                            onCheckedChange={(checked) => {
                              form.setValue(`items.${index}.selected`, Boolean(checked));
                              if (checked && Number(item.qtyReturned) <= 0) {
                                form.setValue(`items.${index}.qtyReturned`, Math.min(1, item.returnableQty));
                              }
                            }}
                            disabled={item.returnableQty <= 0}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-foreground truncate">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              Returnable {item.returnableQty} · {formatAmount(item.unitAmount)} each
                            </div>
                          </div>
                        </div>
                        {item.selected && (
                          <div>
                            <Label className="text-xs">Qty to return</Label>
                            <Input
                              type="number"
                              min={0.01}
                              step="any"
                              max={item.returnableQty}
                              value={numberInputValue(item.qtyReturned)}
                              onChange={(e) => {
                                handleNumberChange(e, (v) => form.setValue(`items.${index}.qtyReturned`, v));
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                    {(watchedItems || []).every((i) => i.returnableQty <= 0) && (
                      <p className="text-sm text-muted-foreground">No returnable quantity remaining.</p>
                    )}
                  </div>
                </div>
              )}

              {step === 'reason' && (
                <div className="space-y-4">
                  {(watchedItems || [])
                    .map((item, index) => ({ item, index }))
                    .filter(({ item }) => item.selected && Number(item.qtyReturned) > 0)
                    .map(({ item, index }) => (
                      <div key={item.saleItemId} className="rounded-lg border border-border p-3 space-y-3">
                        <div className="font-medium">{item.name}</div>
                        <FormField
                          control={form.control}
                          name={`items.${index}.reasonCode`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Reason</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Object.entries(SALE_RETURN_REASON_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.disposition`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Stock disposition</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Object.entries(SALE_RETURN_DISPOSITION_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ))}
                  <FormField
                    control={form.control}
                    name="reasonSummary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Summary note (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Short reason for the return" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {step === 'exchange' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Find product for customer</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9 pr-11"
                        placeholder="Search products…"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                      <ScanSearchButton onCode={setProductSearch} className="absolute right-1 top-1/2 -translate-y-1/2" />
                    </div>
                    {searchingProducts && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                      </p>
                    )}
                    {productResults.length > 0 && (
                      <ul className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
                        {productResults.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                              onClick={() => addExchangeProduct(p)}
                            >
                              <span className="font-medium">{p.name}</span>
                              <span className="text-muted-foreground ml-2">{formatAmount(p.sellingPrice ?? p.price ?? 0)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Separator />
                  {exchangeFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No exchange products added yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {exchangeFields.map((field, index) => (
                        <div key={field.id} className="rounded-lg border border-border p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium truncate">{form.watch(`exchangeItems.${index}.name`)}</div>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeExchange(index)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Qty</Label>
                              <Input
                                type="number"
                                min={0.01}
                                step="any"
                                value={numberInputValue(form.watch(`exchangeItems.${index}.quantity`))}
                                onChange={(e) => handleNumberChange(e, (v) => form.setValue(`exchangeItems.${index}.quantity`, v))}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Unit price</Label>
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                value={numberInputValue(form.watch(`exchangeItems.${index}.unitPrice`))}
                                onChange={(e) => handleNumberChange(e, (v) => form.setValue(`exchangeItems.${index}.unitPrice`, v))}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 'money' && (
                <div className="space-y-4">
                  <Alert className="border border-border">
                    <AlertDescription>
                      Record tender only — no automatic Hubtel / Paystack / MoMo reversal.
                    </AlertDescription>
                  </Alert>
                  <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span>Return value</span><span>{formatAmount(moneySummary.returnValue)}</span></div>
                    {watchedType === SALE_RETURN_TYPES.EXCHANGE && (
                      <div className="flex justify-between"><span>Exchange products</span><span>{formatAmount(moneySummary.exchangeValue)}</span></div>
                    )}
                    <Separator className="my-2" />
                    <div className="flex justify-between font-medium">
                      <span>{moneySummary.refundAmount > 0 ? 'Refund to customer' : moneySummary.collectAmount > 0 ? 'Collect from customer' : 'No cash difference'}</span>
                      <span>
                        {formatAmount(moneySummary.refundAmount > 0 ? moneySummary.refundAmount : moneySummary.collectAmount)}
                      </span>
                    </div>
                  </div>
                  {moneySummary.refundAmount > 0 && (
                    <>
                      <FormField
                        control={form.control}
                        name="refundAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Refund amount</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                value={numberInputValue(field.value)}
                                onChange={(e) => handleNumberChange(e, field.onChange)}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="refundMethod"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Refund method</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {PAYMENT_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                  {moneySummary.collectAmount > 0 && (
                    <>
                      <FormField
                        control={form.control}
                        name="collectAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Collect amount</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                value={numberInputValue(field.value)}
                                onChange={(e) => handleNumberChange(e, field.onChange)}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="collectMethod"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Collection method</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {PAYMENT_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Internal notes (optional)</FormLabel>
                        <FormControl>
                          <Textarea rows={3} {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {step === 'confirm' && (
                <div className="space-y-4 text-sm">
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="font-semibold capitalize">{watchedType}</div>
                    <div>
                      {(watchedItems || [])
                        .filter((i) => i.selected && Number(i.qtyReturned) > 0)
                        .map((i) => (
                          <div key={i.saleItemId} className="flex justify-between gap-2 py-1 border-b border-border/60 last:border-0">
                            <span>
                              {i.name} × {i.qtyReturned}
                              <span className="text-muted-foreground"> · {SALE_RETURN_DISPOSITION_LABELS[i.disposition]}</span>
                            </span>
                            <span>{formatAmount((Number(i.unitAmount) || 0) * (Number(i.qtyReturned) || 0))}</span>
                          </div>
                        ))}
                    </div>
                    {watchedType === SALE_RETURN_TYPES.EXCHANGE && (
                      <div className="pt-2">
                        <div className="text-muted-foreground mb-1">Giving customer</div>
                        {(watchedExchange || []).map((i, idx) => (
                          <div key={`${i.productId}-${idx}`} className="flex justify-between gap-2">
                            <span>{i.name} × {i.quantity}</span>
                            <span>{formatAmount((Number(i.unitPrice) || 0) * (Number(i.quantity) || 0))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <Separator />
                    {moneySummary.refundAmount > 0 && (
                      <div className="flex justify-between font-medium">
                        <span>Refund ({form.getValues('refundMethod')})</span>
                        <span>{formatAmount(form.getValues('refundAmount'))}</span>
                      </div>
                    )}
                    {moneySummary.collectAmount > 0 && (
                      <div className="flex justify-between font-medium">
                        <span>Collect ({form.getValues('collectMethod')})</span>
                        <span>{formatAmount(form.getValues('collectAmount'))}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={visibleStepIndex === 0 ? () => onOpenChange?.(false) : goBack}
                  disabled={submitting}
                >
                  {visibleStepIndex === 0 ? 'Cancel' : (
                    <>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back
                    </>
                  )}
                </Button>
                {step !== 'confirm' ? (
                  <Button type="button" onClick={goNext} className="bg-[#166534] hover:bg-[#14532d]">
                    Next
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={submitting} className="bg-[#166534] hover:bg-[#14532d]">
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Confirm {watchedType === 'exchange' ? 'exchange' : 'refund'}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        )}
      </SheetContent>
    </Sheet>
  );
}
