/**
 * POSCart Component
 *
 * Shopping cart for the POS system.
 * Displays items, quantities, prices, discounts, and totals.
 * Responsive layout for phone, tablet, and desktop.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Minus, Plus, Trash2, User, UserPlus, Percent, ShoppingCart, Phone, X, ChevronDown, ChevronUp, AlertCircle, Pencil, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import POSNumpad from './POSNumpad';
import POSQuantityDialog from './POSQuantityDialog';
import CartItemDetailsDialog from './CartItemDetailsDialog';
import { usePOSConfig } from '../../hooks/usePOSConfig';
import { CURRENCY } from '../../constants';
import { formatAmount, parseDecimalInput } from '../../utils/formatNumber';

/**
 * Cart item component
 */
const CartItem = ({ item, onUpdateQuantity, onRemove, onEditDiscount, onEditPrice, onEditQuantity, onOpenDetails }) => {
  const unitPrice = Number(item.unitPrice);
  const catalogUnitPrice = Number(item.catalogUnitPrice ?? item.baseUnitPrice ?? item.unitPrice);
  const quantity = Number(item.quantity) || 0;
  const discount = Number(item.discount) || 0;
  const itemTotal = (Number.isFinite(unitPrice) ? unitPrice : 0) * quantity - discount;
  const priceOverridden = item.priceOverridden === true;
  const isCustomItem = item.type === 'custom' || item.metadata?.customItem === true || !item.productId;

  return (
    <div className="grid grid-cols-2 gap-2 items-start py-3 border-b border-border last:border-0">
      {/* Left 50%: name + unit price */}
      <div className="min-w-0 w-full">
        <div className="flex items-center gap-2 min-w-0">
          {onOpenDetails && !isCustomItem ? (
            <button type="button" onClick={() => onOpenDetails(item)} className="min-w-0 truncate text-left font-medium text-foreground underline-offset-4 hover:underline" aria-label={`See the details of ${item.name}`}>{item.name}</button>
          ) : (
            <p className="font-medium text-foreground truncate">{item.name}</p>
          )}
          {isCustomItem && (
            <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wide text-[#166534] border-[#166534]">
              Custom
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {formatAmount(unitPrice)} × {quantity}
          {item.dealerPriceSource && item.dealerPriceSource !== 'retail' && (
            <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-[#166534]">
              Dealer
            </span>
          )}
        </p>
        {item.dealerPriceSource && item.dealerPriceSource !== 'retail'
          && item.retailUnitPrice != null
          && Math.abs(Number(item.retailUnitPrice) - unitPrice) > 0.001 && (
          <p className="text-xs text-muted-foreground line-through truncate">
            Retail: {formatAmount(item.retailUnitPrice)}
          </p>
        )}
        {priceOverridden && Number.isFinite(catalogUnitPrice) && (
          <p className="text-xs text-amber-700 truncate">
            Catalog: {formatAmount(catalogUnitPrice)}
          </p>
        )}
        {discount > 0 && (
          <p className="text-sm text-green-600 truncate">
            Discount: -{formatAmount(discount)}
          </p>
        )}
      </div>

      {/* Right 50%: qty stepper, total, actions */}
      <div className="min-w-0 w-full flex flex-col items-end gap-1">
        <div className="flex items-center gap-1 relative z-10 flex-wrap justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0"
                onClick={() => onUpdateQuantity(item.id, quantity - 1)}
              >
                <Minus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reduce by one</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 rounded-md border border-border bg-background text-center font-semibold text-foreground hover:bg-muted"
                onClick={() => onEditQuantity(item)}
                aria-label={`Edit quantity for ${item.name}`}
              >
                {quantity}
              </button>
            </TooltipTrigger>
            <TooltipContent>Tap to enter quantity</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0"
                onClick={() => onUpdateQuantity(item.id, quantity + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add one more</TooltipContent>
          </Tooltip>
        </div>
        <span className="font-semibold text-foreground">
          {formatAmount(itemTotal)}
        </span>
        <div className="flex gap-1 justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-green-700"
                onClick={() => onEditPrice(item)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit sale price for this item</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-blue-600"
                onClick={() => onEditDiscount(item)}
              >
                <Percent className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Give discount on this item</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-red-600"
                onClick={() => onRemove(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove this item from cart</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

/**
 * Main POSCart component
 * @param {Object} props
 * @param {Array} props.items - Cart items
 * @param {function} props.onUpdateQuantity - Called when item quantity changes
 * @param {function} props.onRemoveItem - Called when item is removed
 * @param {function} props.onUpdateItemDiscount - Called when item discount changes
 * @param {function} props.onUpdateItemPrice - Called when item sale price changes
 * @param {Object} [props.customer] - Selected customer
 * @param {Array} [props.customers] - List of customers for "Select existing" dropdown
 * @param {function} props.onSelectCustomer - Called when a customer is selected (from dropdown)
 * @param {function} props.onClearCustomer - Called to clear selected customer
 * @param {number} [props.cartDiscount] - Cart-level discount
 * @param {function} props.onUpdateCartDiscount - Called when cart discount changes
 * @param {function} props.onCheckout - Called when checkout is pressed
 * @param {function} props.onClearCart - Called to clear the cart
 * @param {Object} [props.totalsOverride] - Precomputed totals (e.g. tax-aware from parent POS)
 * @param {boolean} [props.showQuickCustomerForm] - Show inline customer form instead of selection button
 * @param {string} [props.quickCustomerName] - Name for quick customer form
 * @param {function} [props.onQuickCustomerNameChange] - Called when quick customer name changes
 * @param {string} [props.quickCustomerPhone] - Phone for quick customer form
 * @param {function} [props.onQuickCustomerPhoneChange] - Called when quick customer phone changes
 * @param {boolean} [props.isDealerMode] - Dealer wholesale mode (hides retail customer UI)
 * @param {Object} [props.dealer] - Selected dealer account
 * @param {Object} [props.dealerSummary] - Dealer balance/credit summary
 * @param {boolean} [props.embedded] - Fill parent height (e.g. bottom sheet) without outer card chrome
 * @param {boolean} [props.showTitle] - Show cart title row (default true)
 */
const POSCart = ({
  items = [],
  onUpdateQuantity,
  onRemoveItem,
  onUpdateItemDiscount,
  onUpdateItemPrice,
  customer,
  customers = [],
  onSelectCustomer,
  onClearCustomer,
  cartDiscount = 0,
  onUpdateCartDiscount,
  onCheckout,
  onClearCart,
  totalsOverride = null,
  showQuickCustomerForm = false,
  quickCustomerName = '',
  onQuickCustomerNameChange,
  quickCustomerPhone = '',
  onQuickCustomerPhoneChange,
  isDealerMode = false,
  dealer = null,
  dealerSummary = null,
  embedded = false,
  showTitle = true,
}) => {
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  // The line whose details are open (looked up in items, so quantity changes show at once).
  const [detailsItemId, setDetailsItemId] = useState(null);
  const detailsItem = detailsItemId ? items.find((line) => line.id === detailsItemId) ?? null : null;
  const [discountValue, setDiscountValue] = useState('');
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [priceValue, setPriceValue] = useState('');
  const [quantityDialogOpen, setQuantityDialogOpen] = useState(false);
  const [quantityEditItem, setQuantityEditItem] = useState(null);
  const [isCartDiscount, setIsCartDiscount] = useState(false);
  const [quickFormExpanded, setQuickFormExpanded] = useState(false);
  const [customerSelectValue, setCustomerSelectValue] = useState('');

  const { posConfig } = usePOSConfig();

  const customerValidation = useMemo(() => {
    if (isDealerMode) {
      const canCheckout = !!dealer?.id;
      return {
        canCheckout,
        message: canCheckout ? null : 'Select a dealer account before checkout',
      };
    }
    const { phoneRequired, nameRequired } = posConfig.customer || {};
    const hasPhone = !!(customer?.phone || quickCustomerPhone);
    const hasName = !!(customer?.name || customer?.company || quickCustomerName);
    const phoneOk = !phoneRequired || hasPhone;
    const nameOk = !nameRequired || hasName;
    const canCheckout = phoneOk && nameOk;
    let message = null;
    if (!phoneOk) message = 'Phone number is required before checkout';
    else if (!nameOk) message = 'Customer name is required before checkout';
    return { canCheckout, message };
  }, [posConfig.customer, customer, quickCustomerPhone, quickCustomerName, isDealerMode, dealer?.id]);

  // Sync dropdown value with selected customer (e.g. after selecting from dialog)
  useEffect(() => {
    setCustomerSelectValue(customer?.id ?? '');
  }, [customer?.id]);

  const internalTotals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const itemDiscounts = items.reduce((sum, item) => sum + (item.discount || 0), 0);
    const totalDiscount = itemDiscounts + cartDiscount;
    const total = subtotal - totalDiscount;
    return {
      subtotal,
      itemDiscounts,
      cartDiscount,
      totalDiscount,
      total: Math.max(0, total),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
    };
  }, [items, cartDiscount]);

  const totals = totalsOverride || internalTotals;

  const handleEditItemDiscount = useCallback((item) => {
    setEditingItem(item);
    setDiscountValue((item.discount || 0).toString());
    setIsCartDiscount(false);
    setDiscountDialogOpen(true);
  }, []);

  const handleEditItemPrice = useCallback((item) => {
    setEditingItem(item);
    setPriceValue((item.unitPrice ?? 0).toString());
    setPriceDialogOpen(true);
  }, []);

  const handleEditItemQuantity = useCallback((item) => {
    setQuantityEditItem(item);
    setQuantityDialogOpen(true);
  }, []);

  const handleApplyQuantity = useCallback((itemId, quantity) => {
    onUpdateQuantity(itemId, quantity);
    setQuantityEditItem(null);
  }, [onUpdateQuantity]);

  const handleEditCartDiscount = useCallback(() => {
    setEditingItem(null);
    setDiscountValue(cartDiscount.toString());
    setIsCartDiscount(true);
    setDiscountDialogOpen(true);
  }, [cartDiscount]);

  const handleApplyDiscount = useCallback(() => {
    const discount = parseDecimalInput(discountValue) || 0;
    
    if (isCartDiscount) {
      onUpdateCartDiscount(discount);
    } else if (editingItem) {
      onUpdateItemDiscount(editingItem.id, discount);
    }
    
    setDiscountDialogOpen(false);
    setEditingItem(null);
    setDiscountValue('');
  }, [discountValue, isCartDiscount, editingItem, onUpdateCartDiscount, onUpdateItemDiscount]);

  const handleApplyPrice = useCallback(() => {
    const nextPrice = parseDecimalInput(priceValue);
    if (!Number.isFinite(nextPrice) || nextPrice < 0 || !editingItem) return;

    onUpdateItemPrice?.(editingItem.id, nextPrice);
    setPriceDialogOpen(false);
    setEditingItem(null);
    setPriceValue('');
  }, [priceValue, editingItem, onUpdateItemPrice]);

  const isEmpty = items.length === 0;

  return (
    <Card className={embedded ? 'h-full min-h-0 flex flex-col border-0 bg-transparent' : 'min-h-full flex flex-col border border-border'}>
      <CardHeader className={embedded ? 'px-0 pb-3' : 'pb-3'}>
        {showTitle && (
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Cart
              {totals.itemCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {totals.itemCount} item{totals.itemCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
            {!isEmpty && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 min-h-[44px]"
                    onClick={onClearCart}
                  >
                    Clear All
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove all items from cart</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Customer / dealer selection */}
        <div className="mt-3">
          {isDealerMode ? (
            dealer ? (
              <div className="flex items-start gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                <Building2 className="h-4 w-4 text-green-700 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-green-800 truncate">
                    {dealer.businessName}
                  </div>
                  {dealerSummary ? (
                    <p className="text-xs text-green-700 mt-0.5">
                      Outstanding {dealerSummary.balanceLabel} · Available credit {dealerSummary.availableCreditLabel}
                    </p>
                  ) : null}
                  {dealer.phone ? (
                    <p className="text-xs text-green-600 mt-0.5">{dealer.phone}</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Select a dealer account above before checkout.</span>
              </div>
            )
          ) : customer ? (
            <div className="flex items-center justify-between p-2 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 min-w-0">
                <User className="h-4 w-4 text-green-700 shrink-0" />
                <span className="text-sm font-medium text-green-800 truncate">
                  {customer.name || customer.company || 'No name'}
                </span>
                {customer.phone && (
                  <span className="text-xs text-green-600">
                    ({customer.phone})
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-green-700 hover:text-green-800"
                onClick={onClearCustomer}
              >
                Change
              </Button>
            </div>
          ) : showQuickCustomerForm ? (
            /* Add Customer (Optional) first, then Select existing */
            <div className="space-y-3">
              {/* Add Customer (Optional) - name + phone for walk-in / new at checkout */}
              <Collapsible open={quickFormExpanded} onOpenChange={setQuickFormExpanded}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between text-muted-foreground"
                      >
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      <span>
                        {quickCustomerPhone || quickCustomerName
                          ? `${quickCustomerName || 'Customer'} ${quickCustomerPhone ? `(${quickCustomerPhone})` : ''}`
                          : 'Add Customer (Optional)'
                        }
                      </span>
                    </div>
                    {quickFormExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                      </Button>
                    </CollapsibleTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Add buyer name and phone – for receipt</TooltipContent>
                </Tooltip>
                <CollapsibleContent className="mt-2 space-y-3 p-3 bg-muted rounded-lg border border-border">
                  <div>
                    <Label className="text-xs text-muted-foreground">Customer Name</Label>
                    <Input
                      placeholder="Enter name"
                      value={quickCustomerName}
                      onChange={(e) => onQuickCustomerNameChange?.(e.target.value)}
                      className="h-10 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone Number</Label>
                    <div className="relative mt-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="tel"
                        placeholder="0XX XXX XXXX"
                        value={quickCustomerPhone}
                        onChange={(e) => onQuickCustomerPhoneChange?.(e.target.value)}
                        className="h-10 pl-9"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter phone to auto-send receipt via SMS
                    </p>
                  </div>
                  {(quickCustomerPhone || quickCustomerName) && (
                    <div className="flex items-center gap-2 text-xs p-2 rounded text-green-700 bg-green-50">
                      <User className="h-3 w-3" />
                      <span>
                        {quickCustomerPhone
                          ? 'Customer will be created or linked by phone number at checkout'
                          : 'Walk-in customer (no receipt will be sent)'
                        }
                      </span>
                    </div>
                  )}
                  {(quickCustomerPhone || quickCustomerName) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => {
                        onQuickCustomerNameChange?.('');
                        onQuickCustomerPhoneChange?.('');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </CollapsibleContent>
              </Collapsible>
              {/* Select existing customer - after Add Customer section (always visible) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Label className="text-xs text-muted-foreground">Select existing customer</Label>
                    <Select
                  value={customers.length === 0 ? '__none__' : (customerSelectValue || '')}
                  onValueChange={(value) => {
                    if (value === '__none__' || !value) return;
                    setCustomerSelectValue(value);
                    const selected = customers.find((c) => c.id === value);
                    if (selected) onSelectCustomer?.(selected);
                  }}
                >
                  <SelectTrigger className="h-10 mt-1">
                    <SelectValue placeholder="Select existing customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        No customers yet
                      </SelectItem>
                    ) : (
                      customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name || c.company || 'No name'}
                          {c.phone ? ` (${c.phone})` : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Choose a buyer you saved before</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-muted-foreground"
                  onClick={onSelectCustomer}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Customer (Optional)
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add buyer name and phone – for receipt</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardHeader>

      <CardContent className={`flex-1 flex flex-col overflow-hidden ${embedded ? 'p-0' : 'p-0'}`}>
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
            <ShoppingCart className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">Cart is empty</p>
            <p className="text-sm">Search or scan products to add</p>
          </div>
        ) : (
          <>
            {/* Items list */}
            <ScrollArea className="flex-1 px-4">
              {items.map((item) => (
                <CartItem
                  key={item.id}
                  item={item}
                  onUpdateQuantity={onUpdateQuantity}
                  onRemove={onRemoveItem}
                  onEditDiscount={handleEditItemDiscount}
                  onEditPrice={handleEditItemPrice}
                  onEditQuantity={handleEditItemQuantity}
                  onOpenDetails={(line) => setDetailsItemId(line.id)}
                />
              ))}
            </ScrollArea>
            {detailsItem && (
              <CartItemDetailsDialog
                item={detailsItem}
                onClose={() => setDetailsItemId(null)}
                onUpdateQuantity={onUpdateQuantity}
                onRemove={onRemoveItem}
              />
            )}

            {/* Totals */}
            <div className="p-4 bg-muted border-t border-border">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatAmount(totals.subtotal)}</span>
                </div>
                
                {totals.itemDiscounts > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Item Discounts</span>
                    <span>-{formatAmount(totals.itemDiscounts)}</span>
                  </div>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className="flex justify-between text-sm cursor-pointer hover:bg-muted -mx-2 px-2 py-1 rounded"
                      onClick={handleEditCartDiscount}
                    >
                      <span className="text-muted-foreground flex items-center gap-1">
                        Cart Discount
                        <Percent className="h-3 w-3" />
                      </span>
                  <span className={cartDiscount > 0 ? 'text-green-600' : 'text-muted-foreground'}>
                    {cartDiscount > 0 ? `-${formatAmount(cartDiscount)}` : 'Add'}
                  </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Give discount on whole cart</TooltipContent>
                </Tooltip>

                {Number(totals.taxAmount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{totals.taxLabel || 'Tax'}</span>
                    <span className="font-medium">{formatAmount(totals.taxAmount)}</span>
                  </div>
                )}

                <Separator />
                
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-green-700">{formatAmount(totals.total)}</span>
                </div>
              </div>

              {customerValidation.message && (
                <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {customerValidation.message}
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="w-full mt-4 h-14 text-lg font-semibold bg-green-700 hover:bg-green-800"
                    onClick={onCheckout}
                    disabled={isEmpty || !customerValidation.canCheckout}
                  >
                    Checkout - {formatAmount(totals.total)}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Finish sale and take payment</TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </CardContent>

      {/* Discount Dialog */}
      <Dialog open={discountDialogOpen} onOpenChange={setDiscountDialogOpen}>
        <DialogContent className="sm:w-[var(--modal-w-sm)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
          <DialogHeader>
            <DialogTitle>
              {isCartDiscount ? 'Cart Discount' : `Discount for ${editingItem?.name}`}
            </DialogTitle>
          </DialogHeader>
          
          <DialogBody className="space-y-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">
                {CURRENCY.SYMBOL} {discountValue || '0'}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Enter discount amount
              </p>
            </div>
            
            <POSNumpad
              value={discountValue}
              onChange={setDiscountValue}
              allowDecimal={true}
              maxLength={8}
            />
          </DialogBody>
          <DialogFooter className="mt-4">
            <SecondaryButton onClick={() => setDiscountDialogOpen(false)}>
              Cancel
            </SecondaryButton>
            <Button onClick={handleApplyDiscount} className="bg-green-700 hover:bg-green-800">
              Apply Discount
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price Dialog */}
      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="sm:w-[var(--modal-w-sm)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
          <DialogHeader>
            <DialogTitle>
              Price for {editingItem?.name}
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">
                {CURRENCY.SYMBOL} {priceValue || '0'}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {editingItem?.type === 'custom' || !editingItem?.productId
                  ? 'Custom item price'
                  : `Catalog price: ${formatAmount(editingItem?.catalogUnitPrice ?? editingItem?.baseUnitPrice ?? editingItem?.unitPrice ?? 0)}`}
              </p>
            </div>

            <POSNumpad
              value={priceValue}
              onChange={setPriceValue}
              allowDecimal={true}
              maxLength={8}
            />
          </DialogBody>
          <DialogFooter className="mt-4">
            <SecondaryButton onClick={() => setPriceDialogOpen(false)}>
              Cancel
            </SecondaryButton>
            <Button onClick={handleApplyPrice} className="bg-green-700 hover:bg-green-800">
              Set Price
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <POSQuantityDialog
        open={quantityDialogOpen}
        onOpenChange={setQuantityDialogOpen}
        item={quantityEditItem}
        onApply={handleApplyQuantity}
      />
    </Card>
  );
};

export default POSCart;
