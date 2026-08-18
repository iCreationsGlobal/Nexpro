/**
 * POS (Point of Sale) Page
 *
 * Digital POS that runs on phone, tablet, and laptop. Full-featured checkout:
 * - Online-only checkout (use mobile app for offline sales)
 * - Mobile money (direct MTN/AirtelTigo APIs; Paystack fallback), cash, card, credit
 * - Multi-channel receipts (Print, SMS, WhatsApp, Email)
 * - Responsive layout for phone, tablet, and desktop
 * - Scan Mode: full-screen barcode/QR scanning for quick checkout
 * - Works on low-end devices and slow networks
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { computeDocumentTax } from '../utils/taxCalculationClient';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Users, Loader2, Camera, CreditCard, UserPlus, Phone, Building2, AlertCircle, ChevronDown, ChevronUp, X, Undo2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import FindSaleForReturnDialog from '../components/sales/FindSaleForReturnDialog';
import SaleReturnWizard from '../components/sales/SaleReturnWizard';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

// POS Components
import POSCart from '../components/pos/POSCart';
import POSProductSearch from '../components/pos/POSProductSearch';
import POSPaymentModal from '../components/pos/POSPaymentModal';
import POSReceiptModal from '../components/pos/POSReceiptModal';
import POSConnectionStatus from '../components/pos/POSConnectionStatus';
import POSScanMode from '../components/pos/POSScanMode';
import FeatureNotAvailable from '../components/FeatureNotAvailable';

// Hooks and Services
import { usePOS } from '../hooks/usePOS';
import { usePOSDealerMode } from '../hooks/usePOSDealerMode';
import { usePOSConfig, useScanningEnabled } from '../hooks/usePOSConfig';
import { usePaymentSettings } from '../hooks/usePaymentSettings';
import { useAuth } from '../context/AuthContext';
import { useShopOptional } from '../context/ShopContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { useDebounce } from '../hooks/useDebounce';
import { useResponsive, useSafeAreaInsets } from '../hooks/useResponsive';
import customerService from '../services/customerService';
import settingsService from '../services/settingsService';
import saleService from '../services/saleService';
import mobileMoneyService from '../services/mobileMoneyService';
import productService from '../services/productService';
import dealerService from '../services/dealerService';

// Utils
import { showSuccess, showError } from '../utils/toast';
import { guardOnline, ONLINE_REQUIRED_MESSAGE } from '../utils/onlineRequired';
import { normalizePhone, validatePhone } from '../utils/phoneUtils';
import { mergeBranchOrganization } from '../utils/branchOrganization';
import { CURRENCY, DEBOUNCE_DELAYS, QUERY_CACHE } from '../constants';
import { formatAmount } from '../utils/formatNumber';
import {
  getActiveVariants,
  getCatalogUnitPrice,
  getProductStockQuantity,
  isProductOutOfStock,
  isVariantOutOfStock,
} from '../utils/productStock';
import { FEATURE_NOT_AVAILABLE } from '../constants/microcopy';
import { QUERY_STALE, refreshAfterSale } from '../utils/queryInvalidation';
import { queryKeys } from '../utils/queryKeys';
import { shouldSkipReceiptModal } from '../utils/receiptChannels';

/**
 * Generate cart item ID
 */
const generateCartItemId = () => {
  return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const getProductCode = (product) => {
  const alias = product?.productCode
    || product?.alternateBarcode
    || product?.barcodeAliases?.[0]
    || product?.barcodes?.find?.((barcode) => barcode?.isActive !== false)?.barcode;

  return String(alias || '').trim();
};

const getVariantLabel = (variant) => {
  if (!variant) return '';
  const attributeText = Object.values(variant.attributes || {})
    .filter(Boolean)
    .join(' / ');
  return variant.name || attributeText || variant.sku || 'Variant';
};

const buildCartItemFromProduct = (product, variant = null) => {
  const variantLabel = getVariantLabel(variant);
  const name = variant ? `${product.name} - ${variantLabel}` : product.name;
  const catalogUnitPrice = getCatalogUnitPrice(product, variant);

  return {
    id: generateCartItemId(),
    productId: product.id,
    productVariantId: variant?.id || null,
    name,
    sku: variant?.sku || product.sku,
    productCode: variant?.barcode || getProductCode(product),
    unit: variant?.unit || product.unit || undefined,
    baseUnitPrice: catalogUnitPrice,
    catalogUnitPrice,
    unitPrice: catalogUnitPrice,
    priceOverridden: false,
    quantity: 1,
    discount: 0,
    tax: 0,
    trackStock: variant?.trackStock ?? product?.trackStock,
    quantityOnHand: variant?.quantityOnHand ?? getProductStockQuantity(product),
  };
};

const ProductVariantDialog = ({ product, open, onClose, onSelect }) => {
  const variants = useMemo(() => getActiveVariants(product), [product]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:w-[var(--modal-w-sm)]">
        <DialogHeader>
          <DialogTitle>Select Variant</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Choose a variant for {product?.name || 'this product'}.
            </p>
            {variants.map((variant) => {
              const outOfStock = isVariantOutOfStock(product, variant);
              return (
                <button
                  key={variant.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => onSelect(variant)}
                  className={`w-full rounded-lg border border-border p-3 text-left transition-colors ${
                    outOfStock ? 'bg-muted opacity-60 cursor-not-allowed' : 'hover:bg-green-50 hover:border-green-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{getVariantLabel(variant)}</div>
                      <div className="text-xs text-muted-foreground">
                        {variant.sku ? `SKU: ${variant.sku}` : 'No SKU'}
                        {variant.barcode ? ` • ${variant.barcode}` : ''}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold text-green-700">{formatAmount(getCatalogUnitPrice(product, variant))}</div>
                      <div className="text-xs text-muted-foreground">
                        {variant.trackStock === false || product?.trackStock === false
                          ? 'Made to order'
                          : outOfStock
                            ? 'Out of stock'
                            : `Stock: ${Number(variant.quantityOnHand || 0)}`}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </DialogBody>
        <DialogFooter>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Customer selection dialog: search existing or quick-add (phone + name)
 */
const CustomerSelectDialog = ({ isOpen, onClose, onSelect, onFindOrCreate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickName, setQuickName] = useState('');
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddError, setQuickAddError] = useState(null);
  const debouncedSearch = useDebounce(searchQuery, DEBOUNCE_DELAYS.SEARCH);
  const { activeTenantId } = useAuth();
  const shopContext = useShopOptional();
  const activeShopId = shopContext?.activeShopId ?? null;

  const { data: customersData, isLoading } = useQuery({
    queryKey: queryKeys.customers.picker(activeTenantId, activeShopId, null, `pos-${debouncedSearch || 'all'}`),
    queryFn: () => customerService.getCustomers({
      search: debouncedSearch,
      limit: 20,
      isActive: true
    }),
    staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
    enabled: isOpen && !!activeTenantId && (!shopContext?.isShopWorkspace || !!activeShopId)
  });

  const customers = Array.isArray(customersData?.data) ? customersData.data : (customersData?.data?.customers || customersData?.customers || []);

  const handleQuickAdd = useCallback(async () => {
    const phone = (quickPhone || '').trim();
    if (!phone) {
      setQuickAddError('Phone is required');
      return;
    }
    const { valid, error } = validatePhone(phone);
    if (!valid) {
      setQuickAddError(error || 'Invalid phone format');
      return;
    }
    setQuickAddError(null);
    setQuickAddLoading(true);
    try {
      const customer = await onFindOrCreate(phone, (quickName || '').trim());
      if (customer) {
        onSelect(customer);
        onClose();
      } else {
        setQuickAddError('Could not add customer');
      }
    } catch (err) {
      setQuickAddError(err?.message || 'Failed to add customer');
    } finally {
      setQuickAddLoading(false);
    }
  }, [quickPhone, quickName, onFindOrCreate, onSelect, onClose]);

  const resetQuickForm = useCallback(() => {
    setQuickPhone('');
    setQuickName('');
    setQuickAddError(null);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetQuickForm(); onClose(); }}>
      <DialogContent className="sm:w-[var(--modal-w-md)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Select Customer
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
        {/* Quick add customer: phone (required) + name */}
        <div className="p-3 bg-muted rounded-lg border border-border space-y-2">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Quick add customer
          </p>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Phone (required)</label>
              <div className="relative mt-0.5">
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="tel"
                  placeholder="0XX XXX XXXX"
                  value={quickPhone}
                  onChange={(e) => { setQuickPhone(e.target.value); setQuickAddError(null); }}
                  className="h-10 pl-9"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Name (optional)</label>
              <Input
                placeholder="Customer name"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                className="h-10 mt-0.5"
              />
            </div>
            {quickAddError && (
              <p className="text-xs text-red-600">{quickAddError}</p>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-500 py-3">Or search existing</p>
        <Input
          placeholder="Search customers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-12"
        />

        <ScrollArea className="max-h-64">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No customers found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {customers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted cursor-pointer border border-transparent hover:border-border"
                  onClick={() => {
                    onSelect(customer);
                    onClose();
                  }}
                >
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-700 font-semibold">
                      {(customer.name || customer.company || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{customer.name || customer.company || 'No name'}</p>
                    <p className="text-sm text-muted-foreground truncate">{customer.phone || customer.email || ''}</p>
                  </div>
                  {customer.creditLimit > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Credit</p>
                      <p className="text-sm font-medium text-green-600">
                        {formatAmount(customer.creditLimit - (customer.balance || 0))}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        </DialogBody>
        <DialogFooter>
          <SecondaryButton onClick={onClose}>
            Cancel
          </SecondaryButton>
          <Button
            onClick={handleQuickAdd}
            loading={quickAddLoading}
            disabled={!quickPhone.trim()}
            className="bg-brand hover:bg-brand-dark"
          >
            Add & use
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Main POS Page Component
 */
const POS = () => {
  const { activeTenant, activeTenantId, user, isManager, isAdmin, hasFeature } = useAuth();
  const businessType = activeTenant?.businessType || null;
  const shopType =
    activeTenant?.metadata?.businessSubType ||
    activeTenant?.metadata?.shopType ||
    null;
  const isShop = businessType === 'shop';
  const isRestaurant = shopType === 'restaurant';
  const tenantIdForProducts = activeTenantId || (typeof localStorage !== 'undefined' ? localStorage.getItem('activeTenantId') : null);
  const shopContext = useShopOptional();
  const activeShopId = shopContext?.activeShopId ?? null;
  const queryClient = useQueryClient();

  const { posConfig } = usePOSConfig();
  const { scanningEnabled } = useScanningEnabled();

  const {
    isOnline,
    searchProducts,
    getProductByBarcode,
    resolveProductFromQRPayload,
    processSale,
    getQuickAddItems,
    addQuickItem,
    removeQuickAddItem,
  } = usePOS();

  const {
    dealersEnabled,
    posSaleMode,
    isDealerMode,
    switchPosSaleMode,
    selectedDealer,
    selectDealer,
    clearDealerSelection,
    dealerSearch,
    setDealerSearch,
    dealerOptions,
    dealerSearchLoading,
    dealerSummary,
    canOverrideCredit,
    applyDealerPriceToItem,
  } = usePOSDealerMode({ activeShopId, enabled: hasFeature('dealersAccount') });

  // Cart state
  const [cart, setCart] = useState([]);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [quickCustomerName, setQuickCustomerName] = useState('');
  const [quickCustomerPhone, setQuickCustomerPhone] = useState('');

  // UI state
  const [dealerPickerOpen, setDealerPickerOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalStayOpen, setPaymentModalStayOpen] = useState(() => {
    try {
      return localStorage.getItem('pos_payment_modal_stay_open') === 'true';
    } catch {
      return false;
    }
  });
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [customerForReceipt, setCustomerForReceipt] = useState(null);
  const [mobileMoneyState, setMobileMoneyState] = useState('idle'); // idle | initiating | awaiting_otp | waiting | success | failed
  const [mobileMoneyError, setMobileMoneyError] = useState('');
  const [mobileMoneyOtpHint, setMobileMoneyOtpHint] = useState('');
  const [mobileMoneyFallbackMode, setMobileMoneyFallbackMode] = useState(null); // null | 'manual'
  const otpWaitRef = useRef(null);
  const [variantPickerProduct, setVariantPickerProduct] = useState(null);
  const [customItemDialogOpen, setCustomItemDialogOpen] = useState(false);
  const [customItemForm, setCustomItemForm] = useState({
    name: '',
    unitPrice: '',
    quantity: '1',
    saveAsProduct: false,
  });

  useEffect(() => {
    if (!isOnline) {
      setMobileMoneyFallbackMode('manual');
    } else if (mobileMoneyFallbackMode === 'manual' && mobileMoneyState === 'idle') {
      setMobileMoneyFallbackMode(null);
    }
  }, [isOnline, mobileMoneyFallbackMode, mobileMoneyState]);

  /** When waiting for MoMo, WebSocket can push sale completed so we stop polling and show success immediately */
  const waitingMoMoSaleIdRef = useRef(null);
  const wsCompletedSaleIdRef = useRef(null);

  const waitForMobileMoneyOtp = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (otpWaitRef.current?.reject) {
        otpWaitRef.current.reject(new Error('OTP entry cancelled'));
      }
      otpWaitRef.current = { resolve, reject };
    });
  }, []);

  const handleSubmitMobileMoneyOtp = useCallback((otp) => {
    const cleaned = String(otp || '').trim();
    if (!cleaned || !otpWaitRef.current?.resolve) return;
    const { resolve } = otpWaitRef.current;
    otpWaitRef.current = null;
    resolve(cleaned);
  }, []);

  const handleSaleCreated = useCallback((data) => {
    if (waitingMoMoSaleIdRef.current && data?.sale?.id === waitingMoMoSaleIdRef.current && data?.sale?.status === 'completed') {
      wsCompletedSaleIdRef.current = data.sale.id;
    }
  }, []);
  const handleSaleUpdated = useCallback((data) => {
    if (waitingMoMoSaleIdRef.current && data?.sale?.id === waitingMoMoSaleIdRef.current && data?.sale?.status === 'completed') {
      wsCompletedSaleIdRef.current = data.sale.id;
    }
  }, []);

  useWebSocket({
    enabled: !!activeTenantId,
    onSaleCreated: handleSaleCreated,
    onSaleUpdated: handleSaleUpdated,
  });

  // Scan Mode state
  const [scanModeOpen, setScanModeOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [findSaleReturnOpen, setFindSaleReturnOpen] = useState(false);
  const [returnSale, setReturnSale] = useState(null);
  const { isMobile: isMobileWidth } = useResponsive();
  const safeAreaInsets = useSafeAreaInsets();
  const [isMobile, setIsMobile] = useState(isMobileWidth);

  const { data: activeProductsFromQuery, refetch: refetchActiveProducts, isLoading: productsLoading } = useQuery({
    queryKey: queryKeys.products.active(tenantIdForProducts, activeShopId),
    queryFn: () => productService.getAllActiveProducts(),
    enabled: !!tenantIdForProducts && (!isShop || !!activeShopId),
    staleTime: QUERY_STALE.TRANSACTIONAL,
    refetchOnWindowFocus: false,
  });
  const allProducts = useMemo(
    () => (Array.isArray(activeProductsFromQuery) ? activeProductsFromQuery : []),
    [activeProductsFromQuery]
  );

  const dealerCatalogProductIds = useMemo(() => {
    if (!isDealerMode || !selectedDealer?.id) return [];
    return allProducts.map((p) => p?.id).filter(Boolean);
  }, [isDealerMode, selectedDealer?.id, allProducts]);

  const { data: dealerPriceByProductId = {} } = useQuery({
    queryKey: ['pos-dealer-catalog-prices', selectedDealer?.id, activeShopId, dealerCatalogProductIds],
    queryFn: async () => {
      if (!selectedDealer?.id || !activeShopId || dealerCatalogProductIds.length === 0) {
        return {};
      }
      const NULL_VARIANT = '00000000-0000-0000-0000-000000000000';
      const items = dealerCatalogProductIds.map((productId) => ({
        productId,
        productVariantId: null,
      }));
      const res = await dealerService.resolvePricesBatch(selectedDealer.id, {
        shopId: activeShopId,
        items,
      });
      const raw = res?.data?.data || res?.data || {};
      const byProductId = {};
      Object.entries(raw).forEach(([key, value]) => {
        const [productId, variantKey] = key.split(':');
        if (!productId || value?.unitPrice == null) return;
        if (variantKey === NULL_VARIANT || !byProductId[productId]) {
          byProductId[productId] = value;
        }
      });
      return byProductId;
    },
    enabled: Boolean(isDealerMode && selectedDealer?.id && activeShopId && dealerCatalogProductIds.length > 0),
    staleTime: 60_000,
  });

  const cartQuantityByProductId = useMemo(() => {
    const map = {};
    cart.forEach((item) => {
      if (item.productId) map[item.productId] = (map[item.productId] || 0) + (Number(item.quantity) || 0);
    });
    return map;
  }, [cart]);
  
  // Detect mobile based on viewport width with a light UA hint
  useEffect(() => {
    const uaIsMobile =
      typeof navigator !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    setIsMobile(isMobileWidth || uaIsMobile);
  }, [isMobileWidth]);

  // Fetch organization settings
  const { data: orgSettingsData } = useQuery({
    queryKey: queryKeys.settings.organization(activeTenantId),
    queryFn: () => settingsService.getOrganizationSettings(),
    staleTime: QUERY_CACHE.STALE_TIME_STABLE
  });

  const {
    paymentCollectionConfigured,
    onlinePaymentRequired,
    isLoading: paymentCollectionLoading,
  } = usePaymentSettings();

  // API returns { success, data: organization }; axios wraps as { data: { success, data: organization } }
  const organizationSettings = orgSettingsData?.data?.data || orgSettingsData?.data?.organization || orgSettingsData?.data || {};
  const scopedOrganizationSettings = useMemo(
    () => mergeBranchOrganization(shopContext?.activeShop || null, organizationSettings),
    [shopContext?.activeShop, organizationSettings]
  );

  const posTaxConfig = useMemo(() => {
    const t = organizationSettings?.tax || {};
    return {
      enabled: t.enabled === true,
      defaultRatePercent: parseFloat(t.defaultRatePercent) || 0,
      pricesAreTaxInclusive: t.pricesAreTaxInclusive === true
    };
  }, [organizationSettings]);

  // Fetch customers list for cart dropdown (Select existing)
  const { data: customersData } = useQuery({
    queryKey: queryKeys.customers.picker(activeTenantId, activeShopId, null, 'pos-list'),
    queryFn: () => customerService.getCustomers({ limit: 200, isActive: true }),
    staleTime: QUERY_STALE.LIST,
    enabled: !!activeTenantId && (!shopContext?.isShopWorkspace || !!activeShopId)
  });
  const customersList = Array.isArray(customersData?.data) ? customersData.data : (customersData?.data?.customers || customersData?.customers || []);

  const refreshSaleQueries = useCallback(() => {
    refreshAfterSale(queryClient).catch((error) => {
      console.error('[POS] Failed to refresh sale queries:', error);
    });
  }, [queryClient]);

  const cartTotals = useMemo(() => {
    const lines = cart.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount || 0
    }));
    const computed = computeDocumentTax({
      lines,
      cartDiscount,
      config: posTaxConfig
    });
    const itemDiscounts = cart.reduce((sum, item) => sum + (item.discount || 0), 0);
    const taxLabel = organizationSettings?.tax?.displayLabel || 'Tax';
    return {
      subtotal: computed.subtotal,
      itemDiscounts,
      cartDiscount,
      totalDiscount: computed.discount,
      netBeforeTax: computed.netTaxable,
      taxAmount: computed.taxAmount,
      taxLabel,
      total: Math.max(0, computed.total),
      itemCount: cart.reduce((sum, item) => sum + item.quantity, 0)
    };
  }, [cart, cartDiscount, posTaxConfig, organizationSettings?.tax?.displayLabel]);

  useEffect(() => {
    if (!isDealerMode) return;
    setSelectedCustomer(null);
    setQuickCustomerName('');
    setQuickCustomerPhone('');
  }, [isDealerMode]);

  // Add product to cart
  const addResolvedItemToCart = useCallback(async (product, variant = null) => {
    if (isDealerMode && !selectedDealer) {
      showError('Select a dealer account before adding products');
      return;
    }
    if (variant ? isVariantOutOfStock(product, variant) : isProductOutOfStock(product)) {
      showError(null, `${product.name || 'Product'} is out of stock and cannot be sold.`);
      return;
    }

    let newItem = buildCartItemFromProduct(product, variant);
    if (isDealerMode) {
      newItem = await applyDealerPriceToItem(newItem);
    }

    setCart(prevCart => {
      const variantId = variant?.id || null;
      const existingIndex = prevCart.findIndex(item => 
        item.productId === product.id && (item.productVariantId || null) === variantId
      );

      if (existingIndex >= 0) {
        const newCart = [...prevCart];
        newCart[existingIndex] = {
          ...newCart[existingIndex],
          quantity: newCart[existingIndex].quantity + 1,
          ...(isDealerMode ? {
            unitPrice: newItem.unitPrice,
            baseUnitPrice: newItem.baseUnitPrice,
            catalogUnitPrice: newItem.catalogUnitPrice,
          } : {}),
        };
        return newCart;
      }

      return [...prevCart, newItem];
    });
  }, [isDealerMode, selectedDealer, applyDealerPriceToItem]);

  const addToCart = useCallback((product) => {
    const selectedVariant = product?.selectedVariant;
    if (selectedVariant?.id) {
      addResolvedItemToCart(product, selectedVariant);
      return;
    }

    const variants = getActiveVariants(product);
    if (variants.length > 0) {
      setVariantPickerProduct(product);
      return;
    }

    addResolvedItemToCart(product, null);
  }, [addResolvedItemToCart]);

  const resetCustomItemForm = useCallback(() => {
    setCustomItemForm({
      name: '',
      unitPrice: '',
      quantity: '1',
      saveAsProduct: false,
    });
  }, []);

  const handleOpenCustomItemDialog = useCallback(() => {
    resetCustomItemForm();
    setCustomItemDialogOpen(true);
  }, [resetCustomItemForm]);

  const handleAddCustomItem = useCallback(() => {
    const name = customItemForm.name.trim();
    const unitPrice = Number(customItemForm.unitPrice);
    const quantity = Number(customItemForm.quantity);

    if (!name) {
      showError('Custom item name is required');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      showError('Unit price must be greater than or equal to 0');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showError('Quantity must be greater than 0');
      return;
    }

    setCart((prevCart) => [
      ...prevCart,
      {
        id: generateCartItemId(),
        type: 'custom',
        productId: null,
        productVariantId: null,
        name,
        sku: null,
        productCode: null,
        baseUnitPrice: unitPrice,
        catalogUnitPrice: null,
        unitPrice,
        priceOverridden: false,
        quantity,
        discount: 0,
        tax: 0,
        saveAsProduct: customItemForm.saveAsProduct === true,
      },
    ]);
    setCustomItemDialogOpen(false);
    resetCustomItemForm();
  }, [customItemForm, resetCustomItemForm]);

  const handleSelectVariant = useCallback((variant) => {
    if (!variantPickerProduct) return;
    addResolvedItemToCart(variantPickerProduct, variant);
    setVariantPickerProduct(null);
  }, [addResolvedItemToCart, variantPickerProduct]);

  const adjustProductQuantity = useCallback((productId, delta) => {
    if (!delta) return;
    const product = allProducts.find((p) => p.id === productId);
    if (delta > 0 && product && getActiveVariants(product).length > 0) {
      setVariantPickerProduct(product);
      return;
    }

    setCart((prevCart) => {
      const index = prevCart.findIndex(
        (item) => item.productId === productId && !item.productVariantId
      );
      if (index === -1) {
        // If item not in cart yet and delta is positive, add one unit
        if (delta > 0) {
          if (!product) return prevCart;
          return [
            ...prevCart,
            buildCartItemFromProduct(product),
          ];
        }
        return prevCart;
      }
      const current = Number(prevCart[index].quantity) || 0;
      const next = current + delta;
      if (next <= 0) {
        return prevCart.filter((_, i) => i !== index);
      }
      const updated = [...prevCart];
      updated[index] = { ...updated[index], quantity: next };
      return updated;
    });
  }, [allProducts]);

  // Pre-add product when navigating from staff dashboard with state.addProductId
  const navigateRef = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'dealer' && dealersEnabled) {
      switchPosSaleMode('dealer');
    }
  }, [location.search, dealersEnabled, switchPosSaleMode]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const dealerId = params.get('dealerId');
    if (!dealerId || !dealersEnabled) return undefined;

    let cancelled = false;

    const applyDealerFromUrl = async () => {
      try {
        switchPosSaleMode('dealer');
        const res = await dealerService.getById(dealerId);
        const dealer = res?.data?.data || res?.data || res;
        if (!cancelled && dealer?.id) {
          selectDealer(dealer);
        }
      } catch {
        showError('Could not load dealer account. Search and select the dealer manually.');
      } finally {
        if (!cancelled) {
          params.delete('dealerId');
          params.delete('mode');
          const qs = params.toString();
          navigateRef(`${location.pathname}${qs ? `?${qs}` : ''}`, { replace: true });
        }
      }
    };

    applyDealerFromUrl();
    return () => {
      cancelled = true;
    };
  }, [location.search, location.pathname, dealersEnabled, switchPosSaleMode, selectDealer, navigateRef]);

  // When navigating from dashboard "Add sale" with openModal, open scan mode and clear state
  useEffect(() => {
    if (location.state?.openModal && scanningEnabled) {
      navigateRef(location.pathname, { replace: true, state: {} });
      setScanModeOpen(true);
    } else if (location.state?.openModal) {
      navigateRef(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.openModal, location.pathname, navigateRef, scanningEnabled]);

  useEffect(() => {
    const addProductId = location.state?.addProductId;
    if (!addProductId) return;

    const apply = async () => {
      try {
        if (!guardOnline(showError)) return;
        const res = await productService.getProductById(addProductId);
        const data = res?.data?.data ?? res?.data ?? res;
        const product = data?.id ? data : null;
        if (product) addToCart(product);
      } catch (_) {
        // ignore
      }
      navigateRef('/pos', { replace: true, state: {} });
    };
    apply();
  }, [location.state?.addProductId, addToCart, navigateRef]);

  // Update cart item quantity
  const updateCartItemQuantity = useCallback((itemId, quantity) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.id !== itemId));
    } else {
      setCart(prev => prev.map(item => 
        item.id === itemId ? { ...item, quantity } : item
      ));
    }
  }, []);

  // Remove cart item
  const removeCartItem = useCallback((itemId) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  }, []);

  // Update cart item discount
  const updateCartItemDiscount = useCallback((itemId, discount) => {
    setCart(prev => prev.map(item => 
      item.id === itemId ? { ...item, discount } : item
    ));
  }, []);

  const updateCartItemPrice = useCallback((itemId, unitPrice) => {
    setCart(prev => prev.map((item) => {
      if (item.id !== itemId) return item;
      const catalogUnitPrice = Number(item.catalogUnitPrice ?? item.baseUnitPrice ?? item.unitPrice ?? 0);
      const nextUnitPrice = Number(unitPrice);
      const priceOverridden = Number.isFinite(nextUnitPrice)
        && Math.round(nextUnitPrice * 100) !== Math.round(catalogUnitPrice * 100);

      return {
        ...item,
        baseUnitPrice: Number.isFinite(catalogUnitPrice) ? catalogUnitPrice : nextUnitPrice,
        catalogUnitPrice: Number.isFinite(catalogUnitPrice) ? catalogUnitPrice : nextUnitPrice,
        unitPrice: nextUnitPrice,
        priceOverridden
      };
    }));
  }, []);

  // Clear cart
  const clearCart = useCallback(() => {
    setCart([]);
    setCartDiscount(0);
    setSelectedCustomer(null);
    setQuickCustomerName('');
    setQuickCustomerPhone('');
  }, []);

  // Handle find or create customer (for scan mode and quick-add in main POS). Normalizes phone (0XX / +233).
  // Declared before handleCheckout so it is not in temporal dead zone when handleCheckout's useCallback runs.
  const handleFindOrCreateCustomer = useCallback(async (phone, name) => {
    try {
      const normalized = normalizePhone(phone || '');
      if (!normalized) return null;
      const result = await customerService.findOrCreate(normalized, name || '');
      const body = result?.data ?? result;
      return body?.data ?? body ?? null;
    } catch (error) {
      console.error('Failed to find/create customer:', error);
      return null;
    }
  }, []);

  // Handle checkout: if quick-add phone/name filled but no selected customer, validate, find-or-create then open payment
  const handleCheckout = useCallback(async () => {
    if (!guardOnline(showError)) return;
    if (cart.length === 0) {
      showError('Cart is empty');
      return;
    }
    if (isDealerMode) {
      if (!selectedDealer?.id) {
        showError('Select a dealer account before checkout');
        return;
      }
      setPaymentModalOpen(true);
      return;
    }
    if (!selectedCustomer && (quickCustomerPhone?.trim() || quickCustomerName?.trim())) {
      const phone = (quickCustomerPhone || '').trim();
      if (phone) {
        const { valid, error } = validatePhone(phone);
        if (!valid) {
          showError(error || 'Invalid phone format');
          return;
        }
        try {
          const customer = await handleFindOrCreateCustomer(phone, (quickCustomerName || '').trim());
          if (customer) {
            setSelectedCustomer(customer);
            setQuickCustomerName('');
            setQuickCustomerPhone('');
          }
        } catch (_) {
          // Proceed to payment without customer
        }
      }
    }
    setCartSheetOpen(false);
    setPaymentModalOpen(true);
  }, [cart, selectedCustomer, quickCustomerPhone, quickCustomerName, handleFindOrCreateCustomer, isDealerMode, selectedDealer?.id]);

  const buildSaleItemPayload = useCallback((item) => {
    if (item.type === 'custom' || !item.productId) {
      return {
        type: 'custom',
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        saveAsProduct: item.saveAsProduct === true,
        discount: item.discount || 0,
        tax: item.tax || 0,
      };
    }

    return {
      productId: item.productId,
      productVariantId: item.productVariantId,
      name: item.name,
      sku: item.sku,
      productCode: item.productCode,
      unit: item.unit,
      quantity: item.quantity,
      baseUnitPrice: item.baseUnitPrice,
      catalogUnitPrice: item.catalogUnitPrice,
      unitPrice: item.unitPrice,
      priceOverridden: item.priceOverridden === true,
      discount: item.discount || 0,
      tax: item.tax || 0
    };
  }, []);

  // Handle payment confirmation
  const handleConfirmPayment = useCallback(async (paymentDetails) => {
    if (isDealerMode && !selectedDealer?.id) {
      showError('Select a dealer account before completing the sale');
      return;
    }

    setIsProcessingPayment(true);

    try {
      const chargeToAccount = isDealerMode
        ? Math.max(0, (paymentDetails.chargeToAccount ?? (paymentDetails.total ?? cartTotals.total) - (paymentDetails.amountPaid ?? 0)))
        : undefined;

      const saleData = {
        items: cart.map(buildSaleItemPayload),
        customerId: isDealerMode ? null : (selectedCustomer?.id || null),
        dealerId: isDealerMode ? selectedDealer.id : null,
        saleChannel: isDealerMode ? 'dealer' : 'retail',
        ...(isDealerMode ? {
          chargeToAccount,
          creditOverride: paymentDetails.creditOverride === true,
        } : {}),
        paymentMethod: paymentDetails.paymentMethod,
        amountPaid: paymentDetails.amountPaid,
        notes: paymentDetails.mobileMoneyReference 
          ? `Mobile Money Ref: ${paymentDetails.mobileMoneyReference}` 
          : null,
        cartDiscount,
        metadata: {
          mobileMoneyProvider: paymentDetails.mobileMoneyProvider,
          mobileMoneyPhone: paymentDetails.mobileMoneyPhone,
          mobileMoneyReference: paymentDetails.mobileMoneyReference,
          paymentMethodUi: paymentDetails.paymentMethodUi,
          paymentCollectionMode: paymentDetails.paymentCollectionMode,
          paymentGroup: paymentDetails.paymentGroup,
          posTaxConfigSnapshot: posTaxConfig,
          ...(isDealerMode ? {
            dealerSettlement: paymentDetails.dealerSettlement,
            dealerBusinessName: selectedDealer?.businessName,
          } : {}),
        },
        delivery: paymentDetails.delivery || { required: false, bandId: null, fee: 0 }
      };
      if (isRestaurant) {
        saleData.sendToKitchen = paymentDetails.sendToKitchen ?? true;
      }

      const result = await processSale(saleData);

      if (result.success) {
        refreshSaleQueries();
        const saleObj = {
          total: paymentDetails.total ?? cartTotals.total,
          change: paymentDetails.change || 0,
          items: cart,
          paymentMethod: paymentDetails.paymentMethod,
          ...saleData,
          ...(result.sale || {}),
          ...(isDealerMode && selectedDealer ? {
            dealerId: selectedDealer.id,
            saleChannel: 'dealer',
            customerId: null,
            customer: null,
            dealer: {
              businessName: selectedDealer.businessName,
              contactName: selectedDealer.contactName,
              phone: selectedDealer.phone,
              email: selectedDealer.email,
            },
          } : {}),
        };

        setCompletedSale(saleObj);
        // Always return user to main POS view after a successful sale
        setPaymentModalOpen(false);
        const dealerForReceipt = isDealerMode ? selectedDealer : null;
        // Capture counterparty for receipt before clearCart / clearDealerSelection wipes them
        setCustomerForReceipt(
          dealerForReceipt
            ? {
                name: dealerForReceipt.businessName,
                company: dealerForReceipt.contactName || '',
                phone: dealerForReceipt.phone || '',
                email: dealerForReceipt.email || '',
                isDealer: true,
              }
            : selectedCustomer ||
              (quickCustomerPhone
                ? { phone: quickCustomerPhone, name: quickCustomerName || '', email: '' }
                : null)
        );
        setReceiptModalOpen(!shouldSkipReceiptModal(posConfig));

        if (isRestaurant && saleObj?.saleNumber && (paymentDetails.sendToKitchen ?? true)) {
          showSuccess(`Order placed! #${saleObj.saleNumber} has been sent to the kitchen.`);
        } else {
          showSuccess('Sale completed successfully!');
        }

        // Clear cart after successful sale
        clearCart();
        if (isDealerMode) {
          clearDealerSelection();
        }
      }
    } catch (error) {
      console.error('Payment processing error:', error);
      showError(error.message || 'Failed to process payment');
    } finally {
      setIsProcessingPayment(false);
    }
  }, [cart, selectedCustomer, selectedDealer, cartTotals, processSale, clearCart, clearDealerSelection, isRestaurant, posConfig, cartDiscount, posTaxConfig, buildSaleItemPayload, refreshSaleQueries, isDealerMode]);

  // Handle Paystack Mobile Money payment request (POS)
  const handleRequestMobileMoneyPayment = useCallback(
    async ({ phone, provider, delivery }) => {
      const phoneNumber = (phone || '').trim();
      const logicalProvider = String(provider || 'MTN').toUpperCase();

      if (!phoneNumber) {
        showError('Customer MoMo number is required');
        return;
      }
      if (!isOnline) {
        showError(ONLINE_REQUIRED_MESSAGE);
        setMobileMoneyFallbackMode('manual');
        return;
      }

      setIsProcessingPayment(true);
      setMobileMoneyError('');
      setMobileMoneyState('initiating');
      setMobileMoneyFallbackMode(null);

      const formattedMoMoPhone = mobileMoneyService.formatPhoneNumber(phoneNumber).replace(/^\+/, '');

      try {
        // 1. Create pending sale
        const saleData = {
          items: cart.map(buildSaleItemPayload),
          customerId: selectedCustomer?.id || null,
          paymentMethod: 'mobile_money',
          status: 'pending',
          amountPaid: 0,
          metadata: {
            mobileMoneyProvider: logicalProvider,
            mobileMoneyPhone: phoneNumber,
            paymentMethodUi: 'momo_prompt',
            paymentCollectionMode: 'momo_prompt',
            paymentGroup: 'automatic'
          },
          delivery: delivery || { required: false, bandId: null, fee: 0 }
        };

        const result = await processSale(saleData);
        const createdSale = result?.sale;
        if (!result.success || !createdSale?.id) {
          showError('Failed to start mobile money payment. Please try again.');
          setMobileMoneyState('failed');
          return;
        }
        refreshSaleQueries();

        const saleId = createdSale.id;
        const totalAmount = parseFloat(createdSale.total || 0);

        setMobileMoneyState('initiating');

        // 2. Prefer direct operator MoMo APIs; fall back to Paystack MoMo if unavailable
        let directOk = false;
        try {
          const momoRes = await mobileMoneyService.initiatePayment({
            saleId,
            phoneNumber: formattedMoMoPhone,
            amount: totalAmount,
            currency: 'GHS',
            provider: logicalProvider
          });
          directOk = !!momoRes?.success;
          if (!directOk) {
            const errMsg = String(momoRes?.error || momoRes?.message || '').toLowerCase();
            const canTryPaystack =
              momoRes?.allowPaystackFallback === true ||
              errMsg.includes('not configured') ||
              errMsg.includes('not connected') ||
              errMsg.includes('authenticate') ||
              errMsg.includes('failed to initiate') ||
              errMsg.includes('unavailable') ||
              errMsg.includes('use paystack') ||
              errMsg.includes('vodafone');
            if (!canTryPaystack) {
              const message = momoRes?.error || momoRes?.message || 'Failed to initiate mobile money payment';
              showError(message);
              setMobileMoneyError(message);
              setMobileMoneyState('failed');
              return;
            }
          }
        } catch (directErr) {
          // 503 / allowPaystackFallback failures throw via axios — fall through to Paystack MoMo
          directOk = false;
        }

        if (!directOk) {
          let paystackRes;
          try {
            paystackRes = await saleService.paystackMobileMoneyPay(saleId, {
              phoneNumber,
              provider: logicalProvider
            });
          } catch (paystackErr) {
            const raw =
              paystackErr?.response?.data?.message ||
              paystackErr?.response?.data?.error ||
              paystackErr?.message ||
              '';
            const lower = String(raw).toLowerCase();
            const message = lower.includes('not configured')
              ? 'Set up Hubtel or Paystack in Settings → Payments, or use manual MoMo.'
              : raw || 'Failed to initiate mobile money payment';
            showError(message);
            setMobileMoneyError(message);
            setMobileMoneyState('failed');
            setMobileMoneyFallbackMode('manual');
            return;
          }

          if (!paystackRes?.success) {
            const raw =
              paystackRes?.message ||
              paystackRes?.error ||
              'Failed to initiate mobile money payment';
            const lower = String(raw).toLowerCase();
            const message = lower.includes('not configured')
              ? 'Set up Hubtel or Paystack in Settings → Payments, or use manual MoMo.'
              : raw;
            showError(message);
            setMobileMoneyError(message);
            setMobileMoneyState('failed');
            if (lower.includes('not configured') || lower.includes('paystack')) {
              setMobileMoneyFallbackMode('manual');
            }
            return;
          }

          let charge = paystackRes?.data ?? paystackRes;
          const needsOtp = (payload) =>
            payload?.requiresOtp === true
            || String(payload?.status || '').toLowerCase() === 'send_otp';

          while (needsOtp(charge)) {
            setMobileMoneyState('awaiting_otp');
            setMobileMoneyOtpHint(
              charge?.message
              || charge?.displayText
              || 'Enter the OTP sent to the customer to continue payment.'
            );
            setMobileMoneyError('');
            setIsProcessingPayment(false);
            // eslint-disable-next-line no-await-in-loop
            const otp = await waitForMobileMoneyOtp();
            setIsProcessingPayment(true);
            setMobileMoneyState('initiating');
            // eslint-disable-next-line no-await-in-loop
            const otpRes = await saleService.submitPaystackOtp(saleId, {
              otp,
              reference: charge?.reference
            });
            if (!otpRes?.success) {
              const message =
                otpRes?.message
                || otpRes?.error
                || 'Invalid or expired OTP. Try again or restart the payment.';
              showError(message);
              setMobileMoneyError(message);
              setMobileMoneyState('failed');
              return;
            }
            charge = otpRes?.data ?? otpRes;
            const status = String(charge?.status || '').toLowerCase();
            if (status === 'failed' || status === 'abandoned') {
              const message = charge?.message || 'Mobile money payment failed.';
              showError(message);
              setMobileMoneyError(message);
              setMobileMoneyState('failed');
              return;
            }
          }
        }

        setMobileMoneyOtpHint('');
        setMobileMoneyState('waiting');

        const maxAttempts = 30;
        const delayMs = 2000;
        let finalSale = null;
        waitingMoMoSaleIdRef.current = saleId;
        wsCompletedSaleIdRef.current = null;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          if (wsCompletedSaleIdRef.current === saleId) {
            // eslint-disable-next-line no-await-in-loop
            const res = await saleService.getSaleById(saleId);
            const body = res?.data ?? res;
            finalSale = body?.data ?? body ?? null;
            break;
          }

          if (directOk) {
            // eslint-disable-next-line no-await-in-loop
            const pollRes = await mobileMoneyService.pollSalePayment(saleId);
            const d = pollRes?.data ?? pollRes;
            if (d?.saleStatus === 'completed' || d?.paymentStatus === 'SUCCESSFUL') {
              // eslint-disable-next-line no-await-in-loop
              const res = await saleService.getSaleById(saleId);
              const body = res?.data ?? res;
              finalSale = body?.data ?? body ?? null;
              if (finalSale?.status === 'completed') break;
            }
          } else {
            // eslint-disable-next-line no-await-in-loop
            const res = await saleService.checkPaystackCharge(saleId);
            const body = res?.data ?? res;
            const sale = body?.data ?? body ?? null;
            if (sale && sale.status === 'completed' && sale.paymentMethod === 'mobile_money') {
              finalSale = sale;
              break;
            }
          }

          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        waitingMoMoSaleIdRef.current = null;
        wsCompletedSaleIdRef.current = null;

        if (!finalSale || finalSale.status !== 'completed') {
          const msg =
            'Payment not completed yet. Please confirm on customer phone or try again.';
          showError(msg);
          setMobileMoneyError(msg);
          setMobileMoneyState('failed');
          return;
        }

        setCompletedSale(finalSale);
        setPaymentModalOpen(false);
        setCustomerForReceipt(
          selectedCustomer ||
            (quickCustomerPhone
              ? { phone: quickCustomerPhone, name: quickCustomerName || '', email: '' }
              : null)
        );
        setReceiptModalOpen(!shouldSkipReceiptModal(posConfig));

        showSuccess('Sale completed successfully!');
        refreshSaleQueries();
        clearCart();
        setMobileMoneyState('success');
      } catch (error) {
        console.error('[MoMo] Mobile money payment error:', {
          error,
          responseData: error?.response?.data,
          status: error?.response?.status,
          message: error?.message
        });
        const message = error?.response?.data?.message || error.message || 'Failed to process mobile money payment';
        const lower = String(message).toLowerCase();
        const setupMsg = lower.includes('not configured')
          ? 'Set up Hubtel or Paystack in Settings → Payments, or use manual MoMo.'
          : message;
        showError(setupMsg);
        setMobileMoneyError(setupMsg);
        setMobileMoneyState('failed');
        if (lower.includes('not configured') || lower.includes('paystack')) {
          setMobileMoneyFallbackMode('manual');
        }
      } finally {
        waitingMoMoSaleIdRef.current = null;
        wsCompletedSaleIdRef.current = null;
        otpWaitRef.current = null;
        setMobileMoneyOtpHint('');
        setIsProcessingPayment(false);
      }
    },
    [
      cart,
      selectedCustomer,
      isOnline,
      processSale,
      posConfig,
      quickCustomerName,
      quickCustomerPhone,
      clearCart,
      buildSaleItemPayload,
      refreshSaleQueries,
      waitForMobileMoneyOtp
    ]
  );

  const handlePaymentModalStayOpenChange = useCallback((checked) => {
    setPaymentModalStayOpen(checked);
    try {
      localStorage.setItem('pos_payment_modal_stay_open', String(checked));
    } catch {
      /* ignore */
    }
  }, []);

  // Handle send receipt
  const handleSendReceipt = useCallback(async ({ saleId, channels, phone, email }) => {
    if (!guardOnline(showError)) return undefined;
    return saleService.sendReceipt(saleId, { channels, phone, email });
  }, []);

  const handleRefreshProducts = useCallback(async () => {
    if (!guardOnline(showError)) return;
    await refetchActiveProducts();
    showSuccess('Products refreshed');
  }, [refetchActiveProducts]);

  // Handle process sale for scan mode
  const handleProcessSaleForScanMode = useCallback(async (saleData) => {
    const result = await processSale(saleData);
    if (result?.success) {
      refreshSaleQueries();
    }
    return result;
  }, [processSale, refreshSaleQueries]);

  // Handle send receipt for scan mode
  const handleSendReceiptForScanMode = useCallback(async (saleId, options) => {
    if (!guardOnline(showError)) return undefined;
    return saleService.sendReceipt(saleId, options);
  }, []);

  const mobileCheckoutBarPaddingBottom = useMemo(() => {
    if (!isMobile) return undefined;
    const safeBottom = Math.max(safeAreaInsets.bottom, 0);
    // Extra space when safe-area is 0 so browser bottom UI does not cover actions
    const chromeBuffer = safeBottom > 0 ? 12 : 48;
    return `calc(0.75rem + ${safeBottom + chromeBuffer}px)`;
  }, [isMobile, safeAreaInsets.bottom]);

  const posCartProps = useMemo(() => ({
    items: cart,
    totalsOverride: cartTotals,
    onUpdateQuantity: updateCartItemQuantity,
    onRemoveItem: removeCartItem,
    onUpdateItemDiscount: updateCartItemDiscount,
    onUpdateItemPrice: updateCartItemPrice,
    customer: selectedCustomer,
    customers: customersList,
    onSelectCustomer: (customer) => {
      setSelectedCustomer(customer);
      setQuickCustomerName('');
      setQuickCustomerPhone('');
    },
    onClearCustomer: () => {
      setSelectedCustomer(null);
      setQuickCustomerName('');
      setQuickCustomerPhone('');
    },
    showQuickCustomerForm: true,
    quickCustomerName,
    quickCustomerPhone,
    onQuickCustomerNameChange: setQuickCustomerName,
    onQuickCustomerPhoneChange: setQuickCustomerPhone,
    isDealerMode,
    dealer: selectedDealer,
    dealerSummary,
    cartDiscount,
    onUpdateCartDiscount: setCartDiscount,
    onCheckout: handleCheckout,
    onClearCart: clearCart,
  }), [
    cart,
    cartTotals,
    updateCartItemQuantity,
    removeCartItem,
    updateCartItemDiscount,
    updateCartItemPrice,
    selectedCustomer,
    customersList,
    quickCustomerName,
    quickCustomerPhone,
    isDealerMode,
    selectedDealer,
    dealerSummary,
    cartDiscount,
    handleCheckout,
    clearCart,
  ]);

  if (!isShop) {
    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Point of Sale</h1>
          <p className="text-muted-foreground mt-1">Quick checkout and sales processing</p>
        </div>
        <FeatureNotAvailable
          icon="CreditCard"
          title={FEATURE_NOT_AVAILABLE.SHOP_ONLY.title}
          description={FEATURE_NOT_AVAILABLE.SHOP_ONLY.description}
        />
      </div>
    );
  }

  if (!paymentCollectionLoading && onlinePaymentRequired && !paymentCollectionConfigured) {
    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Point of Sale</h1>
            <p className="text-muted-foreground mt-1">Quick checkout and sales processing</p>
          </div>
        </div>
        <Card className="border border-border">
          <CardContent className="p-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                <CreditCard className="h-10 w-10 text-gray-400" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-foreground mb-2">Set up payment collection</h2>
                <p className="text-muted-foreground max-w-md mb-4">
                  {isManager
                    ? 'Configure where to receive card and mobile money payments from customers before using POS. Your funds will go to your bank or MoMo account.'
                    : 'Payment collection must be configured before POS can take online payments. Ask a workspace manager or administrator to set this up in Settings.'}
                </p>
                {isManager ? (
                  <Button
                    onClick={() => navigateRef('/settings/payments?subtab=settlements')}
                    className="bg-green-700 hover:bg-green-800"
                  >
                    Go to Settings
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 pt-3 pl-3 sm:pt-4 sm:pl-4 md:pt-6 md:pl-6 bg-muted/50">
      {/* Header */}
      <div
        className={`shrink-0 mb-4 ${
          isMobile ? 'flex flex-col gap-3' : 'flex items-center justify-between gap-2'
        }`}
      >
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
            Point of Sale
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm truncate">
            Quick checkout and sales processing
          </p>
        </div>

        {isMobile ? (
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center justify-between gap-3 w-full">
              {scanningEnabled && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => setScanModeOpen(true)}
                      className="bg-green-700 hover:bg-green-800 h-12 px-4 text-base flex-1"
                    >
                      <Camera className="h-5 w-5 mr-2 flex-shrink-0" />
                      <span className="truncate">Scan</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open barcode scanner for quick add</TooltipContent>
                </Tooltip>
              )}

              <div className={`flex-shrink-0${scanningEnabled ? '' : ' ml-auto'}`}>
                <POSConnectionStatus isOnline={isOnline} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              {isManager && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFindSaleReturnOpen(true)}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  Return
                </Button>
              )}
              <span className="text-xs text-muted-foreground">Stay open</span>
              <Switch
                id="stay-open-main-mobile"
                checked={paymentModalStayOpen}
                onCheckedChange={handlePaymentModalStayOpenChange}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mr-2">
              <span>Stay open</span>
              <Switch
                id="stay-open-main-desktop"
                checked={paymentModalStayOpen}
                onCheckedChange={handlePaymentModalStayOpenChange}
              />
            </div>

            {/* Start Scanning Button - desktop */}
            {scanningEnabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setScanModeOpen(true)}
                    className="bg-green-700 hover:bg-green-800 h-10"
                  >
                    <Camera className="h-5 w-5 mr-2 flex-shrink-0" />
                    <span className="truncate">Start Scanning</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open barcode scanner for quick add</TooltipContent>
              </Tooltip>
            )}

            {isManager && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => setFindSaleReturnOpen(true)}
                  >
                    <Undo2 className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">Return / Exchange</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Find a sale to refund or exchange</TooltipContent>
              </Tooltip>
            )}

            <POSConnectionStatus isOnline={isOnline} />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRefreshProducts}
                  disabled={!isOnline}
                  className="hidden md:flex"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh product list</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {dealersEnabled && (
        <div className="shrink-0 mb-4 space-y-3">
          <Tabs value={posSaleMode} onValueChange={switchPosSaleMode}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="retail">Retail</TabsTrigger>
              <TabsTrigger value="dealer">Sell to dealer</TabsTrigger>
            </TabsList>
          </Tabs>

          {isDealerMode && (
            <Card className="border border-[#e5e7eb]">
              <CardContent className="p-4 space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-[#166534]" />
                    Dealer account
                  </Label>
                  <div className="flex items-center gap-2">
                    <Popover open={dealerPickerOpen} onOpenChange={setDealerPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={dealerPickerOpen}
                          className="h-10 flex-1 justify-between font-normal border-border"
                        >
                          <span className="truncate text-left">
                            {selectedDealer?.businessName || (
                              <span className="text-muted-foreground">Search dealers by name or phone</span>
                            )}
                          </span>
                          {dealerSearchLoading ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                          ) : (
                            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${dealerPickerOpen ? 'rotate-180' : ''}`} />
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                        <div className="p-2 border-b border-border">
                          <Input
                            placeholder="Search dealers by name or phone"
                            value={dealerSearch}
                            onChange={(e) => setDealerSearch(e.target.value)}
                            className="h-9 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            autoFocus
                          />
                        </div>
                        <ScrollArea className="max-h-48">
                          {dealerSearchLoading ? (
                            <div className="py-6 flex justify-center">
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : dealerOptions.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                              {dealerSearch ? 'No dealers found' : 'Type to search dealers'}
                            </div>
                          ) : (
                            <ul className="p-1">
                              {dealerOptions.map((dealer) => (
                                <li key={dealer.id}>
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 hover:bg-muted rounded-md text-sm flex flex-col"
                                    onClick={() => {
                                      selectDealer(dealer);
                                      setDealerPickerOpen(false);
                                    }}
                                  >
                                    <span className="font-medium text-foreground">{dealer.businessName}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {dealer.phone ? `${dealer.phone} · ` : ''}
                                      Outstanding {formatAmount(dealer.balance)} · Credit {formatAmount(dealer.availableCredit)}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                    {selectedDealer ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={clearDealerSelection}
                        aria-label="Clear dealer selection"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  {selectedDealer && dealerSummary ? (
                    <p className="text-xs text-muted-foreground">
                      Outstanding {dealerSummary.balanceLabel} · Available credit {dealerSummary.availableCreditLabel}
                    </p>
                  ) : null}
                </div>
                {!activeShopId ? (
                  <Alert className="border border-[#e5e7eb]">
                    <AlertDescription>
                      Select an active shop branch to load products and apply branch wholesale prices.
                    </AlertDescription>
                  </Alert>
                ) : null}
                {isDealerMode && !selectedDealer && (
                  <Alert className="border border-amber-200 bg-amber-50">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Add products after selecting a dealer. Wholesale prices apply automatically.</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Main content - Split layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0">
        {/* Left side - Product list (search + browse); click or scan adds to cart */}
        <div className="lg:col-span-3 flex flex-col min-h-0">
          <POSProductSearch
            onSearch={searchProducts}
            getProductByBarcode={getProductByBarcode}
            resolveProductFromQRPayload={resolveProductFromQRPayload}
            onSelectProduct={addToCart}
            isOnline={isOnline}
            allProducts={allProducts}
            productsLoading={productsLoading}
            cartQuantityByProductId={cartQuantityByProductId}
            fillHeight
            onAdjustProductQuantity={adjustProductQuantity}
            onAddCustomItem={handleOpenCustomItemDialog}
            dealerPriceByProductId={isDealerMode ? dealerPriceByProductId : {}}
            scanningEnabled={scanningEnabled}
          />
        </div>

        {/* Right side - Cart (desktop) */}
        <div className="hidden lg:block lg:col-span-2 min-h-0 overflow-y-auto">
          <POSCart {...posCartProps} />
        </div>
      </div>

      {/* Customer selection dialog */}
      <CustomerSelectDialog
        isOpen={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        onSelect={(customer) => {
          setSelectedCustomer(customer);
          setQuickCustomerName('');
          setQuickCustomerPhone('');
        }}
        onFindOrCreate={handleFindOrCreateCustomer}
      />

      <ProductVariantDialog
        product={variantPickerProduct}
        open={!!variantPickerProduct}
        onClose={() => setVariantPickerProduct(null)}
        onSelect={handleSelectVariant}
      />

      <Dialog
        open={customItemDialogOpen}
        onOpenChange={(open) => {
          setCustomItemDialogOpen(open);
          if (!open) resetCustomItemForm();
        }}
      >
        <DialogContent className="sm:w-[var(--modal-w-sm)]">
          <DialogHeader>
            <DialogTitle>Add custom item</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="custom-item-name">Name</Label>
                <Input
                  id="custom-item-name"
                  value={customItemForm.name}
                  onChange={(event) => setCustomItemForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="e.g. Special order"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="custom-item-price">Unit price</Label>
                  <Input
                    id="custom-item-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={customItemForm.unitPrice}
                    onChange={(event) => setCustomItemForm((prev) => ({ ...prev, unitPrice: event.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-item-quantity">Quantity</Label>
                  <Input
                    id="custom-item-quantity"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={customItemForm.quantity}
                    onChange={(event) => setCustomItemForm((prev) => ({ ...prev, quantity: event.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border p-3">
                <Checkbox
                  id="custom-item-save"
                  checked={customItemForm.saveAsProduct}
                  onCheckedChange={(checked) => setCustomItemForm((prev) => ({ ...prev, saveAsProduct: checked === true }))}
                />
                <Label htmlFor="custom-item-save" className="cursor-pointer font-normal">
                  Save to products (optional)
                </Label>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCustomItemDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-[#166534] hover:bg-[#14532d]" onClick={handleAddCustomItem}>
              Add item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment modal */}
      <POSPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        total={cartTotals.total}
        taxSummary={{
          subtotal: cartTotals.subtotal,
          discount: cartTotals.totalDiscount,
          taxAmount: cartTotals.taxAmount,
          taxLabel: cartTotals.taxLabel
        }}
        items={cart}
        customer={selectedCustomer}
        customers={customersList}
        onRequestChangeCustomer={() => setCustomerDialogOpen(true)}
        onClearCustomer={() => {
          setSelectedCustomer(null);
          setQuickCustomerName('');
          setQuickCustomerPhone('');
        }}
        onSelectExistingCustomer={(customer) => {
          setSelectedCustomer(customer);
          setQuickCustomerName('');
          setQuickCustomerPhone('');
        }}
        onConfirmPayment={handleConfirmPayment}
        onRequestMobileMoney={handleRequestMobileMoneyPayment}
        onSubmitMobileMoneyOtp={handleSubmitMobileMoneyOtp}
        mobileMoneyState={mobileMoneyState}
        mobileMoneyError={mobileMoneyError}
        mobileMoneyOtpHint={mobileMoneyOtpHint}
        mobileMoneyFallbackMode={mobileMoneyFallbackMode}
        isProcessing={isProcessingPayment}
        isRestaurant={isRestaurant}
        stayOpenAfterSale={paymentModalStayOpen}
        onStayOpenAfterSaleChange={handlePaymentModalStayOpenChange}
        isDealerMode={isDealerMode}
        dealer={selectedDealer}
        dealerSummary={dealerSummary}
        canOverrideCredit={canOverrideCredit}
      />

      {/* Tablet/mobile cart sheet — full cart controls (qty, price, discount) */}
      <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
        <SheetContent
          side="bottom"
          className="h-[min(92dvh,760px)] p-0 flex flex-col rounded-t-xl border-t border-border"
        >
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0 text-left">
            <SheetTitle className="flex items-center gap-2">
              Cart
              {cartTotals.itemCount > 0 && (
                <Badge variant="secondary">
                  {cartTotals.itemCount} item{cartTotals.itemCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </SheetTitle>
            <p className="text-sm text-muted-foreground font-normal">
              Adjust quantities, prices, and discounts before checkout
            </p>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-hidden px-4 pb-4">
            <POSCart
              {...posCartProps}
              embedded
              showTitle={false}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Tablet/mobile checkout bar — tap summary to open cart sheet */}
      <div
        className="lg:hidden shrink-0 z-20 border-t border-border bg-background px-4 pt-3 -ml-3 sm:-ml-4 md:ml-0 pr-4"
        style={mobileCheckoutBarPaddingBottom ? { paddingBottom: mobileCheckoutBarPaddingBottom } : undefined}
      >
        <div className="flex items-center justify-between gap-3 max-w-full">
          <button
            type="button"
            className="flex items-center gap-2 min-w-0 text-left rounded-lg border border-transparent hover:border-border hover:bg-muted/60 active:bg-muted px-2 py-1.5 -ml-2 min-h-[44px] transition-colors"
            onClick={() => setCartSheetOpen(true)}
            aria-label="Open cart to edit items"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-muted-foreground">
                {cartTotals.itemCount} item{cartTotals.itemCount !== 1 ? 's' : ''} · Tap to edit
              </span>
              <span className="text-lg font-semibold text-green-700 truncate">
                {formatAmount(cartTotals.total)}
              </span>
            </div>
            <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-11 min-h-[44px]"
              disabled={cart.length === 0}
              onClick={clearCart}
            >
              Clear
            </Button>
            <Button
              className="h-11 min-h-[44px] bg-green-700 hover:bg-green-800"
              disabled={cart.length === 0}
              onClick={handleCheckout}
            >
              Checkout
            </Button>
          </div>
        </div>
      </div>

      {/* Receipt modal */}
      <POSReceiptModal
        isOpen={receiptModalOpen}
        onClose={() => {
          setReceiptModalOpen(false);
          setCompletedSale(null);
          setCustomerForReceipt(null);
        }}
        sale={completedSale}
        customer={customerForReceipt}
        organizationSettings={scopedOrganizationSettings}
        onSendReceipt={handleSendReceipt}
      />

      {/* Mobile Scan Mode - Full screen scanning interface */}
      {scanningEnabled && (
        <POSScanMode
          isOpen={scanModeOpen}
          onClose={() => setScanModeOpen(false)}
          getProductByBarcode={getProductByBarcode}
          resolveProductFromQRPayload={resolveProductFromQRPayload}
          onProcessSale={handleProcessSaleForScanMode}
          onFindOrCreateCustomer={handleFindOrCreateCustomer}
          onSendReceipt={handleSendReceiptForScanMode}
          receiptChannelsAvailable={posConfig?.receiptChannelsAvailable || { sms: false, whatsapp: false, email: false }}
          automationReceiptCoverage={posConfig?.automationReceiptCoverage || { sms: false, email: false, whatsapp: false }}
          isOnline={isOnline}
          isRestaurant={isRestaurant}
          scanningEnabled={scanningEnabled}
        />
      )}

      <FindSaleForReturnDialog
        open={findSaleReturnOpen}
        onOpenChange={setFindSaleReturnOpen}
        onSelectSale={(sale) => setReturnSale(sale)}
      />

      <SaleReturnWizard
        open={Boolean(returnSale)}
        onOpenChange={(open) => {
          if (!open) setReturnSale(null);
        }}
        saleId={returnSale?.id}
        saleNumber={returnSale?.saleNumber}
        onCompleted={() => {
          refreshAfterSale(queryClient).catch(() => {});
          setReturnSale(null);
        }}
      />
    </div>
  );
};

export default POS;
