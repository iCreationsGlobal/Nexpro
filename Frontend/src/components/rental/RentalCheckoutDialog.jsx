import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import dayjs from 'dayjs';
import {
  ArrowLeft,
  ChevronUp,
  Minus,
  Plus,
  MapPin,
  Search,
  Trash2,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import POSProductSearch from '../pos/POSProductSearch';
import { useScanningEnabled } from '../../hooks/usePOSConfig';
import { useDebounce } from '../../hooks/useDebounce';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../context/AuthContext';
import { useShopOptional } from '../../context/ShopContext';
import customerService from '../../services/customerService';
import productService from '../../services/productService';
import rentalService from '../../services/rentalService';
import settingsService from '../../services/settingsService';
import { showError, showSuccess } from '../../utils/toast';
import { formatAmount } from '../../utils/formatNumber';
import { resolveSuggestedDepositAmount } from '../../utils/rentalDepositUtils';
import {
  formatRentalDate,
  getEndDateFromDuration,
  getRentalDayCount,
  normalizeDayBillingMode,
} from '../../utils/rentalDayBilling';
import { queryKeys } from '../../utils/queryKeys';
import { DEBOUNCE_DELAYS, QUERY_CACHE } from '../../constants';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit' },
  { value: 'other', label: 'Other' },
];

const HIRE_PAYMENT_FULL = 'full';
const HIRE_PAYMENT_PARTIAL = 'partial';
const HIRE_PAYMENT_CREDIT = 'credit';

const DEPOSIT_PAYMENT_METHOD_OPTIONS = PAYMENT_METHOD_OPTIONS.filter(
  (option) => !['credit', 'card', 'other'].includes(option.value)
);

const checkoutSchema = z
  .object({
    customerId: z.string().min(1, 'Customer is required'),
    durationDays: z.coerce.number().int().min(1, 'Enter at least 1 day').max(365),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    operationalLocation: z.string().optional(),
    paymentMethod: z.string().default('cash'),
    discountAmount: z.coerce.number().min(0, 'Discount cannot be negative').default(0),
    depositAmount: z.coerce.number().min(0, 'Deposit cannot be negative').optional().or(z.literal('')),
    hirePaymentMode: z.enum([
      HIRE_PAYMENT_FULL,
      HIRE_PAYMENT_PARTIAL,
      HIRE_PAYMENT_CREDIT,
    ]).default(HIRE_PAYMENT_CREDIT),
    hireAmountPaid: z.coerce.number().optional().or(z.literal('')),
    promisedPaymentDate: z.string().optional().or(z.literal('')),
    deliveryAddress: z.string().optional(),
  })
  .refine(
    (data) => !dayjs(data.endDate).isBefore(dayjs(data.startDate), 'day'),
    { message: 'End date cannot be before the start date', path: ['endDate'] }
  )
  .superRefine((data, ctx) => {
    if (data.hirePaymentMode !== HIRE_PAYMENT_PARTIAL) return;
    const collected = Number(data.hireAmountPaid);
    if (!Number.isFinite(collected) || collected <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter the amount being paid now',
        path: ['hireAmountPaid'],
      });
    }
  })
  .superRefine((data, ctx) => {
    const needsDate = data.hirePaymentMode === HIRE_PAYMENT_CREDIT
      || data.hirePaymentMode === HIRE_PAYMENT_PARTIAL;
    if (!needsDate) return;
    const promised = String(data.promisedPaymentDate || '').trim();
    if (!promised) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter the promised payment date',
        path: ['promisedPaymentDate'],
      });
      return;
    }
    if (dayjs(promised).isBefore(dayjs(), 'day')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Promised payment date cannot be in the past',
        path: ['promisedPaymentDate'],
      });
    }
  });

const unwrapProductList = (response) => {
  const body = response && typeof response === 'object' ? response : {};
  if (Array.isArray(body.data?.products)) return body.data.products;
  if (Array.isArray(body.products)) return body.products;
  if (Array.isArray(body.data)) return body.data;
  return [];
};

const toCatalogProduct = (product, availability) => {
  const rate = Number(product?.rentalRatePerDay ?? 0);
  const availableQty = Number(availability?.availableQty);
  const hasAvailability = availability != null && Number.isFinite(availableQty);
  const outOfStock = hasAvailability && availableQty <= 0;
  return {
    ...product,
    sellingPrice: rate,
    priceSuffix: '/day',
    selectTooltip: outOfStock ? 'Out of stock for these dates' : 'Add to rental',
    hideStockStatus: !hasAvailability,
    trackStock: hasAvailability,
    quantityOnHand: hasAvailability ? availableQty : 0,
    reorderLevel: 0,
    hasVariants: false,
    variants: [],
    rentalAvailableQty: hasAvailability ? availableQty : null,
  };
};

const getProductRate = (product) => Number(product?.rentalRatePerDay ?? product?.sellingPrice ?? 0);

/**
 * POS-style rental checkout. Daily rates and late fees come from the product
 * and workspace settings — they are not edited while creating a rental.
 */
const RentalCheckoutDialog = ({
  open,
  onOpenChange,
  products: seedProducts = [],
  customers: seedCustomers = [],
  loadCustomers,
  effectiveBranchId,
  initialProductId = null,
  onCreated,
}) => {
  const { isDesktop } = useResponsive();
  const { scanningEnabled } = useScanningEnabled();
  const { activeTenantId } = useAuth();
  const shopContext = useShopOptional();
  const activeShopId = shopContext?.activeShopId ?? null;

  const [catalog, setCatalog] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [cart, setCart] = useState([]);
  const [cartError, setCartError] = useState('');
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityResults, setAvailabilityResults] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [rentalSettingsDefaults, setRentalSettingsDefaults] = useState({});
  const [checkoutStep, setCheckoutStep] = useState(false);
  const depositTouchedRef = useRef(false);
  const prefilledRef = useRef(false);
  const submittingRef = useRef(false);

  const form = useForm({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customerId: '',
      durationDays: 1,
      startDate: dayjs().format('YYYY-MM-DD'),
      endDate: getEndDateFromDuration(dayjs().format('YYYY-MM-DD'), 1, 'end_of_day'),
      operationalLocation: '',
      paymentMethod: 'cash',
      discountAmount: 0,
      depositAmount: '',
      hirePaymentMode: HIRE_PAYMENT_CREDIT,
      hireAmountPaid: '',
      promisedPaymentDate: '',
      deliveryAddress: '',
    },
  });

  const watchedDurationDays = form.watch('durationDays');
  const watchedStart = form.watch('startDate');
  const watchedEnd = form.watch('endDate');
  const watchedDiscount = form.watch('discountAmount');
  const watchedCustomerId = form.watch('customerId');
  const watchedDepositAmount = form.watch('depositAmount');
  const watchedHirePaymentMode = form.watch('hirePaymentMode');
  const watchedHireAmountPaid = form.watch('hireAmountPaid');
  const watchedPromisedPaymentDate = form.watch('promisedPaymentDate');
  const debouncedCustomerSearch = useDebounce(customerSearch, DEBOUNCE_DELAYS.SEARCH);

  const availabilityByProductId = useMemo(() => {
    const map = new Map();
    availabilityResults.forEach((row) => {
      if (row?.productId) map.set(row.productId, row);
    });
    return map;
  }, [availabilityResults]);

  const catalogProducts = useMemo(
    () =>
      (catalog.length ? catalog : seedProducts).map((product) =>
        toCatalogProduct(product, availabilityByProductId.get(product.id))
      ),
    [catalog, seedProducts, availabilityByProductId]
  );

  const seedProductsRef = useRef(seedProducts);
  seedProductsRef.current = seedProducts;

  const loadCatalog = useCallback(async () => {
    const seeds = seedProductsRef.current;
    if (seeds.length) {
      setCatalog(seeds);
      setProductsLoading(false);
    } else {
      setProductsLoading(true);
    }
    try {
      const response = await productService.getProducts({ limit: 1000, isRentable: true });
      setCatalog(unwrapProductList(response));
    } catch (error) {
      console.error('Failed to load rentable products', error);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      prefilledRef.current = false;
      return undefined;
    }
    depositTouchedRef.current = false;
    setCheckoutStep(false);
    const today = dayjs().format('YYYY-MM-DD');
    form.reset({
      customerId: '',
      durationDays: 1,
      startDate: today,
      endDate: getEndDateFromDuration(today, 1, 'end_of_day'),
      operationalLocation: '',
      paymentMethod: 'cash',
      discountAmount: 0,
      depositAmount: '',
      hirePaymentMode: HIRE_PAYMENT_CREDIT,
      hireAmountPaid: '',
      promisedPaymentDate: '',
      deliveryAddress: '',
    });
    setCart([]);
    setCartError('');
    setAvailabilityResults([]);
    setCartSheetOpen(false);
    void loadCatalog();
    void loadCustomers?.();
    settingsService.getRentalSettings()
      .then((settings) => setRentalSettingsDefaults(settings && typeof settings === 'object' ? settings : {}))
      .catch(() => setRentalSettingsDefaults({}));
    return undefined;
  }, [open, form, loadCatalog, loadCustomers]);

  useEffect(() => {
    if (!open || prefilledRef.current || !initialProductId || !catalogProducts.length) return;
    const product = catalogProducts.find((item) => item.id === initialProductId);
    if (!product) return;
    if (product.rentalAvailableQty === 0) return;
    prefilledRef.current = true;
    setCart([
      {
        productId: product.id,
        name: product.name,
        quantity: 1,
        rentalRatePerDay: getProductRate(product),
      },
    ]);
  }, [open, initialProductId, catalogProducts]);

  const getAvailableQty = useCallback((productId) => {
    const row = availabilityByProductId.get(productId);
    if (!row) return null;
    const qty = Number(row.availableQty);
    return Number.isFinite(qty) ? qty : null;
  }, [availabilityByProductId]);

  const searchProducts = useCallback(async (query) => {
    const response = await productService.searchProducts(query, { isRentable: true, includeVariants: false });
    return unwrapProductList(response).map((product) =>
      toCatalogProduct(product, availabilityByProductId.get(product.id))
    );
  }, [availabilityByProductId]);

  const getProductByBarcode = useCallback(async (barcode) => {
    const response = await productService.getProductByBarcode(barcode);
    const product =
      response?.data?.data ?? response?.data?.product ?? response?.product ?? response?.data;
    if (!product?.id || product.isRentable === false) return null;
    return toCatalogProduct(product, availabilityByProductId.get(product.id));
  }, [availabilityByProductId]);

  const resolveProductFromQRPayload = useCallback(async (qrData) => {
    const product = await productService.resolveProductFromQRPayload(qrData);
    if (!product?.id || product.isRentable === false) return null;
    return toCatalogProduct(product, availabilityByProductId.get(product.id));
  }, [availabilityByProductId]);

  const addToCart = useCallback((product) => {
    if (!product?.id) return;
    const availableQty = getAvailableQty(product.id);
    if (availableQty != null && availableQty <= 0) return;
    const rate = getProductRate(product);
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      const nextQty = Number(existing?.quantity || 0) + 1;
      if (availableQty != null && nextQty > availableQty) return prev;
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: nextQty, rentalRatePerDay: rate }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name || product.sku || 'Product',
          quantity: 1,
          rentalRatePerDay: rate,
        },
      ];
    });
    setCartError('');
  }, [getAvailableQty]);

  const adjustQuantity = useCallback((productId, delta) => {
    const availableQty = getAvailableQty(productId);
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          const nextQty = Number(item.quantity || 0) + delta;
          if (delta > 0 && availableQty != null && nextQty > availableQty) return item;
          return { ...item, quantity: nextQty };
        })
        .filter((item) => Number(item.quantity) > 0)
    );
    setCartError('');
  }, [getAvailableQty]);

  const setQuantity = useCallback((productId, quantity) => {
    const availableQty = getAvailableQty(productId);
    let nextQty = Math.max(0, Number(quantity) || 0);
    if (availableQty != null) nextQty = Math.min(nextQty, availableQty);
    setCart((prev) =>
      prev
        .map((item) => (item.productId === productId ? { ...item, quantity: nextQty } : item))
        .filter((item) => Number(item.quantity) > 0)
    );
    setCartError('');
  }, [getAvailableQty]);

  const removeItem = useCallback((productId) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
    setCartError('');
  }, []);

  const cartQuantityByProductId = useMemo(
    () => Object.fromEntries(cart.map((item) => [item.productId, Number(item.quantity || 0)])),
    [cart]
  );

  const dayBillingMode = normalizeDayBillingMode(rentalSettingsDefaults.dayBillingMode);

  const applyDuration = useCallback((startDate, durationDays) => {
    const days = Math.max(1, Number(durationDays) || 1);
    const start = startDate || dayjs().format('YYYY-MM-DD');
    form.setValue('startDate', start, { shouldDirty: true, shouldValidate: true });
    form.setValue('durationDays', days, { shouldDirty: true, shouldValidate: true });
    form.setValue('endDate', getEndDateFromDuration(start, days, dayBillingMode), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [dayBillingMode, form]);

  useEffect(() => {
    if (!open) return;
    const start = form.getValues('startDate');
    const days = form.getValues('durationDays') || 1;
    form.setValue('endDate', getEndDateFromDuration(start, days, dayBillingMode), { shouldDirty: false });
  }, [open, dayBillingMode, form]);

  const rentalDays = useMemo(
    () => getRentalDayCount(watchedStart, watchedEnd, dayBillingMode) || Number(watchedDurationDays) || 1,
    [watchedStart, watchedEnd, watchedDurationDays, dayBillingMode]
  );

  const itemsPrice = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + Number(item.quantity || 0) * Number(item.rentalRatePerDay || 0),
        0
      ),
    [cart]
  );

  const subtotal = useMemo(
    () => Number((itemsPrice * rentalDays).toFixed(2)),
    [itemsPrice, rentalDays]
  );

  const estimatedTotal = Math.max(0, subtotal - Number(watchedDiscount || 0));

  const quotedDeposit = Number(watchedDepositAmount || 0);
  const collectingDepositNow = quotedDeposit > 0;

  const depositFooterSummary = useMemo(() => {
    if (!(quotedDeposit > 0)) return '';
    return `Deposit held today: ${formatAmount(quotedDeposit)}`;
  }, [quotedDeposit]);

  const hirePaymentMode = watchedHirePaymentMode || HIRE_PAYMENT_CREDIT;
  const collectingHireNow =
    hirePaymentMode === HIRE_PAYMENT_FULL || hirePaymentMode === HIRE_PAYMENT_PARTIAL;
  const hireAmountPaidNow = hirePaymentMode === HIRE_PAYMENT_FULL
    ? estimatedTotal
    : hirePaymentMode === HIRE_PAYMENT_PARTIAL
      ? Number(watchedHireAmountPaid || 0)
      : 0;
  const hireBalanceDue = Number(Math.max(0, estimatedTotal - hireAmountPaidNow).toFixed(2));
  const showPaymentMethod = collectingHireNow || collectingDepositNow;
  const needsPromisedPaymentDate =
    hirePaymentMode === HIRE_PAYMENT_CREDIT || hirePaymentMode === HIRE_PAYMENT_PARTIAL;

  const hireFooterSummary = useMemo(() => {
    const promisedLabel = watchedPromisedPaymentDate
      ? ` · Promised ${formatRentalDate(watchedPromisedPaymentDate)}`
      : '';
    if (hirePaymentMode === HIRE_PAYMENT_FULL) {
      return `Hire paid today: ${formatAmount(estimatedTotal)}`;
    }
    if (hirePaymentMode === HIRE_PAYMENT_PARTIAL) {
      return `Hire paid today: ${formatAmount(hireAmountPaidNow)} · Still to collect: ${formatAmount(hireBalanceDue)}${promisedLabel}`;
    }
    return `Hire on credit: ${formatAmount(estimatedTotal)}${promisedLabel || ' · Pay later'}`;
  }, [
    hirePaymentMode,
    estimatedTotal,
    hireAmountPaidNow,
    hireBalanceDue,
    watchedPromisedPaymentDate,
  ]);

  const catalogProductIds = useMemo(
    () => (catalog.length ? catalog : seedProducts).map((product) => product.id).filter(Boolean),
    [catalog, seedProducts]
  );

  const availabilityKey = useMemo(
    () =>
      JSON.stringify({
        startDate: watchedStart,
        endDate: watchedEnd,
        branchId: effectiveBranchId,
        productIds: catalogProductIds,
      }),
    [watchedStart, watchedEnd, effectiveBranchId, catalogProductIds]
  );
  const debouncedAvailabilityKey = useDebounce(availabilityKey, DEBOUNCE_DELAYS.SEARCH);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const parsed = JSON.parse(debouncedAvailabilityKey);
    if (
      !parsed.branchId ||
      !parsed.startDate ||
      !parsed.endDate ||
      !parsed.productIds?.length ||
      dayjs(parsed.endDate).isBefore(dayjs(parsed.startDate), 'day')
    ) {
      setAvailabilityResults([]);
      setAvailabilityLoading(false);
      return undefined;
    }

    const checkAvailability = async () => {
      setAvailabilityLoading(true);
      try {
        const response = await rentalService.checkAvailability({
          branchId: parsed.branchId,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          items: parsed.productIds.map((productId) => ({ productId, quantity: 1 })),
        });
        if (cancelled) return;
        const rows = response?.data?.items || [];
        setAvailabilityResults(Array.isArray(rows) ? rows : []);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to check rental availability', error);
        setAvailabilityResults([]);
      } finally {
        if (!cancelled) setAvailabilityLoading(false);
      }
    };

    checkAvailability();
    return () => {
      cancelled = true;
    };
  }, [open, debouncedAvailabilityKey]);

  const hasAvailabilityIssues = useMemo(() => {
    if (!cart.length || availabilityLoading) return false;
    return cart.some((item) => {
      const row = availabilityByProductId.get(item.productId);
      if (!row) return false;
      return Number(row.availableQty || 0) < Number(item.quantity || 0);
    });
  }, [cart, availabilityLoading, availabilityByProductId]);

  const availabilityReady = useMemo(() => {
    if (!cart.length || availabilityLoading) return false;
    return cart.every((item) => availabilityByProductId.has(item.productId));
  }, [cart, availabilityLoading, availabilityByProductId]);

  const { data: customersData } = useQuery({
    queryKey: queryKeys.customers.picker(
      activeTenantId,
      activeShopId,
      null,
      `rental-${debouncedCustomerSearch || 'all'}`
    ),
    queryFn: () =>
      customerService.getCustomers({
        search: debouncedCustomerSearch,
        limit: 20,
        isActive: true,
      }),
    staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
    enabled: open && !!activeTenantId,
  });

  const pickerCustomers = useMemo(() => {
    const list = Array.isArray(customersData?.data)
      ? customersData.data
      : customersData?.data?.customers || customersData?.customers || seedCustomers;
    return Array.isArray(list) ? list : [];
  }, [customersData, seedCustomers]);

  const selectedCustomer =
    pickerCustomers.find((customer) => customer.id === watchedCustomerId) ||
    seedCustomers.find((customer) => customer.id === watchedCustomerId) ||
    null;

  useEffect(() => {
    if (!watchedCustomerId || depositTouchedRef.current) return;
    const suggested = resolveSuggestedDepositAmount({
      customer: selectedCustomer,
      rentalSettings: rentalSettingsDefaults,
      rentalSubtotal: subtotal,
    });
    if (suggested != null && suggested > 0) {
      form.setValue('depositAmount', suggested, { shouldDirty: false });
    }
  }, [watchedCustomerId, selectedCustomer, rentalSettingsDefaults, subtotal, form]);

  const canSubmit =
    !!effectiveBranchId &&
    cart.length > 0 &&
    availabilityReady &&
    !hasAvailabilityIssues &&
    !!watchedCustomerId;

  const goToCheckout = useCallback(async () => {
    const valid = await form.trigger(['customerId', 'startDate', 'endDate', 'durationDays']);
    if (!valid) return;
    if (!cart.length) {
      setCartError('Tap a product to add it to this rental.');
      return;
    }
    if (!effectiveBranchId) {
      showError(null, 'No branch is configured. Add a location in Settings before creating a rental.');
      return;
    }
    if (hasAvailabilityIssues) {
      setCartError('One or more items are unavailable for the selected dates.');
      return;
    }
    if (!canSubmit) return;
    setCartError('');
    setCheckoutStep(true);
    setCartSheetOpen(false);
  }, [canSubmit, cart.length, effectiveBranchId, form, hasAvailabilityIssues]);

  const onSubmit = useCallback(
    async (values) => {
      if (submittingRef.current) return;
      if (!checkoutStep) {
        void goToCheckout();
        return;
      }
      if (!cart.length) {
        setCartError('Tap a product to add it to this rental.');
        return;
      }
      if (!effectiveBranchId) {
        showError(null, 'No branch is configured. Add a location in Settings before creating a rental.');
        return;
      }
      if (hasAvailabilityIssues) {
        setCartError('One or more items are unavailable for the selected dates.');
        return;
      }

      const hireMode = values.hirePaymentMode || HIRE_PAYMENT_CREDIT;
      const hireDue = Math.max(0, Number(estimatedTotal.toFixed(2)));
      if (hireMode === HIRE_PAYMENT_PARTIAL) {
        const paidNow = Number(values.hireAmountPaid);
        if (!Number.isFinite(paidNow) || paidNow <= 0) {
          form.setError('hireAmountPaid', { message: 'Enter the amount being paid now' });
          return;
        }
        if (paidNow >= hireDue) {
          form.setError('hireAmountPaid', {
            message: 'Amount paid now must be less than the hire due. Use full payment.',
          });
          return;
        }
      }

      submittingRef.current = true;
      setSubmitting(true);
      try {
        const quotedDepositAmount = Number(values.depositAmount || 0);
        const collectingHire = hireMode === HIRE_PAYMENT_FULL || hireMode === HIRE_PAYMENT_PARTIAL;
        const collectingDeposit = quotedDepositAmount > 0;
        const hirePaid = hireMode === HIRE_PAYMENT_FULL
          ? hireDue
          : hireMode === HIRE_PAYMENT_PARTIAL
            ? Number(values.hireAmountPaid || 0)
            : 0;
        const paymentMethod = (collectingHire || collectingDeposit)
          ? (values.paymentMethod || 'cash')
          : 'credit';

        await rentalService.createRental({
          customerId: values.customerId,
          branchId: effectiveBranchId,
          startDate: values.startDate,
          endDate: values.endDate,
          paymentMethod,
          amountPaid: hirePaid,
          discountAmount: Number(values.discountAmount || 0),
          depositAmount: quotedDepositAmount,
          depositPaid: collectingDeposit,
          operationalLocation: String(values.operationalLocation || '').trim() || undefined,
          ...((hireMode === HIRE_PAYMENT_CREDIT || hireMode === HIRE_PAYMENT_PARTIAL)
            && String(values.promisedPaymentDate || '').trim()
            ? { promisedPaymentDate: String(values.promisedPaymentDate).trim() }
            : {}),
          ...(String(values.deliveryAddress || '').trim()
            ? { scheduleDelivery: { address: { line1: String(values.deliveryAddress).trim() } } }
            : {}),
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            rentalRatePerDay: Number(item.rentalRatePerDay || 0),
          })),
        });
        showSuccess('Rental created successfully');
        onOpenChange(false);
        onCreated?.();
      } catch (error) {
        console.error('Failed to create rental', error);
        showError(error, 'Failed to create rental');
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [cart, checkoutStep, effectiveBranchId, estimatedTotal, form, goToCheckout, hasAvailabilityIssues, onCreated, onOpenChange]
  );

  const cartPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-4 p-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Cart</Label>
              {cart.length > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setCart([])}>
                  Clear
                </Button>
              ) : null}
            </div>
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-md border border-dashed border-border px-3 py-6 text-center">
                Tap a product to hire it out. Daily rates and late fees are set on the product.
              </p>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => {
                  const lineTotal =
                    Number(item.quantity || 0) * Number(item.rentalRatePerDay || 0) * rentalDays;
                  return (
                    <div key={item.productId} className="rounded-md border border-border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatAmount(item.rentalRatePerDay)}/day
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          onClick={() => removeItem(item.productId)}
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-11 w-11"
                            onClick={() => adjustQuantity(item.productId, -1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Input
                            className="h-11 w-14 text-center"
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(event) => setQuantity(item.productId, event.target.value)}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-11 w-11"
                            onClick={() => adjustQuantity(item.productId, 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <span className="font-semibold text-foreground">{formatAmount(lineTotal)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {cartError ? <p className="text-sm text-destructive">{cartError}</p> : null}
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <Label>Duration</Label>
            <div className="grid grid-cols-3 gap-2">
              <FormField
                control={form.control}
                name="durationDays"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Days</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        step={1}
                        value={field.value ?? 1}
                        onChange={(event) => applyDuration(watchedStart, event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value}
                        onChange={(event) => applyDuration(event.target.value, watchedDurationDays)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Return date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value}
                        onChange={(event) => {
                          const nextEnd = event.target.value;
                          field.onChange(nextEnd);
                          const nextDays = getRentalDayCount(watchedStart, nextEnd, dayBillingMode);
                          if (nextDays > 0) {
                            form.setValue('durationDays', nextDays, { shouldDirty: true, shouldValidate: true });
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Start: {formatRentalDate(watchedStart)} · Return: {formatRentalDate(watchedEnd)}
              {dayBillingMode === 'overnight'
                ? ' · Overnight: 1 day returns the next day.'
                : ' · End of day: 1 day is a same-day return.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Customer</Label>
            <div className="flex gap-2">
              <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 flex-1 justify-between font-normal border-border"
                  >
                    <span className="truncate text-left">
                      {selectedCustomer?.name || (
                        <span className="text-muted-foreground">Search customers</span>
                      )}
                    </span>
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or phone"
                        value={customerSearch}
                        onChange={(event) => setCustomerSearch(event.target.value)}
                        className="h-9 pl-8 border-0 focus-visible:ring-0"
                        autoFocus
                      />
                    </div>
                  </div>
                  <ScrollArea className="max-h-48">
                    {pickerCustomers.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        {customerSearch
                          ? 'No customers found. Add a customer from the Customers page first.'
                          : 'Type to search customers'}
                      </p>
                    ) : (
                      <ul className="p-1">
                        {pickerCustomers.map((customer) => (
                          <li key={customer.id}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-muted rounded-md text-sm"
                              onClick={() => {
                                form.setValue('customerId', customer.id, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                                setCustomerPickerOpen(false);
                              }}
                            >
                              <span className="font-medium text-foreground">{customer.name}</span>
                              {customer.phone ? (
                                <span className="block text-xs text-muted-foreground">{customer.phone}</span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              {watchedCustomerId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={() => form.setValue('customerId', '', { shouldDirty: true })}
                  aria-label="Clear customer"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            {form.formState.errors.customerId ? (
              <p className="text-sm text-destructive">{form.formState.errors.customerId.message}</p>
            ) : null}
          </div>

          <FormField
            control={form.control}
            name="operationalLocation"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Operational location (optional)
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Where will this gear be used?"
                    {...field}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Set, shoot, or venue — not the same as delivery address.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2 rounded-md border border-border p-3">
            <Label>Hire fee</Label>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Item(s) price</span>
              <span>{formatAmount(itemsPrice)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Rent duration</span>
              <span className="text-right">
                {rentalDays} day{rentalDays === 1 ? '' : 's'}
                {watchedStart && watchedEnd
                  ? ` (${formatRentalDate(watchedStart)} – ${formatRentalDate(watchedEnd)})`
                  : ''}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Total ({formatAmount(itemsPrice)} × {rentalDays} day{rentalDays === 1 ? '' : 's'})
              </span>
              <span>{formatAmount(subtotal)}</span>
            </div>
            <FormField
              control={form.control}
              name="discountAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount (optional)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="text-sm font-medium">Hire due</span>
              <span className="text-base font-semibold text-green-700">{formatAmount(estimatedTotal)}</span>
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border pt-3 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {rentalDays} day{rentalDays === 1 ? '' : 's'} · {cart.length} item{cart.length === 1 ? '' : 's'}
          </span>
          <span className="text-lg font-semibold text-green-700">
            {formatAmount(estimatedTotal)}
          </span>
        </div>
        <Button
          type="button"
          className="w-full h-11"
          disabled={!canSubmit}
          onClick={goToCheckout}
        >
          {availabilityLoading ? 'Checking availability…' : 'Checkout'}
        </Button>
        {!effectiveBranchId ? (
          <p className="text-xs text-destructive">
            No branch is configured yet. Complete workspace setup or add a location.
          </p>
        ) : null}
      </div>
    </div>
  );

  const checkoutPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="h-full min-h-0 flex-1">
        <div className="space-y-4 p-1">
          <div className="rounded-md border border-border p-3 space-y-1 text-sm">
            <p className="font-medium text-foreground">{selectedCustomer?.name || 'Customer'}</p>
            <p className="text-muted-foreground">
              {rentalDays} day{rentalDays === 1 ? '' : 's'} · {formatRentalDate(watchedStart)} – {formatRentalDate(watchedEnd)}
            </p>
            <p className="text-muted-foreground">
              {cart.length} item{cart.length === 1 ? '' : 's'} · Hire due {formatAmount(estimatedTotal)}
            </p>
          </div>

          <FormField
            control={form.control}
            name="hirePaymentMode"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Hire payment</FormLabel>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid grid-cols-3 gap-2"
                  >
                    <label
                      htmlFor="hire-pay-full"
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2.5"
                    >
                      <RadioGroupItem id="hire-pay-full" value={HIRE_PAYMENT_FULL} />
                      <span className="text-sm font-medium text-foreground">Full payment</span>
                    </label>
                    <label
                      htmlFor="hire-pay-partial"
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2.5"
                    >
                      <RadioGroupItem id="hire-pay-partial" value={HIRE_PAYMENT_PARTIAL} />
                      <span className="text-sm font-medium text-foreground">Partial payment</span>
                    </label>
                    <label
                      htmlFor="hire-pay-credit"
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2.5"
                    >
                      <RadioGroupItem id="hire-pay-credit" value={HIRE_PAYMENT_CREDIT} />
                      <span className="text-sm font-medium text-foreground">Credit</span>
                    </label>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className={
            hirePaymentMode === HIRE_PAYMENT_PARTIAL
              ? 'grid grid-cols-3 gap-3'
              : hirePaymentMode === HIRE_PAYMENT_CREDIT
                ? 'grid grid-cols-2 gap-3'
                : ''
          }>
            {hirePaymentMode === HIRE_PAYMENT_PARTIAL ? (
              <FormField
                control={form.control}
                name="hireAmountPaid"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Amount being paid</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={field.value === '' || field.value == null ? '' : field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Balance due: {formatAmount(hireBalanceDue)}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="depositAmount"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel>Security deposit (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={field.value === '' || field.value == null ? '' : field.value}
                      onChange={(event) => {
                        depositTouchedRef.current = true;
                        field.onChange(event.target.value);
                      }}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Held against damage, not hire.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {needsPromisedPaymentDate ? (
              <FormField
                control={form.control}
                name="promisedPaymentDate"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Promised payment date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        min={dayjs().format('YYYY-MM-DD')}
                        value={field.value || ''}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
          </div>

          {showPaymentMethod ? (
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Payment method</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid grid-cols-3 gap-2"
                    >
                      {DEPOSIT_PAYMENT_METHOD_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          htmlFor={`pay-method-${option.value}`}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-3"
                        >
                          <RadioGroupItem id={`pay-method-${option.value}`} value={option.value} />
                          <span className="text-sm font-medium text-foreground">{option.label}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          <FormField
            control={form.control}
            name="deliveryAddress"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Delivery address (optional)
                </FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="Where should this be delivered?"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border pt-3 space-y-3">
        <p className="text-xs text-muted-foreground">{hireFooterSummary}</p>
        {depositFooterSummary ? (
          <p className="text-xs text-muted-foreground">{depositFooterSummary}</p>
        ) : null}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setCheckoutStep(false)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button
            type="submit"
            className="flex-1 h-11"
            loading={submitting}
            disabled={!canSubmit}
          >
            Create rental
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:left-0 sm:top-0 sm:translate-x-0 sm:translate-y-0 sm:w-screen sm:min-w-full sm:min-h-[100dvh] sm:max-h-[100dvh] sm:rounded-none gap-0"
          onEscapeKeyDown={(event) => {
            if (checkoutStep) {
              event.preventDefault();
              setCheckoutStep(false);
            }
          }}
        >
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle>New Rental</DialogTitle>
            <DialogDescription>
              Tap products to hire them out. Daily rates and late fees come from each product.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              id="rental-checkout-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex-1 min-h-0 flex flex-col"
            >
              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-4 px-4 sm:px-6 py-3">
                <div className="lg:col-span-3 flex flex-col min-h-0">
                  <POSProductSearch
                    onSearch={searchProducts}
                    getProductByBarcode={getProductByBarcode}
                    resolveProductFromQRPayload={resolveProductFromQRPayload}
                    onSelectProduct={addToCart}
                    allProducts={catalogProducts}
                    productsLoading={productsLoading}
                    cartQuantityByProductId={cartQuantityByProductId}
                    fillHeight
                    onAdjustProductQuantity={adjustQuantity}
                    scanningEnabled={scanningEnabled}
                  />
                </div>
                <div className="hidden lg:block lg:col-span-2 min-h-0">
                  {cartPanel}
                </div>
              </div>

              {checkoutStep ? (
                <div
                  className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
                  onClick={() => setCheckoutStep(false)}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="rental-checkout-overlay-title"
                    className="flex h-[min(92dvh,40rem)] w-full max-w-[min(92vw,42rem)] flex-col overflow-hidden rounded-lg border border-border bg-background"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                      <div>
                        <h2
                          id="rental-checkout-overlay-title"
                          className="text-lg font-semibold text-foreground"
                        >
                          Checkout
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Choose how the hire and deposit are paid, then create the rental.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={() => setCheckoutStep(false)}
                        aria-label="Close checkout"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
                      {checkoutPanel}
                    </div>
                  </div>
                </div>
              ) : null}
            </form>
          </Form>

          {!isDesktop ? (
            <div className="lg:hidden shrink-0 border-t border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex items-center gap-2 min-w-0 text-left min-h-[44px]"
                  onClick={() => setCartSheetOpen(true)}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs text-muted-foreground">
                      {cart.length} item{cart.length === 1 ? '' : 's'} · Tap to review
                    </span>
                    <span className="text-lg font-semibold text-green-700 truncate">
                      {formatAmount(estimatedTotal)}
                    </span>
                  </div>
                  <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
                </button>
                <Button
                  type="button"
                  className="h-11"
                  disabled={!canSubmit}
                  onClick={goToCheckout}
                >
                  Checkout
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Sheet open={cartSheetOpen && !checkoutStep} onOpenChange={setCartSheetOpen}>
        <SheetContent
          side="bottom"
          className="h-[min(92dvh,760px)] p-0 flex flex-col rounded-t-xl border-t border-border"
        >
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0 text-left">
            <SheetTitle className="flex items-center gap-2">
              Rental cart
              {cart.length > 0 ? (
                <Badge variant="secondary">
                  {cart.length} item{cart.length === 1 ? '' : 's'}
                </Badge>
              ) : null}
            </SheetTitle>
          </SheetHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex-1 min-h-0 overflow-hidden px-4 pb-4"
            >
              {cartPanel}
            </form>
          </Form>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default RentalCheckoutDialog;
