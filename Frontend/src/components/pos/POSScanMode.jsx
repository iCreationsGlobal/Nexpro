/**
 * POSScanMode Component
 * 
 * Full-screen mobile scanning interface for quick POS checkout.
 * Optimized for small African shops using phones as scanners.
 * 
 * Flow:
 * 1. Open camera -> scan multiple items
 * 2. Tap "Done" -> review cart + add customer
 * 3. Checkout -> auto-send receipt via SMS
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  X, 
  ShoppingCart, 
  User, 
  Phone,
  Check,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Banknote,
  Smartphone,
  CreditCard,
  ChefHat,
  Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { parseProductQRPayload } from '../../utils/productQR';
import { resolveImageUrl } from '../../utils/fileUtils';
import { QRCodeScanner } from './POSProductSearch';
import POSNumpad from './POSNumpad';
import POSQuantityDialog from './POSQuantityDialog';
import { useResponsive } from '../../hooks/useResponsive';
import { useDebounce } from '../../hooks/useDebounce';
import { CURRENCY } from '../../constants';
import { parseDecimalInput } from '../../utils/formatNumber';
import {
  getActiveVariants,
  getCatalogUnitPrice,
  getProductStockQuantity,
  isProductOutOfStock,
  isVariantOutOfStock,
} from '../../utils/productStock';
import { showSuccess, showError } from '../../utils/toast';
import customerService from '../../services/customerService';

/**
 * Format currency value (handles string/number from API or form)
 */
const formatCurrency = (amount) => {
  const num = Number(amount);
  return `${CURRENCY.SYMBOL} ${(Number.isNaN(num) ? 0 : num).toFixed(CURRENCY.DECIMAL_PLACES)}`;
};

/**
 * Generate cart item ID
 */
const generateCartItemId = () => {
  return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const getVariantLabel = (variant) => {
  if (!variant) return '';
  const attributeText = Object.values(variant.attributes || {})
    .filter(Boolean)
    .join(' / ');
  return variant.name || attributeText || variant.sku || 'Variant';
};

const buildCartItem = (product, variant = null) => {
  const variantLabel = getVariantLabel(variant);
  const catalogUnitPrice = getCatalogUnitPrice(product, variant);
  return {
    id: generateCartItemId(),
    productId: product.id,
    productVariantId: variant?.id || null,
    name: variant ? `${product.name} - ${variantLabel}` : product.name,
    sku: variant?.sku || product.sku,
    imageUrl: product.imageUrl,
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
            {variants.map((variant) => {
              const outOfStock = isVariantOutOfStock(product, variant);
              return (
                <button
                  key={variant.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => onSelect(variant)}
                  className={`w-full rounded-lg border border-border p-3 text-left ${
                    outOfStock ? 'bg-muted opacity-60 cursor-not-allowed' : 'hover:bg-green-50 hover:border-green-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">{getVariantLabel(variant)}</div>
                      <div className="text-xs text-muted-foreground">{variant.sku || 'No SKU'}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold text-green-700">{formatCurrency(getCatalogUnitPrice(product, variant))}</div>
                      <div className="text-xs text-muted-foreground">
                        {product?.trackStock === false || variant.trackStock === false
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
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Scan Mode Steps
 */
const STEPS = {
  SCANNING: 'scanning',
  REVIEW: 'review',
  PAYMENT: 'payment',
  SUCCESS: 'success'
};

/**
 * Payment Methods
 */
const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'mobile_money', label: 'MoMo', icon: Smartphone },
  { id: 'card', label: 'Card', icon: CreditCard }
];

/**
 * Cart Item Component for Review Screen – with image
 */
const CartItemRow = ({ item, onUpdateQuantity, onRemove, onEditPrice, onEditQuantity }) => {
  const { isMobile } = useResponsive();
  const itemTotal = item.unitPrice * item.quantity;
  const imageSrc = item.imageUrl ? resolveImageUrl(item.imageUrl) : null;
  const catalogUnitPrice = Number(item.catalogUnitPrice ?? item.baseUnitPrice ?? item.unitPrice);
  const priceOverridden = item.priceOverridden === true;

  return (
    <div className={`flex items-center ${isMobile ? 'gap-2 py-2' : 'gap-3 py-3'} border-b border-border last:border-0`}>
      <div className={`${isMobile ? 'w-12 h-12' : 'w-14 h-14'} flex-shrink-0 rounded-lg overflow-hidden bg-muted border border-border`}>
        {imageSrc ? (
          <img src={imageSrc} alt={item.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingCart className={`${isMobile ? 'h-5 w-5' : 'h-6 w-6'} text-muted-foreground`} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-foreground truncate ${isMobile ? 'text-xs' : 'text-sm'}`}>{item.name}</p>
        <p className={`${isMobile ? 'text-xs' : 'text-xs'} text-muted-foreground`}>
          {formatCurrency(item.unitPrice)} each
        </p>
        {priceOverridden && Number.isFinite(catalogUnitPrice) && (
          <p className="text-xs text-amber-700">
            Catalog: {formatCurrency(catalogUnitPrice)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className={`${isMobile ? 'h-9 w-9' : 'h-8 w-8'} border-border ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
          onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
        >
          <Minus className={`${isMobile ? 'h-3 w-3' : 'h-3 w-3'}`} />
        </Button>
        <button
          type="button"
          className={`${isMobile ? 'h-11 w-11 text-xs' : 'h-11 w-11 text-sm'} min-h-[44px] min-w-[44px] rounded-md border border-border bg-background text-center font-medium hover:bg-muted`}
          onClick={() => onEditQuantity(item)}
          aria-label={`Edit quantity for ${item.name}`}
        >
          {item.quantity}
        </button>
        <Button
          variant="outline"
          size="icon"
          className={`${isMobile ? 'h-9 w-9' : 'h-8 w-8'} border-border ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
        >
          <Plus className={`${isMobile ? 'h-3 w-3' : 'h-3 w-3'}`} />
        </Button>
      </div>

      <div className={`flex items-center ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
        <span className={`font-semibold text-foreground ${isMobile ? 'text-xs w-16' : 'text-sm w-20'} text-right`}>
          {formatCurrency(itemTotal)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className={`${isMobile ? 'h-9 w-9' : 'h-8 w-8'} text-muted-foreground hover:text-green-700`}
          onClick={() => onEditPrice(item)}
        >
          <Pencil className={`${isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`${isMobile ? 'h-9 w-9' : 'h-8 w-8'} text-muted-foreground hover:text-red-600`}
          onClick={() => onRemove(item.id)}
        >
          <Trash2 className={`${isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
        </Button>
      </div>
    </div>
  );
};

/**
 * Main POSScanMode Component
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether scan mode is active
 * @param {function} props.onClose - Called to exit scan mode
 * @param {function} props.getProductByBarcode - (barcode) => Promise<product|null>
 * @param {function} props.resolveProductFromQRPayload - (qrData) => Promise<product|null>
 * @param {function} props.onProcessSale - Process sale function (saleData) => Promise<result>
 * @param {function} props.onFindOrCreateCustomer - Find or create customer (phone, name) => Promise<customer>
 * @param {function} props.onSendReceipt - Send receipt function (saleId, options) => Promise
 * @param {Object} props.receiptChannelsAvailable - { sms, whatsapp, email } booleans for which channels are integrated
 * @param {Object} props.automationReceiptCoverage - { sms, email, whatsapp } booleans for automation-covered channels
 * @param {boolean} props.isOnline - Whether device is online
 * @param {boolean} props.isRestaurant - If true, show Send to kitchen option
 * @param {boolean} [props.scanningEnabled] - When false, camera scanner is not mounted
 */
const POSScanMode = ({
  isOpen,
  onClose,
  getProductByBarcode,
  resolveProductFromQRPayload,
  onProcessSale,
  onFindOrCreateCustomer,
  onSendReceipt,
  receiptChannelsAvailable = { sms: false, whatsapp: false, email: false },
  automationReceiptCoverage = { sms: false, email: false, whatsapp: false },
  isOnline = true,
  isRestaurant = false,
  scanningEnabled = true,
}) => {
  const { isMobile } = useResponsive();
  // Step state
  const [currentStep, setCurrentStep] = useState(STEPS.SCANNING);
  
  // Cart state
  const [cart, setCart] = useState([]);
  const [lastScannedItem, setLastScannedItem] = useState(null);
  const [variantPickerProduct, setVariantPickerProduct] = useState(null);
  const [priceDialogItem, setPriceDialogItem] = useState(null);
  const [priceValue, setPriceValue] = useState('');
  const [quantityDialogOpen, setQuantityDialogOpen] = useState(false);
  const [quantityEditItem, setQuantityEditItem] = useState(null);
  
  // Customer state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);

  const debouncedCustomerSearch = useDebounce(customerSearchQuery, 400);

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sendToKitchen, setSendToKitchen] = useState(true);
  
  // Result state
  const [completedSale, setCompletedSale] = useState(null);
  const [receiptSent, setReceiptSent] = useState(false);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(STEPS.SCANNING);
      setCart([]);
      setLastScannedItem(null);
      setVariantPickerProduct(null);
      setPriceDialogItem(null);
      setPriceValue('');
      setCustomerName('');
      setCustomerPhone('');
      setSelectedCustomerId(null);
      setCustomerSearchQuery('');
      setCustomerSearchResults([]);
      setPaymentMethod('cash');
      setAmountTendered('');
      setCompletedSale(null);
      setReceiptSent(false);
      setSendToKitchen(true);
    }
  }, [isOpen]);

  // Search customers when debounced query changes
  useEffect(() => {
    if (!debouncedCustomerSearch.trim()) {
      setCustomerSearchResults([]);
      return;
    }
    let cancelled = false;
    setCustomerSearching(true);
    customerService.getCustomers({ search: debouncedCustomerSearch.trim(), limit: 10 })
      .then((res) => {
        if (cancelled) return;
        const body = res?.data ?? res;
        const list = body?.data ?? (Array.isArray(body) ? body : []);
        setCustomerSearchResults(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setCustomerSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setCustomerSearching(false);
      });
    return () => { cancelled = true; };
  }, [debouncedCustomerSearch]);

  // Calculate totals
  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => 
      sum + (item.unitPrice * item.quantity), 0);
    return {
      subtotal,
      total: subtotal,
      itemCount: cart.reduce((sum, item) => sum + item.quantity, 0)
    };
  }, [cart]);

  const selectCustomer = useCallback((customer) => {
    setCustomerName(customer.name || '');
    setCustomerPhone(customer.phone || '');
    setSelectedCustomerId(customer.id);
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
    setCustomerSearchOpen(false);
  }, []);

  const clearCustomerSelection = useCallback(() => {
    setSelectedCustomerId(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
    setCustomerSearchOpen(true);
  }, []);

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

  const openPriceDialog = useCallback((item) => {
    setPriceDialogItem(item);
    setPriceValue((item.unitPrice ?? 0).toString());
  }, []);

  const openQuantityDialog = useCallback((item) => {
    setQuantityEditItem(item);
    setQuantityDialogOpen(true);
  }, []);

  const handleApplyQuantity = useCallback((itemId, quantity) => {
    updateCartItemQuantity(itemId, quantity);
    setQuantityEditItem(null);
  }, [updateCartItemQuantity]);

  const updateCartItemPrice = useCallback(() => {
    const nextUnitPrice = parseDecimalInput(priceValue);
    if (!Number.isFinite(nextUnitPrice) || nextUnitPrice < 0 || !priceDialogItem) return;

    setCart(prev => prev.map((item) => {
      if (item.id !== priceDialogItem.id) return item;
      const catalogUnitPrice = Number(item.catalogUnitPrice ?? item.baseUnitPrice ?? item.unitPrice ?? 0);
      const priceOverridden = Math.round(nextUnitPrice * 100) !== Math.round(catalogUnitPrice * 100);

      return {
        ...item,
        baseUnitPrice: Number.isFinite(catalogUnitPrice) ? catalogUnitPrice : nextUnitPrice,
        catalogUnitPrice: Number.isFinite(catalogUnitPrice) ? catalogUnitPrice : nextUnitPrice,
        unitPrice: nextUnitPrice,
        priceOverridden
      };
    }));
    setPriceDialogItem(null);
    setPriceValue('');
  }, [priceDialogItem, priceValue]);

  const addProductToCart = useCallback((product, variant = null) => {
    if (variant ? isVariantOutOfStock(product, variant) : isProductOutOfStock(product)) {
      showError(`${product.name || 'Product'} is out of stock`);
      return;
    }

    setCart(prev => {
      const variantId = variant?.id || null;
      const existing = prev.find(item =>
        item.productId === product.id && (item.productVariantId || null) === variantId
      );
      if (existing) {
        return prev.map(item =>
          item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, buildCartItem(product, variant)];
    });
    setLastScannedItem(variant ? `${product.name} - ${getVariantLabel(variant)}` : product.name);
  }, []);

  const handleSelectVariant = useCallback((variant) => {
    if (!variantPickerProduct) return;
    addProductToCart(variantPickerProduct, variant);
    setVariantPickerProduct(null);
  }, [addProductToCart, variantPickerProduct]);

  // Handle barcode or QR scan: resolve product and add to cart
  const handleScan = useCallback(async (decodedText) => {
    const text = (decodedText || '').trim();
    const looksLikeQRJson = text.startsWith('{');

    let product = null;
    try {
      if (looksLikeQRJson) {
        const result = parseProductQRPayload(text);
        if (result.success) {
          product = await resolveProductFromQRPayload(result.data);
        }
      } else if (getProductByBarcode) {
        product = await getProductByBarcode(text);
      }
      if (product) {
        if (product.selectedVariant?.id) {
          addProductToCart(product, product.selectedVariant);
        } else {
          const variants = getActiveVariants(product);
          if (variants.length > 0) {
            setVariantPickerProduct(product);
          } else {
            addProductToCart(product);
          }
        }
      }
    } catch (err) {
      console.warn('Scan resolve error:', err);
    }
  }, [addProductToCart, getProductByBarcode, resolveProductFromQRPayload]);

  // Handle done scanning
  const handleDoneScanning = useCallback(() => {
    if (cart.length > 0) {
      setCurrentStep(STEPS.REVIEW);
    }
  }, [cart.length]);

  // Handle proceed to payment
  const handleProceedToPayment = useCallback(() => {
    setCurrentStep(STEPS.PAYMENT);
    setAmountTendered(totals.total.toFixed(CURRENCY.DECIMAL_PLACES));
  }, [totals.total]);

  // Handle payment confirmation
  const handleConfirmPayment = useCallback(async () => {
    setIsProcessing(true);

    try {
      // Use selected customer, or find/create by phone & name
      let customerId = selectedCustomerId || null;
      if (!customerId && (customerPhone || customerName)) {
        try {
          const customer = await onFindOrCreateCustomer(customerPhone || '', customerName || '');
          customerId = customer?.id;
        } catch (err) {
          console.warn('Could not create customer:', err);
        }
      }

      // Prepare sale data
      const saleData = {
        items: cart.map(item => ({
          productId: item.productId,
          productVariantId: item.productVariantId,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          baseUnitPrice: item.baseUnitPrice,
          catalogUnitPrice: item.catalogUnitPrice,
          unitPrice: item.unitPrice,
          priceOverridden: item.priceOverridden === true,
          discount: 0,
          tax: 0
        })),
        customerId,
        paymentMethod,
        amountPaid: parseDecimalInput(amountTendered) || totals.total,
        metadata: {
          scanMode: true,
          customerPhone,
          customerName
        }
      };
      if (isRestaurant) {
        saleData.sendToKitchen = sendToKitchen;
      }

      // Process sale
      const result = await onProcessSale(saleData);

      if (result.success) {
        const saleObj = result.sale || {
          id: result.localId,
          saleNumber: `SALE-${result.localId || Date.now()}`,
          total: totals.total,
          items: cart
        };

        setCompletedSale(saleObj);
        setCurrentStep(STEPS.SUCCESS);

        // Auto-send receipt via SMS only when integrated and not already handled by automation
        const canManualSmsReceipt =
          receiptChannelsAvailable?.sms && !automationReceiptCoverage?.sms;
        if (customerPhone && saleObj.id && onSendReceipt && canManualSmsReceipt) {
          onSendReceipt(saleObj.id, {
            channels: ['sms'],
            phone: customerPhone
          })
            .then((response) => {
              // Backend returns 200 even when the SMS itself failed (not configured, invalid
              // phone, provider error, etc.) — check the per-channel result, not just the request.
              if (response?.data?.sms?.success) {
                setReceiptSent(true);
              } else {
                console.warn('SMS receipt not delivered:', response?.data?.sms?.error);
              }
            })
            .catch((receiptErr) => {
              console.warn('Failed to send receipt:', receiptErr);
            });
        }

        showSuccess('Sale completed!');
      }
    } catch (error) {
      console.error('Payment processing error:', error);
      showError(error.message || 'Failed to process payment');
    } finally {
      setIsProcessing(false);
    }
  }, [
    cart,
    selectedCustomerId,
    customerPhone,
    customerName,
    paymentMethod,
    amountTendered,
    totals.total,
    onFindOrCreateCustomer,
    onProcessSale,
    onSendReceipt,
    receiptChannelsAvailable,
    automationReceiptCoverage,
    isRestaurant,
    sendToKitchen
  ]);

  // Handle new sale
  const handleNewSale = useCallback(() => {
    setCurrentStep(STEPS.SCANNING);
    setCart([]);
    setLastScannedItem(null);
    setCustomerName('');
    setCustomerPhone('');
    setSelectedCustomerId(null);
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
    setPaymentMethod('cash');
    setAmountTendered('');
    setCompletedSale(null);
    setReceiptSent(false);
  }, []);

  // Calculate change
  const parsedAmount = parseDecimalInput(amountTendered) || 0;
  const change = Math.max(0, parsedAmount - totals.total);
  const isPaymentValid = parsedAmount >= totals.total;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 md:bg-black/50">
      <div className="w-full h-full md:max-w-[800px] md:max-h-[90vh] md:rounded-lg md:overflow-hidden bg-background flex flex-col">
      {/* Header */}
      <div className={`flex items-center justify-between ${isMobile ? 'px-3 py-2' : 'px-4 py-3'} border-b border-border bg-card`}>
        <Button
          variant="ghost"
          size="icon"
          onClick={currentStep === STEPS.SUCCESS ? onClose : currentStep === STEPS.SCANNING ? onClose : () => {
            if (currentStep === STEPS.REVIEW) setCurrentStep(STEPS.SCANNING);
            else if (currentStep === STEPS.PAYMENT) setCurrentStep(STEPS.REVIEW);
          }}
          className={isMobile ? 'h-11 w-11' : 'h-10 w-10'}
        >
          {currentStep === STEPS.SCANNING || currentStep === STEPS.SUCCESS ? (
            <X className={`${isMobile ? 'h-5 w-5' : 'h-5 w-5'}`} />
          ) : (
            <ArrowLeft className={`${isMobile ? 'h-5 w-5' : 'h-5 w-5'}`} />
          )}
        </Button>
        
        <h1 className={`font-semibold ${isMobile ? 'text-base' : 'text-lg'}`}>
          {currentStep === STEPS.SCANNING && 'Scan Items'}
          {currentStep === STEPS.REVIEW && 'Review Order'}
          {currentStep === STEPS.PAYMENT && 'Payment'}
          {currentStep === STEPS.SUCCESS && 'Complete'}
        </h1>

        {currentStep !== STEPS.SUCCESS && totals.itemCount > 0 && (
          <Badge className={`${isMobile ? 'text-xs px-2 py-0.5' : ''} bg-green-600 text-white`}>
            {totals.itemCount} item{totals.itemCount !== 1 ? 's' : ''}
          </Badge>
        )}
        {currentStep === STEPS.SUCCESS && <div className={isMobile ? 'w-10' : 'w-10'} />}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* SCANNING STEP */}
        {currentStep === STEPS.SCANNING && scanningEnabled && (
          <QRCodeScanner
            isOpen={true}
            onClose={onClose}
            onScan={handleScan}
            continuousMode={true}
            scannedCount={totals.itemCount}
            lastScannedItem={lastScannedItem}
            onDone={handleDoneScanning}
            cameraEnabled={scanningEnabled}
          />
        )}

        {/* REVIEW STEP – Items left, Customer right */}
        {currentStep === STEPS.REVIEW && (
          <div className="h-full flex flex-col">
            <div className={`flex-1 overflow-hidden flex flex-col ${isMobile ? '' : 'lg:flex-row'}`}>
              {/* LEFT: Cart Items with images */}
              <div className={`flex-1 flex flex-col min-w-0 ${isMobile ? '' : 'lg:border-r lg:border-border'}`}>
                <div className={`${isMobile ? 'px-3' : 'px-4'} pt-3 pb-2 border-b border-border`}>
                  <h3 className={`font-medium text-foreground ${isMobile ? 'text-sm' : 'text-base'}`}>
                    Items ({totals.itemCount})
                  </h3>
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>
                    Adjust quantity below if needed.
                  </p>
                </div>
                <ScrollArea className="flex-1" style={{ paddingLeft: isMobile ? '0.75rem' : '1rem', paddingRight: isMobile ? '0.75rem' : '1rem' }}>
                  <div className={isMobile ? 'py-2' : 'py-3'}>
                    {cart.map(item => (
                      <CartItemRow
                        key={item.id}
                        item={item}
                        onUpdateQuantity={updateCartItemQuantity}
                        onRemove={removeCartItem}
                        onEditPrice={openPriceDialog}
                        onEditQuantity={openQuantityDialog}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* RIGHT: Customer selection */}
              <div className={`flex-shrink-0 flex flex-col ${isMobile ? 'border-t border-border' : 'lg:w-[320px] lg:min-w-[280px]'}`}>
                <div className={`${isMobile ? 'px-3 py-3' : 'px-4 py-4'}`}>
                  <h3 className={`font-medium text-foreground ${isMobile ? 'mb-2 text-sm' : 'mb-3'} flex items-center gap-2`}>
                    <User className={`${isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
                    Customer
                  </h3>
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground mb-3`}>
                    Select or enter customer name and phone. Receipt will be sent via SMS after sale.
                  </p>

                  {selectedCustomerId ? (
                    <div className={`${isMobile ? 'p-2' : 'p-3'} bg-green-50 border border-green-200 ${isMobile ? 'rounded-md' : 'rounded-lg'} flex items-center justify-between`}>
                      <div>
                        <p className={`font-medium text-foreground ${isMobile ? 'text-sm' : ''}`}>{customerName || 'Customer'}</p>
                        <p className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-sm'}`}>{customerPhone}</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={clearCustomerSelection} className="border-border">
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>Search existing customer</Label>
                        <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={customerSearchOpen}
                              className={`w-full justify-between ${isMobile ? 'h-10 mt-1' : 'h-11 mt-1'} font-normal border-border ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
                            >
                              <span className="text-muted-foreground truncate">
                                {customerSearchQuery || 'Search by name or phone...'}
                              </span>
                              {customerSearching ? (
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                              ) : (
                                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${customerSearchOpen ? 'rotate-180' : ''}`} />
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                            <div className="p-2 border-b border-border">
                              <Input
                                placeholder="Search by name or phone"
                                value={customerSearchQuery}
                                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                                className="h-9 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                autoFocus
                              />
                            </div>
                            <ScrollArea className="max-h-48">
                              {customerSearching ? (
                                <div className="py-6 flex justify-center">
                                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                              ) : customerSearchResults.length === 0 ? (
                                <div className="py-6 text-center text-sm text-muted-foreground">
                                  {customerSearchQuery ? 'No customers found' : 'Type to search'}
                                </div>
                              ) : (
                                <ul className="p-1">
                                  {customerSearchResults.map((c) => (
                                    <li key={c.id}>
                                      <button
                                        type="button"
                                        className="w-full text-left px-3 py-2 hover:bg-muted rounded-md text-sm flex flex-col"
                                        onClick={() => selectCustomer(c)}
                                      >
                                        <span className="font-medium text-foreground">{c.name || 'No name'}</span>
                                        {c.phone && <span className="text-muted-foreground text-xs">{c.phone}</span>}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>Or enter new</p>
                      <div className="space-y-3">
                        <div>
                          <Label className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>Name</Label>
                          <Input
                            placeholder="Customer name"
                            value={customerName}
                            onChange={(e) => { setCustomerName(e.target.value); setSelectedCustomerId(null); }}
                            className={`${isMobile ? 'h-10 mt-1' : 'h-11 mt-1'} border-border ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
                          />
                        </div>
                        <div>
                          <Label className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>Phone Number</Label>
                          <div className="relative mt-1">
                            <Phone className={`absolute left-3 top-1/2 -translate-y-1/2 ${isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-muted-foreground`} />
                            <Input
                              type="tel"
                              placeholder="0XX XXX XXXX"
                              value={customerPhone}
                              onChange={(e) => { setCustomerPhone(e.target.value); setSelectedCustomerId(null); }}
                              className={`${isMobile ? 'h-10 pl-9' : 'h-11 pl-10'} border-border ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Enter phone to send receipt via SMS after sale
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Checkout Section */}
            <div className={`${isMobile ? 'p-3' : 'p-4'} bg-muted border-t border-border`}>
              {isRestaurant && (
                <div className="flex items-center justify-between mb-3 p-3 rounded-lg border border-border bg-background">
                  <div className="flex items-center gap-2">
                    <ChefHat className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label htmlFor="scan-send-to-kitchen" className="text-sm font-medium cursor-pointer">
                        Send to kitchen
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {sendToKitchen ? 'Order will appear in kitchen' : 'Skip kitchen (e.g. water only)'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="scan-send-to-kitchen"
                    checked={sendToKitchen}
                    onCheckedChange={setSendToKitchen}
                  />
                </div>
              )}
              <div className={`flex justify-between items-center ${isMobile ? 'mb-3' : 'mb-4'}`}>
                <span className={`${isMobile ? 'text-sm' : ''} text-muted-foreground`}>Total</span>
                <span className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-green-700`}>
                  {formatCurrency(totals.total)}
                </span>
              </div>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className={`w-full ${isMobile ? 'h-12 text-base' : 'h-14 text-lg'} font-semibold bg-brand hover:bg-brand-dark ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
                    onClick={handleProceedToPayment}
                  >
                    Continue to Payment
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Go to payment</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {/* PAYMENT STEP */}
        {currentStep === STEPS.PAYMENT && (
          <div className="h-full flex flex-col">
            <ScrollArea className="flex-1" style={{ paddingLeft: isMobile ? '0.75rem' : '1rem', paddingRight: isMobile ? '0.75rem' : '1rem' }}>
              <div className={`${isMobile ? 'py-3 space-y-4' : 'py-4 space-y-6'}`}>
                {/* Amount to Pay */}
                <div className={`text-center ${isMobile ? 'p-3' : 'p-4'} bg-muted ${isMobile ? 'rounded-md' : 'rounded-lg'}`}>
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600`}>Amount to Pay</p>
                  <p className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-green-700`}>
                    {formatCurrency(totals.total)}
                  </p>
                </div>

                {/* Payment Method Selection */}
                <div>
                  <Label className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600 ${isMobile ? 'mb-1.5' : 'mb-2'} block`}>Payment Method</Label>
                  <div className={`grid grid-cols-3 ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
                    {PAYMENT_METHODS.map(method => (
                      <Button
                        key={method.id}
                        variant={paymentMethod === method.id ? 'default' : 'outline'}
                        className={`${isMobile ? 'h-12' : 'h-14'} flex-col gap-1 border-border ${
                          paymentMethod === method.id ? 'bg-brand hover:bg-brand-dark' : ''
                        } ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
                        onClick={() => setPaymentMethod(method.id)}
                      >
                        <method.icon className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
                        <span className={`${isMobile ? 'text-xs' : 'text-xs'}`}>{method.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Amount Tendered (for cash) - type or use numpad */}
                {paymentMethod === 'cash' && (
                  <div>
                    <Label className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600 ${isMobile ? 'mb-1.5' : 'mb-2'} block`}>Amount Received</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className={`text-center font-bold ${isMobile ? 'h-10 text-lg' : 'h-12 text-2xl'} mb-2`}
                      value={amountTendered}
                      onChange={(e) => setAmountTendered(e.target.value)}
                    />
                    <POSNumpad
                      value={amountTendered}
                      onChange={setAmountTendered}
                      allowDecimal={true}
                      maxLength={10}
                    />
                    
                    {/* Change Display */}
                    {parsedAmount > 0 && (
                      <div className={`${isMobile ? 'mt-3 p-3' : 'mt-4 p-4'} ${isPaymentValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'} ${isMobile ? 'rounded-md' : 'rounded-lg'}`}>
                        <div className="flex justify-between items-center">
                          <span className={`${isMobile ? 'text-xs' : 'text-sm'} ${isPaymentValid ? 'text-green-700' : 'text-red-700'}`}>
                            {isPaymentValid ? 'Change to Give' : 'Amount Short'}
                          </span>
                          <span className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold ${isPaymentValid ? 'text-green-700' : 'text-red-700'}`}>
                            {isPaymentValid 
                              ? formatCurrency(change)
                              : formatCurrency(totals.total - parsedAmount)
                            }
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Mobile Money / Card - simple confirmation */}
                {paymentMethod !== 'cash' && (
                  <div className={`${isMobile ? 'p-3' : 'p-4'} bg-blue-50 border border-blue-200 ${isMobile ? 'rounded-md' : 'rounded-lg'} text-center`}>
                    <Smartphone className={`${isMobile ? 'h-8 w-8' : 'h-10 w-10'} text-blue-500 mx-auto mb-2`} />
                    <p className={`${isMobile ? 'text-sm' : 'text-base'} text-blue-700 font-medium`}>
                      {paymentMethod === 'mobile_money' 
                        ? 'Process mobile money payment' 
                        : 'Process card payment'
                      }
                    </p>
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-blue-600 mt-1`}>
                      Click confirm once payment is received
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Confirm Payment Button */}
            <div className={`${isMobile ? 'p-3' : 'p-4'} bg-muted border-t border-border`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className={`w-full ${isMobile ? 'h-12 text-base' : 'h-14 text-lg'} font-semibold bg-brand hover:bg-brand-dark ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
                    disabled={paymentMethod === 'cash' && !isPaymentValid}
                    loading={isProcessing}
                    onClick={handleConfirmPayment}
                  >
                    <>
                      <Check className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} mr-2`} />
                      {isMobile ? `Complete - ${formatCurrency(totals.total)}` : `Complete Sale - ${formatCurrency(totals.total)}`}
                    </>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Finish sale and take payment</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {/* SUCCESS STEP */}
        {currentStep === STEPS.SUCCESS && (
          <div className={`h-full flex flex-col items-center justify-center ${isMobile ? 'px-4' : 'px-6'}`}>
            <div className={`${isMobile ? 'w-16 h-16' : 'w-20 h-20'} bg-green-100 ${isMobile ? 'rounded-full' : 'rounded-full'} flex items-center justify-center ${isMobile ? 'mb-4' : 'mb-6'}`}>
              <CheckCircle className={`${isMobile ? 'h-10 w-10' : 'h-12 w-12'} text-green-600`} />
            </div>
            
            <h2 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-foreground ${isMobile ? 'mb-1' : 'mb-2'}`}>Sale Complete!</h2>
            
            {completedSale && (
              <p className={`${isMobile ? 'text-sm' : ''} text-gray-600 ${isMobile ? 'mb-1' : 'mb-2'}`}>
                Sale #{completedSale.saleNumber}
              </p>
            )}
            
            <p className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-green-700 ${isMobile ? 'mb-4' : 'mb-6'}`}>
              {formatCurrency(totals.total)}
            </p>

            {/* Receipt / SMS Status */}
            {customerPhone && receiptChannelsAvailable?.sms && !automationReceiptCoverage?.sms && (
              <div className={`${isMobile ? 'p-3' : 'p-4'} border ${isMobile ? 'rounded-md mb-4' : 'rounded-lg mb-6'} w-full max-w-sm ${
                receiptSent ? 'bg-green-500/10 border-green-500/30' : 'bg-muted border-border'
              }`}>
                {receiptSent ? (
                  <div className={`flex items-center justify-center gap-2 ${isMobile ? 'text-sm' : ''} text-green-700`}>
                    <Check className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
                    <span>Receipt sent via SMS to {customerPhone}</span>
                  </div>
                ) : (
                  <div className={`flex items-center justify-center gap-2 ${isMobile ? 'text-sm' : ''} text-gray-600`}>
                    <Loader2 className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} animate-spin`} />
                    <span>Sending receipt via SMS... You can close anytime.</span>
                  </div>
                )}
              </div>
            )}
            {!customerPhone && receiptChannelsAvailable?.sms && !automationReceiptCoverage?.sms && (
              <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground mb-2`}>
                Add customer phone next time to receive receipt via SMS
              </p>
            )}
            {automationReceiptCoverage?.sms && customerPhone && (
              <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground mb-2`}>
                Receipt will be sent automatically via your sale automation.
              </p>
            )}

            {change > 0 && paymentMethod === 'cash' && (
              <div className={`${isMobile ? 'p-3' : 'p-4'} bg-orange-50 border border-orange-200 ${isMobile ? 'rounded-md mb-4' : 'rounded-lg mb-6'} w-full max-w-sm`}>
                <div className={`flex justify-between items-center ${isMobile ? 'text-sm' : ''} text-orange-700`}>
                  <span>Change to Give</span>
                  <span className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold`}>{formatCurrency(change)}</span>
                </div>
              </div>
            )}

            {/* Action Buttons – Close allows SMS to continue in background */}
            <div className={`flex ${isMobile ? 'gap-2' : 'gap-3'} w-full max-w-sm`}>
              <Button
                variant="outline"
                className={`flex-1 ${isMobile ? 'h-11' : 'h-12'} border-border ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
                onClick={onClose}
              >
                Close
              </Button>
              <Button
                className={`flex-1 ${isMobile ? 'h-11' : 'h-12'} bg-brand hover:bg-brand-dark ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
                onClick={handleNewSale}
              >
                New Sale
              </Button>
            </div>
          </div>
        )}
      </div>
      <ProductVariantDialog
        product={variantPickerProduct}
        open={!!variantPickerProduct}
        onClose={() => setVariantPickerProduct(null)}
        onSelect={handleSelectVariant}
      />
      <Dialog open={!!priceDialogItem} onOpenChange={(nextOpen) => !nextOpen && setPriceDialogItem(null)}>
        <DialogContent className="sm:w-[var(--modal-w-sm)]">
          <DialogHeader>
            <DialogTitle>Price for {priceDialogItem?.name}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">
                {CURRENCY.SYMBOL} {priceValue || '0'}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Catalog price: {formatCurrency(priceDialogItem?.catalogUnitPrice ?? priceDialogItem?.baseUnitPrice ?? priceDialogItem?.unitPrice ?? 0)}
              </p>
            </div>
            <POSNumpad
              value={priceValue}
              onChange={setPriceValue}
              allowDecimal={true}
              maxLength={8}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceDialogItem(null)}>Cancel</Button>
            <Button className="bg-brand hover:bg-brand-dark" onClick={updateCartItemPrice}>Set Price</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <POSQuantityDialog
        open={quantityDialogOpen}
        onOpenChange={setQuantityDialogOpen}
        item={quantityEditItem}
        onApply={handleApplyQuantity}
      />
      </div>
    </div>
  );
};

export default POSScanMode;
