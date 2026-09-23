/**
 * Products Page
 * 
 * Product catalog management for shop business type.
 * Features: CRUD operations, variants, barcode support, offline caching,
 * shop type-specific fields, and quick-add templates.
 */

import { lazy, Suspense, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import useClipboardImagePaste from '../hooks/useClipboardImagePaste';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  Package,
  Plus,
  RefreshCw,
  AlertTriangle,
  Currency,
  Pencil,
  Loader2,
  Filter,
  Copy,
  Trash2,
  Eye,
  TrendingUp,
  TrendingDown,
  Share2,
  WifiOff,
  Wifi,
  X,
  Calendar,
  Hash,
  Tag,
  ImagePlus,
  UploadCloud,
  QrCode,
  Info,
  Receipt,
  Upload,
  Download,
  ArrowRightLeft,
  MoreVertical,
  Globe,
  ChevronRight,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useDebounce } from '../hooks/useDebounce';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { guardOnline } from '../utils/onlineRequired';
import { useResponsive } from '../hooks/useResponsive';
import { useActiveShopType } from '../hooks/useActiveShopType';
import { useApi } from '../hooks/useApi';
import DetailsDrawer from '../components/DetailsDrawer';
import MobileFormDialog from '../components/MobileFormDialog';
import DrawerSectionCard from '../components/DrawerSectionCard';
import ActionColumn from '../components/ActionColumn';
import StatusChip from '../components/StatusChip';
import TableSkeleton from '../components/TableSkeleton';
import DashboardTable from '../components/DashboardTable';
import DashboardStatsCard from '../components/DashboardStatsCard';
import WelcomeSection from '../components/WelcomeSection';
import FeatureNotAvailable from '../components/FeatureNotAvailable';
import productService from '../services/productService';
import storeService from '../services/storeService';
import PublishToOnlineStoreDialog from '../components/store/PublishToOnlineStoreDialog';
import vendorService from '../services/vendorService';
import PhoneNumberInput from '../components/PhoneNumberInput';
import { cn } from '@/lib/utils';
import { resolveImageUrl } from '../utils/fileUtils';
import {
  compressProductImageFile,
  PRODUCT_IMAGE_MAX_INPUT_BYTES,
  PRODUCT_IMAGE_SKIP_COMPRESS_MAX_BYTES,
} from '../utils/compressProductImage';
import { useAuth } from '../context/AuthContext';
import { useShopOptional } from '../context/ShopContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import { useSmartSearch } from '../context/SmartSearchContext';
import { getErrorMessage, showSuccess, showError } from '../utils/toast';
import { QUERY_STALE, refreshAfterInventoryChange } from '../utils/queryInvalidation';
import { queryKeys } from '../utils/queryKeys';
import { EMPTY_STATES, FEATURE_NOT_AVAILABLE } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';
import ReceiveStockModal from '../components/ReceiveStockModal';
import StockTransferModal from '../components/StockTransferModal';
const ProductQRGenerateModal = lazy(() => import('../components/ProductQRGenerateModal'));
const BulkProductLabels = lazy(() => import('../components/BulkProductLabels'));
import ViewToggle from '../components/ViewToggle';
import ResponsiveSheet from '../components/ResponsiveSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  SEARCH_PLACEHOLDERS,
  DEBOUNCE_DELAYS,
  PRODUCT_UNITS,
  RESTAURANT_UNITS,
  SHOP_TYPES,
  SHOP_TYPE_FIELDS,
  SHOP_TYPE_HIDDEN_FIELDS,
  SHOP_TYPE_PLACEHOLDERS,
  PRODUCT_FIELD_LABELS,
  SIZE_OPTIONS,
  COLOR_OPTIONS,
  WARRANTY_OPTIONS,
  ALLERGENS_OPTIONS,
  AGE_RANGE_OPTIONS,
  calculateMargin,
  getMarginColor,
  getStockStatus,
  getWorkspaceDisplayName,
} from '../constants';
import { numberInputValue, handleNumberChange } from "../utils/formUtils";
import { formatAmount, formatInteger } from "../utils/formatNumber";
import { getProductStockQuantity } from "../utils/productStock";
// =============================================
// HELPER FUNCTIONS
// =============================================

const sortCategories = (list = []) =>
  [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

const getProductsBody = (response) => response && typeof response === 'object' ? response : {};

const getProductRows = (response) => {
  const body = getProductsBody(response);
  const list = body.data ?? body.products ?? [];
  return Array.isArray(list) ? list : [];
};

const getProductTotal = (response) => {
  const body = getProductsBody(response);
  return body?.count ?? body?.pagination?.total ?? 0;
};

const getCategoryRows = (response) => {
  const data = response?.data ?? response;
  const categoryList = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.categories)
      ? data.categories
      : Array.isArray(data)
        ? data
        : [];
  return sortCategories(categoryList);
};

const getProductStats = (response) => {
  const body = getProductsBody(response);
  const data = body.data && typeof body.data === 'object' ? body.data : body;
  return {
    total: Number(data.total || 0),
    lowStock: Number(data.lowStock || 0),
    outOfStock: Number(data.outOfStock || 0),
    totalValue: Number(data.totalValue || 0),
  };
};

const getProductDetail = (response) => response?.data?.data ?? response?.data ?? response;

const valueFormatter = (value, currency = '₵') => formatAmount(value, currency);

const marginFormatter = (costPrice, sellingPrice) => {
  const margin = calculateMargin(costPrice, sellingPrice);
  return `${margin.toFixed(1)}%`;
};

const FormLabelWithInfo = ({ label, hint }) => (
  <div className="flex items-center gap-1.5 min-h-[1.25rem]">
    <FormLabel className="min-h-0">{label}</FormLabel>
    {hint && (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none" aria-label="More info">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p>{hint}</p>
        </TooltipContent>
      </Tooltip>
    )}
  </div>
);

const resolveProductImageUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  return resolveImageUrl(url) || '';
};

/** Shown in product form image uploader — `stageProgress` is 0–100 within the current phase. */
const formatProductImageProgressLabel = (phase, stageProgress) => {
  const p = Math.round(Number(stageProgress) || 0);
  if (phase === 'uploading') return `Uploading — ${p}%`;
  if (phase === 'compressing') return `Compressing large image — ${p}%`;
  return 'Preparing…';
};

/** Movement tab: sales (−) and stock receives/adjustments (+/−) */
const ProductMovementTab = ({ productId, unit = 'pcs', valueFormatter }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setLoading(true);
    productService.getProductSales(productId, { limit: 50 })
      .then((res) => {
        if (cancelled) return;
        // API returns { success, count, pagination, data: rows }; axios interceptor returns response.data
        const list = Array.isArray(res?.data) ? res.data : (res?.data?.data ?? []);
        setItems(list);
        setTotal(res?.count ?? res?.pagination?.total ?? list.length);
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p>No stock movements recorded for this product yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Last {items.length} movement{items.length !== 1 ? 's' : ''}
        {total > items.length ? ` (of ${total})` : ''}
      </p>
      <div className="space-y-2 max-h-[360px] overflow-y-auto">
        {items.map((item) => {
          const isSale = item.kind === 'sale' || item.movementType === 'sale' || Boolean(item.sale);
          const sale = item.sale;
          const qtyChange = item.quantityChange != null
            ? Number(item.quantityChange)
            : (isSale ? -Math.abs(Number(item.quantity || 0)) : Number(item.quantity || 0));
          const isIncrease = qtyChange > 0;
          const label = item.label
            || (isSale ? (sale?.saleNumber || 'Sale') : 'Stock movement');
          const when = item.occurredAt || sale?.createdAt;
          const subtitleParts = [
            when ? dayjs(when).format('MMM D, YYYY HH:mm') : null,
            isSale && sale?.customer?.name ? sale.customer.name : null,
            !isSale && item.variantName ? item.variantName : null,
            !isSale && item.actorName ? `by ${item.actorName}` : null,
            !isSale && item.reason ? item.reason : null,
          ].filter(Boolean);

          return (
            <div
              key={`${item.kind || 'row'}-${item.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground truncate">
                  {label}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {subtitleParts.join(' · ')}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`font-medium ${isIncrease ? 'text-green-700' : 'text-foreground'}`}>
                  {isIncrease ? '+' : ''}{formatInteger(qtyChange)} {unit}
                </div>
                {isSale && (
                  <div className="text-xs text-muted-foreground">
                    {valueFormatter ? valueFormatter(item.total) : `${item.total}`}
                  </div>
                )}
                {!isSale && item.quantityAfter != null && (
                  <div className="text-xs text-muted-foreground">
                    Bal: {formatInteger(item.quantityAfter)} {unit}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// =============================================
// FORM SCHEMAS
// =============================================

const numberOrEmpty = z.union([z.number().min(0), z.literal('')]).transform((v) => (v === '' ? 0 : v));

const rentalProductFieldsSchema = z.object({
  isRentable: z.boolean().default(true),
  isSalable: z.boolean().default(false),
  rentalRatePerDay: numberOrEmpty,
  tracksSerialUnits: z.boolean().default(false),
});

const baseProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  alternateBarcode: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  costPrice: numberOrEmpty,
  sellingPrice: numberOrEmpty,
  wholesalePrice: z.union([
    z.number().min(0),
    z.literal(''),
    z.null(),
  ]).optional().transform((v) => (v === '' || v == null ? null : v)),
  quantityOnHand: numberOrEmpty,
  reorderLevel: numberOrEmpty,
  reorderQuantity: numberOrEmpty,
  unit: z.string().min(1, 'Unit is required'),
  brand: z.string().optional(),
  supplier: z.string().optional(),
  hasVariants: z.boolean().default(false),
  isActive: z.boolean().default(true),
  trackStock: z.boolean().default(true),
  imageUrl: z.string().optional(),
  // Shop type specific fields stored in metadata
  expiryDate: z.string().optional(),
  batchNumber: z.string().optional(),
  isPerishable: z.boolean().optional(),
  serialNumber: z.string().optional(),
  warrantyPeriod: z.number().optional(),
  specifications: z.string().optional(),
  dimensions: z.string().optional(),
  weight: z.string().optional(),
  material: z.string().optional(),
  partNumber: z.string().optional(),
  compatibility: z.string().optional(),
  vehicleModels: z.string().optional(),
  isbn: z.string().optional(),
  author: z.string().optional(),
  publisher: z.string().optional(),
  assemblyRequired: z.boolean().optional(),
  // Restaurant
  allergens: z.string().optional(),
  optionalFoods: z.string().optional(),
  // Clothing/Beauty
  sizes: z.string().optional(),
  colors: z.string().optional(),
  // Model variance (e.g. pump model, electronics SKU)
  models: z.string().optional(),
  // Sports
  size: z.string().optional(),
  // Toys
  ageRange: z.string().optional(),
  batteryRequired: z.boolean().optional(),
});

const RENTAL_PRODUCT_FORM_DEFAULTS = {
  isRentable: true,
  isSalable: false,
  rentalRatePerDay: 0,
  tracksSerialUnits: false,
};

/**
 * Product form schema; rental tenants get conditional pricing validation.
 * @param {boolean} isRental
 * @returns {import('zod').ZodTypeAny}
 */
const createProductSchema = (isRental) => {
  let schema = baseProductSchema;
  if (isRental) {
    schema = schema.merge(rentalProductFieldsSchema);
  }
  return schema
    .refine((data) => {
      const primaryBarcode = data.barcode?.trim();
      const alternateBarcode = data.alternateBarcode?.trim();
      return !primaryBarcode || !alternateBarcode || primaryBarcode !== alternateBarcode;
    }, {
      message: 'Product code must be different from the primary barcode',
      path: ['alternateBarcode'],
    })
    .superRefine((data, ctx) => {
      if (!isRental) return;

      if (data.isRentable !== false) {
        const rate = Number(data.rentalRatePerDay ?? 0);
        if (!(rate > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Rate per day is required for rentable products',
            path: ['rentalRatePerDay'],
          });
        }
      }

      if (data.isSalable) {
        const price = Number(data.sellingPrice ?? 0);
        if (!(price > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Selling price is required when product is salable',
            path: ['sellingPrice'],
          });
        }
      }
    });
};

const stockAdjustSchema = z.object({
  adjustmentMode: z.enum(['set', 'delta']),
  newQuantity: z.union([z.number().min(0), z.literal('')]).transform((v) => (v === '' ? undefined : v)).optional(),
  quantityDelta: z.union([z.number(), z.literal('')]).transform((v) => (v === '' ? undefined : v)).optional(),
  reason: z.string().optional(),
}).refine((data) => {
  if (data.adjustmentMode === 'set') {
    return data.newQuantity !== undefined && data.newQuantity !== '';
  }
  return data.quantityDelta !== undefined && data.quantityDelta !== '';
}, {
  message: 'Quantity is required',
  path: ['newQuantity'],
});

const parseDecimalInput = (v) => {
  if (v === '' || v == null) return undefined;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v).replace(/,/g, '.');
  const n = parseFloat(s);
  return Number.isNaN(n) ? undefined : n;
};

const getProductBarcodeAliases = (product) => {
  if (!product) return [];

  const primaryBarcode = product.barcode?.trim();
  const aliases = [];
  const seen = new Set();

  const addAlias = (value, isActive = true) => {
    if (!isActive || value === undefined || value === null) return;

    String(value)
      .split(',')
      .map((candidate) => candidate.trim())
      .filter(Boolean)
      .forEach((candidate) => {
        if (candidate !== primaryBarcode && !seen.has(candidate)) {
          seen.add(candidate);
          aliases.push(candidate);
        }
      });
  };

  addAlias(product.alternateBarcode);

  if (Array.isArray(product.barcodeAliases)) {
    product.barcodeAliases.forEach((item) => {
      if (typeof item === 'string') {
        addAlias(item);
      } else {
        addAlias(item?.barcode, item?.isActive !== false);
      }
    });
  }

  if (Array.isArray(product.barcodes)) {
    product.barcodes.forEach((item) => {
      addAlias(item?.barcode, item?.isActive !== false);
    });
  }

  return aliases;
};

const getProductAlternateBarcode = (product) => getProductBarcodeAliases(product)[0] || '';

/** Product Code column / drawer — dedicated product code only (no SKU or primary barcode fallback). */
const getProductCodeForTable = (product) => {
  if (!product) return '';

  const pickTrimmed = (...values) => (
    values
      .map((value) => (value == null ? '' : String(value).trim()))
      .find(Boolean) || ''
  );

  return pickTrimmed(
    product.productCode,
    product.metadata?.productCode,
    getProductAlternateBarcode(product),
  );
};

const variantSchema = z.object({
  name: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  costPrice: z.union([
    z.number().min(0),
    z.string().transform((s) => parseDecimalInput(s)),
    z.literal('')
  ]).transform((v) => (v === '' ? undefined : v)).optional(),
  sellingPrice: z.union([
    z.number().min(0),
    z.string().transform((s) => parseDecimalInput(s)),
    z.literal('')
  ]).transform((v) => (v === '' ? undefined : v)).optional(),
  quantityOnHand: z.union([
    z.number().min(0),
    z.string().transform((s) => (parseDecimalInput(s) ?? 0)),
    z.literal('')
  ]).transform((v) => (v === '' ? 0 : v)),
  size: z.string().optional(),
  color: z.string().optional(),
  model: z.string().optional(),
}).refine((data) => data.size || data.color || data.model || data.name, {
  message: 'At least one of Size, Color, or Model is required',
  path: ['size'],
});

const quickVendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required'),
  company: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  phone: z.string().optional(),
});

// =============================================
// MAIN COMPONENT
// =============================================

const Products = () => {
  const { activeTenant, activeTenantId, tenantRole, isManager, hasFeature } = useAuth();
  const businessType = activeTenant?.businessType || null;
  const isRental = businessType === 'rental';
  const isShop = businessType === 'shop' || isRental;
  const productSchema = useMemo(() => createProductSchema(isRental), [isRental]);
  const dealersAccountEnabled = hasFeature('dealersAccount');
  // Catalog wholesale price is for shop/pharmacy products. Do not gate on dealersAccount —
  // that flag unlocks the Dealers module / dealer POS, not the ability to set a wholesale list price.
  const showWholesalePriceField = ['shop', 'pharmacy'].includes(activeTenant?.businessType)
    || dealersAccountEnabled;
  const shopContext = useShopOptional();
  const activeShopId = shopContext?.activeShopId ?? null;
  const { scopeReady, activeStudioLocationId } = useWorkspaceScope();
  const activeShopName = shopContext?.activeShop?.name ?? null;
  const { isMobile } = useResponsive();
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const { data: storeSettingsResponse } = useQuery({
    queryKey: ['store', 'settings'],
    queryFn: () => storeService.getSettings(),
    staleTime: QUERY_STALE.LIST,
  });
  const storeHomeSections = useMemo(() => {
    const settings = storeSettingsResponse?.data ?? storeSettingsResponse ?? null;
    const items = settings?.metadata?.productSections?.items;
    return Array.isArray(items) ? items : [];
  }, [storeSettingsResponse]);

  const shopType = useActiveShopType();
  const shopTypeFields = SHOP_TYPE_FIELDS[shopType] || [];
  const canViewProductSensitiveFields = tenantRole !== 'staff';
  const canDeleteProduct = isManager || tenantRole === 'staff';

  // Shop-type-specific unit options (restaurant gets extra units)
  const unitOptions = useMemo(() => {
    if (shopType === SHOP_TYPES.RESTAURANT) {
      return [...PRODUCT_UNITS, ...RESTAURANT_UNITS];
    }
    return PRODUCT_UNITS;
  }, [shopType]);

  // Shop-type-specific placeholders for form fields
  const placeholders = useMemo(() => {
    return SHOP_TYPE_PLACEHOLDERS[shopType] || SHOP_TYPE_PLACEHOLDERS.default;
  }, [shopType]);

  // Check if a field should be hidden for this shop type
  const isFieldHidden = useCallback((fieldName) => {
    const hidden = SHOP_TYPE_HIDDEN_FIELDS[shopType];
    return hidden && hidden.includes(fieldName);
  }, [shopType]);

  // =============================================
  // STATE
  // =============================================

  // Pagination
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [rentalUnits, setRentalUnits] = useState([]);
  const [rentalUnitsLoading, setRentalUnitsLoading] = useState(false);
  const [rentalUnitSaving, setRentalUnitSaving] = useState(false);
  const [newRentalUnit, setNewRentalUnit] = useState({
    serialNumber: '',
    plateNumber: '',
    color: '',
    status: 'available',
  });
  const [adjustStockOpen, setAdjustStockOpen] = useState(false);
  const [productToAdjust, setProductToAdjust] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [variantFormOpen, setVariantFormOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState(null);
  const [variantDetailOpen, setVariantDetailOpen] = useState(false);
  const [selectedVariantDetail, setSelectedVariantDetail] = useState(null);
  const [variantDeleteDialogOpen, setVariantDeleteDialogOpen] = useState(false);
  const [productImageUploading, setProductImageUploading] = useState(false);
  /** 'compressing' | 'uploading' — for progress label; null when idle */
  const [productImagePhase, setProductImagePhase] = useState(null);
  /** 0–100 for the progress bar (compression weighted ~35%, upload ~65% when compression runs). */
  const [productImageProgress, setProductImageProgress] = useState(0);
  /** 0–100 within the current phase (shown in the label). */
  const [productImageStageProgress, setProductImageStageProgress] = useState(0);
  const [productImageDragging, setProductImageDragging] = useState(false);
  const productImageInputRef = useRef(null);
  const [vendors, setVendors] = useState([]);

  // Category creation state
  const [tableViewMode, setTableViewMode] = useState('table');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [categoryFilterSearchTerm, setCategoryFilterSearchTerm] = useState('');
  const [receiveStockOpen, setReceiveStockOpen] = useState(false);
  const [productToReceive, setProductToReceive] = useState(null);
  const [stockTransferOpen, setStockTransferOpen] = useState(false);
  const [productToTransfer, setProductToTransfer] = useState(null);
  const [qrGenerateOpen, setQrGenerateOpen] = useState(false);
  const [productForQR, setProductForQR] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [vendorAddModalOpen, setVendorAddModalOpen] = useState(false);
  const [vendorSelectOpen, setVendorSelectOpen] = useState(false);
  const [vendorCategories, setVendorCategories] = useState([]);
  const [addingVendor, setAddingVendor] = useState(false);
  const [storeListingOpen, setStoreListingOpen] = useState(false);
  const [storeListingProduct, setStoreListingProduct] = useState(null);

  const [bulkLabelsOpen, setBulkLabelsOpen] = useState(false);

  // Bulk import state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  const { isOnline } = useOnlineStatus();

  // Debounced search
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);

  const productQueryParams = useMemo(() => {
    const params = {
      page: pagination.current,
      limit: pagination.pageSize,
      search: debouncedSearch,
      categoryId: categoryFilter === 'all' ? undefined : categoryFilter,
      sort: sortBy || 'name_asc',
    };

    if (stockFilter === 'low') {
      params.lowStock = true;
    } else if (stockFilter === 'out') {
      params.outOfStock = true;
    }

    return params;
  }, [pagination.current, pagination.pageSize, debouncedSearch, categoryFilter, stockFilter, sortBy]);

  const productListQueryKey = useMemo(
    () => queryKeys.products.list(activeTenantId, activeShopId, activeStudioLocationId, productQueryParams),
    [activeTenantId, activeShopId, activeStudioLocationId, productQueryParams]
  );

  const productCategoriesQueryKey = useMemo(
    () => queryKeys.products.categories(activeTenantId, activeShopId, activeStudioLocationId),
    [activeTenantId, activeShopId, activeStudioLocationId]
  );

  const productStatsQueryKey = useMemo(
    () => queryKeys.products.stats(activeTenantId, activeShopId, activeStudioLocationId),
    [activeTenantId, activeShopId, activeStudioLocationId]
  );

  const {
    data: productsResponse,
    isLoading: loading,
    isFetching: productsFetching,
    isError: productsError,
    error: productsQueryError,
    refetch: refetchProducts,
  } = useApi({
    queryKey: productListQueryKey,
    queryFn: () => productService.getProducts(productQueryParams),
    options: {
      enabled: scopeReady,
      staleTime: QUERY_STALE.LIST,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  });

  const {
    data: categoriesResponse,
    refetch: refetchCategories,
  } = useApi({
    queryKey: productCategoriesQueryKey,
    queryFn: () => productService.getCategories(),
    options: {
      enabled: scopeReady,
      staleTime: QUERY_STALE.SLOW,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  });

  const {
    data: statsResponse,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useApi({
    queryKey: productStatsQueryKey,
    queryFn: () => productService.getProductStats(),
    options: {
      enabled: scopeReady,
      staleTime: QUERY_STALE.TRANSACTIONAL,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  });

  const products = useMemo(() => getProductRows(productsResponse), [productsResponse]);
  const categories = useMemo(() => getCategoryRows(categoriesResponse), [categoriesResponse]);
  const stats = useMemo(() => getProductStats(statsResponse), [statsResponse]);

  const selectedProductDetailQueryKey = useMemo(
    () => queryKeys.products.detail(selectedProduct?.id, activeTenantId, activeShopId, activeStudioLocationId),
    [selectedProduct?.id, activeTenantId, activeShopId, activeStudioLocationId]
  );

  const { data: selectedProductDetailResponse } = useApi({
    queryKey: selectedProductDetailQueryKey,
    queryFn: () => productService.getProductById(selectedProduct.id),
    options: {
      enabled: Boolean(scopeReady && drawerOpen && selectedProduct?.id),
      staleTime: QUERY_STALE.TRANSACTIONAL,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  });

  useEffect(() => {
    setPagination((prev) => {
      const nextTotal = getProductTotal(productsResponse);
      return prev.total === nextTotal ? prev : { ...prev, total: nextTotal };
    });
  }, [productsResponse]);

  useEffect(() => {
    if (productsError) {
      console.error('Failed to fetch products:', productsQueryError);
      showError(productsQueryError, 'Failed to load products');
    }
  }, [productsError, productsQueryError]);

  useEffect(() => {
    const detail = getProductDetail(selectedProductDetailResponse);
    if (detail?.id) {
      setSelectedProduct((prev) => (prev?.id === detail.id ? detail : prev));
    }
  }, [selectedProductDetailResponse]);

  // =============================================
  // FORMS
  // =============================================

  const form = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      sku: '',
      barcode: '',
      alternateBarcode: '',
      description: '',
      categoryId: '',
      costPrice: 0,
      sellingPrice: 0,
      wholesalePrice: null,
      quantityOnHand: 0,
      reorderLevel: 0,
      reorderQuantity: 0,
      unit: 'pcs',
      brand: '',
      supplier: '',
      hasVariants: false,
      isActive: true,
      imageUrl: '',
      expiryDate: '',
      batchNumber: '',
      isPerishable: false,
      serialNumber: '',
      warrantyPeriod: 0,
      specifications: '',
      dimensions: '',
      weight: '',
      material: '',
      partNumber: '',
      compatibility: '',
      vehicleModels: '',
      isbn: '',
      author: '',
      publisher: '',
      assemblyRequired: false,
      allergens: '',
      optionalFoods: '',
      sizes: '',
      colors: '',
      models: '',
      size: '',
      ageRange: '',
      batteryRequired: false,
      ...(isRental ? RENTAL_PRODUCT_FORM_DEFAULTS : {}),
    },
  });

  const adjustForm = useForm({
    resolver: zodResolver(stockAdjustSchema),
    defaultValues: {
      adjustmentMode: 'set',
      newQuantity: 0,
      quantityDelta: 0,
      reason: '',
    },
  });

  const variantForm = useForm({
    resolver: zodResolver(variantSchema),
    defaultValues: {
      sku: '',
      barcode: '',
      costPrice: 0,
      sellingPrice: 0,
      quantityOnHand: 0,
      size: '',
      color: '',
      model: '',
    },
  });

  const vendorForm = useForm({
    resolver: zodResolver(quickVendorSchema),
    defaultValues: {
      name: '',
      company: '',
      category: '',
      phone: '',
    },
  });

  // Watch form values for margin calculation
  const watchCostPrice = form.watch('costPrice');
  const watchSellingPrice = form.watch('sellingPrice');
  const watchIsRentable = isRental ? form.watch('isRentable') : true;
  const watchIsSalable = isRental ? form.watch('isSalable') : false;
  const calculatedMargin = useMemo(
    () => calculateMargin(watchCostPrice, watchSellingPrice),
    [watchCostPrice, watchSellingPrice]
  );

  const handleOpenQRGenerate = useCallback((product) => {
    setProductForQR(product);
    setQrGenerateOpen(true);
  }, []);

  const handleOpenReceiveStock = useCallback((product = null) => {
    setProductToReceive(product);
    setReceiveStockOpen(true);
  }, []);

  const handleOpenStockTransfer = useCallback((product = null) => {
    setProductToTransfer(product);
    setStockTransferOpen(true);
  }, []);

  const handleOpenQRGenerateFromForm = useCallback(() => {
    if (editingProduct) {
      handleOpenQRGenerate(editingProduct);
      return;
    }
    const v = form.getValues();
    const cat = categories.find((c) => c.id === v.categoryId);
    handleOpenQRGenerate({
      name: v.name,
      sku: v.sku,
      barcode: v.barcode,
      barcodeAliases: v.alternateBarcode ? [v.alternateBarcode] : undefined,
      description: v.description,
      imageUrl: v.imageUrl,
      costPrice: v.costPrice,
      sellingPrice: v.sellingPrice,
      quantityOnHand: v.quantityOnHand,
      reorderLevel: v.reorderLevel,
      reorderQuantity: v.reorderQuantity,
      unit: v.unit,
      brand: v.brand,
      supplier: v.supplier,
      categoryName: cat?.name,
    });
  }, [editingProduct, form, categories, handleOpenQRGenerate]);


  // =============================================
  // DATA FETCHING
  // =============================================

  const fetchProducts = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    return refetchProducts();
  }, [queryClient, refetchProducts]);

  const fetchCategories = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.products.categories(activeTenantId, activeShopId, activeStudioLocationId) });
    return refetchCategories();
  }, [activeTenantId, activeShopId, activeStudioLocationId, queryClient, refetchCategories]);

  const fetchVendors = useCallback(async () => {
    try {
      const response = await vendorService.getVendors({ limit: 500 });
      const data = response?.data ?? response;
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setVendors(list);
    } catch (error) {
      console.error('[Products fetchVendors] Failed to load vendors:', error?.message);
      setVendors([]);
    }
  }, []);

  const fetchVendorCategories = useCallback(async () => {
    try {
      const cats = await vendorService.getCategories();
      setVendorCategories(Array.isArray(cats) ? cats : []);
    } catch (error) {
      console.error('[Products fetchVendorCategories] Failed:', error?.message);
      setVendorCategories([]);
    }
  }, []);

  // Create new category
  const handleCreateCategory = useCallback(async () => {
    if (!newCategoryName.trim()) {
      showError('Please enter a category name');
      return;
    }
    
    setCreatingCategory(true);
    try {
      const response = await productService.createCategory({ name: newCategoryName.trim() });
      const newCategory = response.data || response;
      
      if (newCategory?.id) {
        queryClient.setQueryData(productCategoriesQueryKey, (old) => {
          const current = getCategoryRows(old);
          return { data: sortCategories([...current, newCategory]) };
        });
        showSuccess('Category created successfully');
        setCategoryModalOpen(false);
        setNewCategoryName('');
        
        // Auto-select the new category in the form if it's open
        if (formOpen) {
          form.setValue('categoryId', String(newCategory.id));
        }
      }
    } catch (error) {
      console.error('Failed to create category:', error);
      showError(error?.response?.data?.message || 'Failed to create category');
    } finally {
      setCreatingCategory(false);
    }
  }, [newCategoryName, queryClient, productCategoriesQueryKey, formOpen, form]);

  const handleDeleteCategory = useCallback(async () => {
    if (!categoryToDelete?.id) return;
    setDeletingCategory(true);
    try {
      await productService.deleteCategory(categoryToDelete.id);
      showSuccess('Category deleted');
      setCategoryToDelete(null);
      fetchCategories();
    } catch (error) {
      showError(error?.response?.data?.message || 'Failed to delete category');
    } finally {
      setDeletingCategory(false);
    }
  }, [categoryToDelete, fetchCategories]);

  const handleAddNewVendor = useCallback((e) => {
    if (e) e.preventDefault();
    setVendorSelectOpen(false);
    vendorForm.reset({ name: '', company: '', category: '', phone: '' });
    setVendorAddModalOpen(true);
  }, [vendorForm]);

  const handleAddVendorSubmit = useCallback(async (values) => {
    setAddingVendor(true);
    try {
      const response = await vendorService.create({
        name: values.name.trim(),
        company: values.company?.trim() || undefined,
        category: values.category,
        phone: values.phone?.trim() || undefined,
      });
      const newVendor = response?.data ?? response;
      const vendorName = newVendor?.name || newVendor?.company || values.name;
      await fetchVendors();
      form.setValue('supplier', vendorName);
      setVendorAddModalOpen(false);
      vendorForm.reset({ name: '', company: '', category: '', phone: '' });
      showSuccess('Vendor created successfully');
    } catch (error) {
      const msg = error?.response?.data?.error || error?.response?.data?.message || error?.message;
      showError(msg || 'Failed to create vendor');
    } finally {
      setAddingVendor(false);
    }
  }, [form, vendorForm, fetchVendors]);

  const fetchStats = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.products.stats(activeTenantId, activeShopId, activeStudioLocationId) });
    return refetchStats();
  }, [activeTenantId, activeShopId, activeStudioLocationId, queryClient, refetchStats]);

  // =============================================
  // EFFECTS
  // =============================================

  // Refetch categories and vendors when Add/Edit Product modal opens so dropdowns have options (tenant-scoped)
  useEffect(() => {
    if (formOpen && activeTenantId) {
      fetchCategories();
      if (canViewProductSensitiveFields) {
        fetchVendors();
        fetchVendorCategories();
      }
    }
  }, [formOpen, activeTenantId, canViewProductSensitiveFields, fetchCategories, fetchVendors, fetchVendorCategories]);

  // Clear vendor list when tenant changes so we don't show another tenant's vendors
  useEffect(() => {
    setVendors([]);
  }, [activeTenantId]);

  // Set up smart search
  useEffect(() => {
    setPageSearchConfig({
      scope: 'products',
      placeholder: SEARCH_PLACEHOLDERS.PRODUCTS,
    });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [searchValue, categoryFilter, stockFilter, sortBy]);

  // Open form when add=1 query param is present (e.g., from dashboard "Add Product" button)
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setFormOpen(true);
      setEditingProduct(null);
      form.reset();
      const next = new URLSearchParams(searchParams);
      next.delete('add');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, form]);

  // =============================================
  // HANDLERS
  // =============================================

  const handleViewProduct = useCallback((product) => {
    setSelectedProduct(product);
    setDrawerOpen(true);
  }, []);

  const handleEditProduct = useCallback(async (product) => {
    let productForEdit = product;

    if (product?.id && !Array.isArray(product.barcodes) && !Array.isArray(product.barcodeAliases)) {
      try {
        const response = await queryClient.fetchQuery({
          queryKey: queryKeys.products.detail(product.id, activeTenantId, activeShopId, activeStudioLocationId),
          queryFn: () => productService.getProductById(product.id),
          staleTime: QUERY_STALE.TRANSACTIONAL,
        });
        const data = getProductDetail(response);
        if (data?.id) {
          productForEdit = data;
          setSelectedProduct((prev) => (prev?.id === product.id ? data : prev));
        }
      } catch (error) {
        console.error('Failed to fetch product details for edit:', error);
      }
    }

    setEditingProduct(productForEdit);
    
    // Reset form with product data
    form.reset({
      name: productForEdit.name || '',
      sku: productForEdit.sku || '',
      barcode: productForEdit.barcode || '',
      alternateBarcode: getProductAlternateBarcode(productForEdit),
      description: productForEdit.description || '',
      categoryId: productForEdit.categoryId ? String(productForEdit.categoryId) : '',
      costPrice: parseFloat(productForEdit.costPrice) || 0,
      sellingPrice: parseFloat(productForEdit.sellingPrice) || 0,
      wholesalePrice: productForEdit.wholesalePrice != null && productForEdit.wholesalePrice !== ''
        ? parseFloat(productForEdit.wholesalePrice)
        : null,
      quantityOnHand: parseFloat(productForEdit.quantityOnHand) || 0,
      reorderLevel: parseFloat(productForEdit.reorderLevel) || 0,
      reorderQuantity: parseFloat(productForEdit.reorderQuantity) || 0,
      unit: productForEdit.unit || 'pcs',
      brand: productForEdit.brand || '',
      supplier: productForEdit.supplier || '',
      hasVariants: productForEdit.hasVariants || false,
      isActive: productForEdit.isActive !== false,
      trackStock: productForEdit.trackStock !== false,
      imageUrl: productForEdit.imageUrl || '',
      // Metadata fields
      expiryDate: productForEdit.metadata?.expiryDate || '',
      batchNumber: productForEdit.metadata?.batchNumber || '',
      isPerishable: productForEdit.metadata?.isPerishable || false,
      serialNumber: productForEdit.metadata?.serialNumber || '',
      warrantyPeriod: productForEdit.metadata?.warrantyPeriod || 0,
      specifications: productForEdit.metadata?.specifications || '',
      dimensions: productForEdit.metadata?.dimensions || '',
      weight: productForEdit.metadata?.weight || '',
      material: productForEdit.metadata?.material || '',
      partNumber: productForEdit.metadata?.partNumber || '',
      compatibility: productForEdit.metadata?.compatibility || '',
      vehicleModels: productForEdit.metadata?.vehicleModels || '',
      isbn: productForEdit.metadata?.isbn || '',
      author: productForEdit.metadata?.author || '',
      publisher: productForEdit.metadata?.publisher || '',
      assemblyRequired: productForEdit.metadata?.assemblyRequired || false,
      allergens: productForEdit.metadata?.allergens || '',
      optionalFoods: productForEdit.metadata?.optionalFoods || '',
      sizes: productForEdit.metadata?.sizes || '',
      colors: productForEdit.metadata?.colors || '',
      models: productForEdit.metadata?.models || '',
      size: productForEdit.metadata?.size || '',
      ageRange: productForEdit.metadata?.ageRange || '',
      batteryRequired: productForEdit.metadata?.batteryRequired || false,
      ...(isRental ? {
        isRentable: productForEdit.isRentable !== false,
        isSalable: productForEdit.isSalable === true,
        rentalRatePerDay: parseFloat(productForEdit.rentalRatePerDay) || 0,
        tracksSerialUnits: productForEdit.metadata?.tracksSerialUnits === true,
      } : {}),
    });
    
    setFormOpen(true);
  }, [activeTenantId, activeShopId, activeStudioLocationId, form, isRental, queryClient]);

  const handleOpenStoreListing = useCallback((product) => {
    if (!product?.id) return;
    setStoreListingProduct(product);
    setStoreListingOpen(true);
  }, []);

  const handleCreateProduct = () => {
    setEditingProduct(null);
    form.reset({
      name: '',
      sku: '',
      barcode: '',
      alternateBarcode: '',
      description: '',
      categoryId: '',
      costPrice: 0,
      sellingPrice: 0,
      wholesalePrice: null,
      quantityOnHand: 0,
      reorderLevel: 0,
      reorderQuantity: 0,
      unit: 'pcs',
      brand: '',
      supplier: '',
      hasVariants: false,
      isActive: true,
      trackStock: true,
      imageUrl: '',
      expiryDate: '',
      batchNumber: '',
      isPerishable: false,
      serialNumber: '',
      warrantyPeriod: 0,
      specifications: '',
      dimensions: '',
      weight: '',
      material: '',
      partNumber: '',
      compatibility: '',
      vehicleModels: '',
      isbn: '',
      author: '',
      publisher: '',
      assemblyRequired: false,
      allergens: '',
      optionalFoods: '',
      sizes: '',
      colors: '',
      models: '',
      size: '',
      ageRange: '',
      batteryRequired: false,
      ...(isRental ? RENTAL_PRODUCT_FORM_DEFAULTS : {}),
    });
    setFormOpen(true);
  };

  const handleDownloadProductTemplate = useCallback(async () => {
    setTemplateLoading(true);
    try {
      const blob = await productService.getProductImportTemplate();
      const url = URL.createObjectURL(blob?.data ?? blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products_import_template.csv';
      a.click();
      URL.revokeObjectURL(url);
      showSuccess('Template downloaded');
    } catch (err) {
      showError(err?.response?.data?.message ?? err?.message ?? 'Failed to download template');
    } finally {
      setTemplateLoading(false);
    }
  }, []);

  const handleImportSubmit = useCallback(async () => {
    if (!importFile) {
      showError('Please select a CSV or Excel file');
      return;
    }
    setImportLoading(true);
    setImportResult(null);
    try {
      const result = await productService.importProducts(importFile);
      setImportResult(result);
      const success = result?.successCount ?? 0;
      const failed = result?.errorCount ?? 0;
      if (success > 0) {
        showSuccess(`${success} product(s) imported`);
        refreshAfterInventoryChange(queryClient);
      }
      if (failed > 0 && success === 0) {
        showError(`${failed} row(s) failed. Check the errors below.`);
      }
    } catch (err) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Import failed';
      showError(msg);
      setImportResult({ successCount: 0, errorCount: 1, errors: [{ row: 0, message: msg }] });
    } finally {
      setImportLoading(false);
    }
  }, [importFile, queryClient]);

  const handleDeleteClick = (product) => {
    setProductToDelete(product);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;

    setSubmitting(true);
    try {
      if (!guardOnline(showError)) return;
      await productService.deleteProduct(productToDelete.id);
      showSuccess('Product deleted successfully');
      setDeleteDialogOpen(false);
      setProductToDelete(null);
      refreshAfterInventoryChange(queryClient);
    } catch (error) {
      showError(error, 'Failed to delete product');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicateProduct = async (product) => {
    try {
      await productService.duplicateProduct(product.id);
      showSuccess('Product duplicated successfully');
      refreshAfterInventoryChange(queryClient);
    } catch (error) {
      showError(error, 'Failed to duplicate product');
    }
  };

  const handleOpenVariantForm = useCallback((variant = null) => {
    if (variant) {
      // Editing existing variant
      variantForm.reset({
        name: variant.name || '',
        sku: variant.sku || '',
        barcode: variant.barcode || '',
        costPrice: variant.costPrice ?? selectedProduct?.costPrice ?? 0,
        sellingPrice: variant.sellingPrice ?? selectedProduct?.sellingPrice ?? 0,
        quantityOnHand: variant.quantityOnHand ?? 0,
        size: variant.attributes?.size || '',
        color: variant.attributes?.color || '',
        model: variant.attributes?.model || '',
      });
      setEditingVariant(variant);
    } else {
      // Creating new variant
      variantForm.reset({
        sku: '',
        barcode: '',
        costPrice: selectedProduct?.costPrice ?? 0,
        sellingPrice: selectedProduct?.sellingPrice ?? 0,
        quantityOnHand: 0,
        size: '',
        color: '',
        model: '',
      });
      setEditingVariant(null);
    }
    setVariantFormOpen(true);
  }, [selectedProduct, variantForm]);

  const handleCloseVariantForm = useCallback(() => {
    setVariantFormOpen(false);
    setEditingVariant(null);
    variantForm.reset();
  }, [variantForm]);

  const refreshSelectedProduct = useCallback(() => {
    if (!selectedProduct?.id) return;
    productService.getProductById(selectedProduct.id).then((r) => {
      const data = r?.data?.data ?? r?.data ?? r;
      if (data?.id) setSelectedProduct(data);
    });
  }, [selectedProduct?.id]);

  const fetchRentalUnits = useCallback(async (productId) => {
    if (!productId) {
      setRentalUnits([]);
      return;
    }
    setRentalUnitsLoading(true);
    try {
      const response = await productService.getRentalUnits(productId, {
        branchId: activeShopId || undefined,
      });
      const rows = response?.data?.data ?? response?.data ?? [];
      setRentalUnits(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed to load rental units', error);
      setRentalUnits([]);
    } finally {
      setRentalUnitsLoading(false);
    }
  }, [activeShopId]);

  useEffect(() => {
    if (!drawerOpen || !isRental || !selectedProduct?.metadata?.tracksSerialUnits) {
      setRentalUnits([]);
      return;
    }
    fetchRentalUnits(selectedProduct.id);
  }, [drawerOpen, isRental, selectedProduct?.id, selectedProduct?.metadata?.tracksSerialUnits, fetchRentalUnits]);

  const handleAddRentalUnit = useCallback(async () => {
    if (!selectedProduct?.id || !newRentalUnit.serialNumber.trim()) {
      showError('Serial number is required');
      return;
    }
    setRentalUnitSaving(true);
    try {
      await productService.createRentalUnit(selectedProduct.id, {
        serialNumber: newRentalUnit.serialNumber.trim(),
        branchId: activeShopId || undefined,
        status: newRentalUnit.status,
        metadata: {
          plateNumber: newRentalUnit.plateNumber.trim() || undefined,
          color: newRentalUnit.color.trim() || undefined,
        },
      });
      showSuccess('Rental unit added');
      setNewRentalUnit({ serialNumber: '', plateNumber: '', color: '', status: 'available' });
      fetchRentalUnits(selectedProduct.id);
    } catch (error) {
      showError(error, 'Failed to add rental unit');
    } finally {
      setRentalUnitSaving(false);
    }
  }, [activeShopId, fetchRentalUnits, newRentalUnit, selectedProduct?.id]);

  const handleDeleteRentalUnit = useCallback(async (unit) => {
    if (!selectedProduct?.id || !unit?.id) return;
    setRentalUnitSaving(true);
    try {
      await productService.deleteRentalUnit(selectedProduct.id, unit.id);
      showSuccess(unit.status === 'retired' ? 'Unit retired' : 'Unit removed');
      fetchRentalUnits(selectedProduct.id);
    } catch (error) {
      showError(error, 'Failed to remove rental unit');
    } finally {
      setRentalUnitSaving(false);
    }
  }, [fetchRentalUnits, selectedProduct?.id]);

  const handleOpenVariantDetail = useCallback((variant) => {
    setSelectedVariantDetail(variant);
    setVariantDetailOpen(true);
  }, []);

  const handleCloseVariantDetail = useCallback(() => {
    setVariantDetailOpen(false);
    setSelectedVariantDetail(null);
    setVariantDeleteDialogOpen(false);
  }, []);

  const handleEditVariantFromDetail = useCallback(() => {
    if (!selectedVariantDetail) return;
    const variant = selectedVariantDetail;
    handleCloseVariantDetail();
    handleOpenVariantForm(variant);
  }, [handleCloseVariantDetail, handleOpenVariantForm, selectedVariantDetail]);

  const handleDeleteVariantConfirm = async () => {
    if (!selectedVariantDetail?.id) return;
    setSubmitting(true);
    try {
      await productService.deleteProductVariant(selectedVariantDetail.id);
      showSuccess('Variant deleted successfully');
      handleCloseVariantDetail();
      refreshAfterInventoryChange(queryClient);
      refreshSelectedProduct();
    } catch (error) {
      showError(error, 'Failed to delete variant');
    } finally {
      setSubmitting(false);
      setVariantDeleteDialogOpen(false);
    }
  };

  const handleVariantFormSubmit = async (values) => {
    if (!selectedProduct?.id) return;
    setSubmitting(true);
    try {
      // Use model, size, or color for variant display name
      const sizeOption = SIZE_OPTIONS.find(opt => opt.value === values.size);
      const variantName = values.model || (sizeOption ? sizeOption.label : values.size) || values.color || values.name || '';
      
      const payload = {
        name: variantName,
        sku: values.sku || undefined,
        barcode: values.barcode || undefined,
        sellingPrice: values.sellingPrice !== undefined && values.sellingPrice !== '' ? Number(values.sellingPrice) : undefined,
        quantityOnHand: Number(values.quantityOnHand) || 0,
        attributes: {},
      };
      if (canViewProductSensitiveFields) {
        payload.costPrice = values.costPrice !== undefined && values.costPrice !== '' ? Number(values.costPrice) : undefined;
      }
      if (values.size) payload.attributes.size = values.size;
      if (values.color) payload.attributes.color = values.color;
      if (values.model) payload.attributes.model = values.model;

      if (editingVariant) {
        await productService.updateProductVariant(editingVariant.id, payload);
        showSuccess('Variant updated successfully');
      } else {
        await productService.createProductVariant(selectedProduct.id, payload);
        showSuccess('Variant added successfully');
      }

      handleCloseVariantForm();
      refreshAfterInventoryChange(queryClient);
      refreshSelectedProduct();
    } catch (error) {
      showError(error, editingVariant ? 'Failed to update variant' : 'Failed to add variant');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormSubmit = async (values) => {
    setSubmitting(true);
    try {
      // Extract metadata fields
      const metadataFields = [
        'expiryDate', 'batchNumber', 'isPerishable', 'serialNumber',
        'warrantyPeriod', 'specifications', 'dimensions', 'weight',
        'material', 'partNumber', 'compatibility', 'vehicleModels',
        'isbn', 'author', 'publisher', 'assemblyRequired',
        'allergens', 'optionalFoods', 'sizes', 'colors', 'models', 'size', 'ageRange', 'batteryRequired',
      ];
      
      const metadata = {};
      metadataFields.forEach(field => {
        const val = values[field];
        if (val !== undefined && val !== '' && val !== false && val !== 0) {
          if (Array.isArray(val) && val.length === 0) return;
          metadata[field] = val;
        }
      });

      const primaryBarcode = values.barcode?.trim() || '';
      const alternateBarcode = values.alternateBarcode?.trim() || '';

      const payload = {
        name: values.name,
        sku: values.sku || undefined,
        barcode: primaryBarcode || undefined,
        barcodeAliases: alternateBarcode ? [alternateBarcode] : [],
        description: values.description || undefined,
        categoryId: values.categoryId || undefined,
        sellingPrice: values.sellingPrice === '' ? 0 : (Number(values.sellingPrice) ?? 0),
        quantityOnHand: values.quantityOnHand === '' ? 0 : (Number(values.quantityOnHand) ?? 0),
        reorderLevel: values.reorderLevel === '' ? 0 : (Number(values.reorderLevel) ?? 0),
        reorderQuantity: values.reorderQuantity === '' ? 0 : (Number(values.reorderQuantity) ?? 0),
        unit: values.unit,
        brand: values.brand || undefined,
        hasVariants: values.hasVariants,
        isActive: values.isActive,
        trackStock: values.trackStock,
        imageUrl: values.imageUrl || undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
      if (showWholesalePriceField) {
        payload.wholesalePrice = values.wholesalePrice === '' || values.wholesalePrice == null
          ? null
          : Number(values.wholesalePrice);
      }
      if (canViewProductSensitiveFields) {
        payload.costPrice = values.costPrice === '' ? 0 : (Number(values.costPrice) ?? 0);
        payload.supplier = values.supplier || undefined;
      }

      if (isRental) {
        payload.isRentable = values.isRentable !== false;
        payload.isSalable = values.isSalable === true;
        payload.rentalRatePerDay = payload.isRentable
          ? (Number(values.rentalRatePerDay) || 0)
          : null;
        payload.metadata = {
          ...(payload.metadata || {}),
          tracksSerialUnits: values.tracksSerialUnits === true,
        };
      }

      if (!guardOnline(showError)) return;

      if (editingProduct) {
        await productService.updateProduct(editingProduct.id, payload);
        showSuccess('Product updated successfully');
      } else {
        await productService.createProduct(payload);
        showSuccess('Product created successfully');
      }

      setFormOpen(false);
      setEditingProduct(null);
      refreshAfterInventoryChange(queryClient);
    } catch (error) {
      showError(error, editingProduct ? 'Failed to update product' : 'Failed to create product');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProductImageSelect = useCallback(async (eOrFile) => {
    const file = eOrFile?.target?.files?.[0] ?? (eOrFile instanceof File ? eOrFile : null);
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > PRODUCT_IMAGE_MAX_INPUT_BYTES) {
      showError(
        `Image is too large (max ${PRODUCT_IMAGE_MAX_INPUT_BYTES / 1024 / 1024}MB). Try a smaller photo.`
      );
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    form.setValue('imageUrl', objectUrl);
    setProductImageUploading(true);
    setProductImageProgress(0);
    setProductImageStageProgress(0);
    const needsCompress = file.size > PRODUCT_IMAGE_SKIP_COMPRESS_MAX_BYTES;
    setProductImagePhase(needsCompress ? 'compressing' : 'uploading');
    // Let React paint the overlay before compression blocks the main thread (esp. without web worker).
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    try {
      let prepared = file;
      if (needsCompress) {
        prepared = await compressProductImageFile(file, {
          onProgress: (p) => {
            setProductImageStageProgress(p);
            setProductImageProgress(Math.min(35, Math.round((p / 100) * 35)));
          },
        });
      }

      setProductImagePhase('uploading');
      setProductImageStageProgress(0);
      const uploadBase = needsCompress ? 35 : 0;
      const uploadSpan = needsCompress ? 65 : 100;
      setProductImageProgress(uploadBase);

      const res = await productService.uploadProductImage(prepared, {
        onUploadProgress: (p) => {
          setProductImageStageProgress(p);
          setProductImageProgress(uploadBase + Math.round((p / 100) * uploadSpan));
        },
      });
      const imageUrl = res?.data?.imageUrl ?? res?.imageUrl;
      if (imageUrl) {
        URL.revokeObjectURL(objectUrl);
        form.setValue('imageUrl', imageUrl);
        setProductImageProgress(100);
        setProductImageStageProgress(100);
        showSuccess('Image uploaded');
      } else {
        form.setValue('imageUrl', objectUrl);
        showError('Upload succeeded but no image URL returned');
      }
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      form.setValue('imageUrl', '');
      const message = err?.message || (typeof err === 'string' ? err : 'Failed to process image');
      showError(getErrorMessage(err, message));
    } finally {
      setProductImageUploading(false);
      setProductImagePhase(null);
      setProductImageProgress(0);
      setProductImageStageProgress(0);
      if (productImageInputRef.current) productImageInputRef.current.value = '';
    }
  }, [form, getErrorMessage, showError, showSuccess]);

  // Paste a copied photo or screenshot (Ctrl/Cmd+V) anywhere in the open product form.
  useClipboardImagePaste({
    // The publish dialog has its own paste target; don't also grab the image here.
    enabled: formOpen && !storeListingOpen && !productImageUploading,
    onImages: (files) => handleProductImageSelect(files[0]),
  });

  const handleRemoveProductImage = useCallback(() => {
    form.setValue('imageUrl', '');
  }, [form]);

  const handleAdjustStockClick = (product) => {
    setProductToAdjust(product);
    adjustForm.reset({
      adjustmentMode: 'set',
      newQuantity: parseFloat(product.quantityOnHand) || 0,
      quantityDelta: 0,
      reason: '',
    });
    setAdjustStockOpen(true);
  };

  const handleAdjustStockSubmit = async (values) => {
    if (!productToAdjust) return;
    
    setSubmitting(true);
    try {
      const quantity = values.adjustmentMode === 'set' 
        ? values.newQuantity 
        : values.quantityDelta;
      
      await productService.adjustStock(
        productToAdjust.id,
        quantity,
        values.adjustmentMode,
        values.reason
      );
      
      showSuccess('Stock adjusted successfully');
      setAdjustStockOpen(false);
      setProductToAdjust(null);
      refreshAfterInventoryChange(queryClient);
      
      // Refresh drawer if open
      if (selectedProduct?.id === productToAdjust.id) {
        const response = await productService.getProductById(productToAdjust.id);
        setSelectedProduct(response.data || response);
      }
    } catch (error) {
      showError(error, 'Failed to adjust stock');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWhatsAppShare = (product) => {
    const stockLine = product.trackStock === false
      ? `📦 Stock: Made to order\n`
      : `📦 Stock: ${product.quantityOnHand} ${product.unit}\n`;
    const priceLine = isRental && product.isRentable !== false && product.rentalRatePerDay != null
      ? `💰 Rate: ${valueFormatter(product.rentalRatePerDay)}/day\n`
      : `💰 Price: ${valueFormatter(product.sellingPrice)}\n`;
    const message = encodeURIComponent(
      `🏷️ *${product.name}*\n\n` +
      priceLine +
      stockLine +
      (product.sku ? `🔖 SKU: ${product.sku}\n` : '') +
      (product.description ? `\n${product.description}\n` : '') +
      `\n_Sent from ${getWorkspaceDisplayName(activeTenant?.name, null, 'Our Store')}_`
    );
    
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  // =============================================
  // TABLE COLUMNS
  // =============================================

  const tableColumns = useMemo(() => [
    {
      key: 'name',
      title: 'Product',
      width: '22rem',
      cellClassName: 'min-w-0 max-w-[22rem] overflow-hidden',
      render: (_, record) => (
        <div className="flex min-w-0 max-w-full items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded border border-border bg-muted overflow-hidden flex items-center justify-center">
            {record.imageUrl ? (
              <button
                type="button"
                onClick={() => setImagePreviewUrl(resolveProductImageUrl(record.imageUrl))}
                className="w-full h-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
              >
                <img
                  src={resolveProductImageUrl(record.imageUrl)}
                  alt={record.name || 'Product'}
                  className="w-full h-full object-cover"
                />
              </button>
            ) : (
              <Package className="h-5 w-5 text-gray-400" />
            )}
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <span className="block max-w-full font-medium truncate" title={record.name || ''}>
              {record.name}
            </span>
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              {record.sku && (
                <span className="block max-w-full truncate" title={record.sku ? `SKU: ${record.sku}` : ''}>
                  SKU: {record.sku}
                </span>
              )}
              {isRental && (
                <span className="flex shrink-0 items-center gap-1">
                  {record.isRentable !== false && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary">
                      Rentable
                    </Badge>
                  )}
                  {record.isSalable && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                      Salable
                    </Badge>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'productCode',
      title: 'Product Code',
      render: (_, record) => getProductCodeForTable(record) || '-',
      hidden: isMobile,
    },
    {
      key: 'quantityOnHand',
      title: 'Stock',
      render: (_, record) => {
        if (record.trackStock === false) {
          return <Badge variant="outline" className="text-muted-foreground">Made to order</Badge>;
        }
        const stockQty = getProductStockQuantity(record);
        const statusKey = getStockStatus(stockQty, record.reorderLevel);
        return (
          <div className="flex items-center gap-2">
            <span>{formatInteger(stockQty)} {record.unit}</span>
            <StatusChip status={statusKey} size="small" />
          </div>
        );
      },
    },
    {
      key: 'costPrice',
      title: 'Cost',
      render: (value) => valueFormatter(value),
      hidden: isMobile || !canViewProductSensitiveFields,
    },
    ...(isRental
      ? [{
          key: 'rentalRatePerDay',
          title: 'Rate/day',
          render: (value, record) => {
            if (record.isRentable === false) return '-';
            return value != null && value !== '' ? valueFormatter(value) : '-';
          },
        }]
      : [{
          key: 'sellingPrice',
          title: 'Price',
          render: (value) => valueFormatter(value),
        }]),
    {
      key: 'margin',
      title: 'Margin',
      render: (_, record) => {
        const margin = calculateMargin(record.costPrice, record.sellingPrice);
        const color = getMarginColor(margin);
        return (
          <Badge variant="outline" className={color}>
            {margin.toFixed(1)}%
          </Badge>
        );
      },
      hidden: isMobile || !canViewProductSensitiveFields,
    },
    {
      key: 'isActive',
      title: 'Status',
      render: (value) => (
        <StatusChip status={value ? 'active_flag' : 'inactive_flag'} size="small" />
      ),
      hidden: isMobile,
    },
    {
      key: 'actions',
      title: '',
      render: (_, record) => (
        <ActionColumn
          onView={() => handleViewProduct(record)}
          record={record}
        />
      ),
    },
  ], [
    isMobile,
    isRental,
    canViewProductSensitiveFields,
    handleViewProduct,
  ]);

  const handleRefresh = () => {
    fetchProducts();
    fetchCategories();
    fetchStats();
  };

  const handlePageChange = (newPagination) => {
    setPagination(prev => ({ ...prev, ...newPagination }));
  };

  const handleClearProductFilters = useCallback(() => {
    setSearchValue('');
    setCategoryFilter('all');
    setStockFilter('all');
    setSortBy('name_asc');
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [setSearchValue]);

  const hasActiveProductFilters = useMemo(
    () =>
      !!debouncedSearch ||
      categoryFilter !== 'all' ||
      stockFilter !== 'all' ||
      sortBy !== 'name_asc',
    [debouncedSearch, categoryFilter, stockFilter, sortBy]
  );

  const productsEmptyState = useMemo(() => {
    if (hasActiveProductFilters) {
      return getEmptyStateProps(EMPTY_STATES.PRODUCTS_FILTERED, {
        primary: handleClearProductFilters,
      });
    }
    if (isRental) {
      return getEmptyStateProps(EMPTY_STATES.RENTAL_PRODUCTS, {
        primary: handleCreateProduct,
        secondary: () => setImportModalOpen(true),
      });
    }
    return getEmptyStateProps(EMPTY_STATES.PRODUCTS, {
      primary: handleCreateProduct,
      secondary: () => setImportModalOpen(true),
    });
  }, [hasActiveProductFilters, handleClearProductFilters, handleCreateProduct, isRental]);

  // =============================================
  // RENDER HELPERS
  // =============================================

  const renderShopTypeFields = () => {
    const fields = [];
    const trackStock = form.watch('trackStock') !== false;

    // Supermarket/Convenience fields (hide expiry/batch/perishable when track stock is off - made to order)
    if (shopTypeFields.includes('expiryDate') && trackStock) {
      fields.push(
        <FormField
          key="expiryDate"
          control={form.control}
          name="expiryDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.expiryDate}</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }
    
    if (shopTypeFields.includes('batchNumber') && trackStock) {
      fields.push(
        <FormField
          key="batchNumber"
          control={form.control}
          name="batchNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.batchNumber}</FormLabel>
              <FormControl>
                <Input placeholder="Enter batch number" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }
    
    if (shopTypeFields.includes('isPerishable') && trackStock) {
      fields.push(
        <FormField
          key="isPerishable"
          control={form.control}
          name="isPerishable"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabelWithInfo label={PRODUCT_FIELD_LABELS.isPerishable} hint="Mark if product can expire" />
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      );
    }

    // Electronics fields
    if (shopTypeFields.includes('serialNumber')) {
      fields.push(
        <FormField
          key="serialNumber"
          control={form.control}
          name="serialNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.serialNumber}</FormLabel>
              <FormControl>
                <Input placeholder="Enter serial number" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }
    
    if (shopTypeFields.includes('warrantyPeriod')) {
      fields.push(
        <FormField
          key="warrantyPeriod"
          control={form.control}
          name="warrantyPeriod"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.warrantyPeriod}</FormLabel>
              <Select
                value={field.value?.toString() || '0'}
                onValueChange={(value) => field.onChange(parseInt(value))}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select warranty" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {WARRANTY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }
    
    if (shopTypeFields.includes('specifications')) {
      fields.push(
        <FormField
          key="specifications"
          control={form.control}
          name="specifications"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.specifications}</FormLabel>
              <FormControl>
                <Textarea placeholder="Enter product specifications" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    // Hardware/Furniture fields
    if (shopTypeFields.includes('dimensions')) {
      fields.push(
        <FormField
          key="dimensions"
          control={form.control}
          name="dimensions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.dimensions}</FormLabel>
              <FormControl>
                <Input placeholder="e.g., 100cm x 50cm x 30cm" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }
    
    if (shopTypeFields.includes('weight')) {
      fields.push(
        <FormField
          key="weight"
          control={form.control}
          name="weight"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.weight}</FormLabel>
              <FormControl>
                <Input placeholder="e.g., 5kg" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }
    
    if (shopTypeFields.includes('material')) {
      fields.push(
        <FormField
          key="material"
          control={form.control}
          name="material"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.material}</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Wood, Metal, Plastic" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }
    
    if (shopTypeFields.includes('assemblyRequired')) {
      fields.push(
        <FormField
          key="assemblyRequired"
          control={form.control}
          name="assemblyRequired"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabelWithInfo label={PRODUCT_FIELD_LABELS.assemblyRequired} hint="Product requires assembly" />
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      );
    }

    // Auto parts fields
    if (shopTypeFields.includes('partNumber')) {
      fields.push(
        <FormField
          key="partNumber"
          control={form.control}
          name="partNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.partNumber}</FormLabel>
              <FormControl>
                <Input placeholder="Enter part number" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }
    
    if (shopTypeFields.includes('compatibility')) {
      fields.push(
        <FormField
          key="compatibility"
          control={form.control}
          name="compatibility"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.compatibility}</FormLabel>
              <FormControl>
                <Input placeholder="Compatible models/brands" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }
    
    if (shopTypeFields.includes('vehicleModels')) {
      fields.push(
        <FormField
          key="vehicleModels"
          control={form.control}
          name="vehicleModels"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.vehicleModels}</FormLabel>
              <FormControl>
                <Textarea placeholder="e.g., Toyota Corolla 2015-2020, Honda Civic 2016+" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    // Bookstore fields
    if (shopTypeFields.includes('isbn')) {
      fields.push(
        <FormField
          key="isbn"
          control={form.control}
          name="isbn"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.isbn}</FormLabel>
              <FormControl>
                <Input placeholder="Enter ISBN or code" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }
    
    if (shopTypeFields.includes('author')) {
      fields.push(
        <FormField
          key="author"
          control={form.control}
          name="author"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.author}</FormLabel>
              <FormControl>
                <Input placeholder="Enter author name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }
    
    if (shopTypeFields.includes('publisher')) {
      fields.push(
        <FormField
          key="publisher"
          control={form.control}
          name="publisher"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.publisher}</FormLabel>
              <FormControl>
                <Input placeholder="Enter publisher name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    // Restaurant: allergens
    if (shopTypeFields.includes('allergens')) {
      fields.push(
        <FormField
          key="allergens"
          control={form.control}
          name="allergens"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.allergens}</FormLabel>
              <FormControl>
                <div className="grid w-full grid-cols-3 gap-x-4 gap-y-3">
                  {ALLERGENS_OPTIONS.map((opt) => {
                    const selected = (field.value || '').split(',').map((s) => s.trim()).filter(Boolean);
                    const checked = selected.includes(opt.value);
                    return (
                      <div key={opt.value} className="flex w-full items-center space-x-2">
                        <Checkbox
                          id={`allergen-${opt.value}`}
                          checked={checked}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...selected, opt.value]
                              : selected.filter((v) => v !== opt.value);
                            field.onChange(next.join(', '));
                          }}
                        />
                        <label
                          htmlFor={`allergen-${opt.value}`}
                          className="text-sm font-medium leading-none cursor-pointer"
                        >
                          {opt.label}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    // Restaurant: optional foods / add-ons
    if (shopTypeFields.includes('optionalFoods')) {
      fields.push(
        <FormField
          key="optionalFoods"
          control={form.control}
          name="optionalFoods"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.optionalFoods}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g. Extra cheese, Bacon, Avocado"
                  className="min-h-[80px] resize-y"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    // Clothing/Beauty: hasVariants, sizes, colors – hasVariants on its own full row
    if (shopTypeFields.includes('hasVariants')) {
      fields.push(
        <div key="hasVariants-wrapper" className="md:col-span-2">
          <FormField
            control={form.control}
            name="hasVariants"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabelWithInfo label={PRODUCT_FIELD_LABELS.hasVariants} hint="Product has size, color, or model variants" />
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      );
    }

    if (shopTypeFields.includes('sizes') && form.watch('hasVariants')) {
      fields.push(
        <FormField
          key="sizes"
          control={form.control}
          name="sizes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.sizes}</FormLabel>
              <FormControl>
                <div className="flex flex-wrap gap-3">
                  {SIZE_OPTIONS.map((opt) => {
                    const selected = (field.value || '').split(',').map((s) => s.trim()).filter(Boolean);
                    const checked = selected.includes(opt.value);
                    return (
                      <div key={opt.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`size-${opt.value}`}
                          checked={checked}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...selected, opt.value]
                              : selected.filter((v) => v !== opt.value);
                            field.onChange(next.join(', '));
                          }}
                        />
                        <label
                          htmlFor={`size-${opt.value}`}
                          className="text-sm font-medium leading-none cursor-pointer"
                        >
                          {opt.label}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    if (shopTypeFields.includes('colors') && form.watch('hasVariants')) {
      fields.push(
        <FormField
          key="colors"
          control={form.control}
          name="colors"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.colors}</FormLabel>
              <FormControl>
                <div className="flex flex-wrap gap-3">
                  {COLOR_OPTIONS.map((opt) => {
                    const selected = (field.value || '').split(',').map((s) => s.trim()).filter(Boolean);
                    const checked = selected.includes(opt.value);
                    return (
                      <div key={opt.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`color-${opt.value}`}
                          checked={checked}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...selected, opt.value]
                              : selected.filter((v) => v !== opt.value);
                            field.onChange(next.join(', '));
                          }}
                        />
                        <label
                          htmlFor={`color-${opt.value}`}
                          className="text-sm font-medium leading-none cursor-pointer"
                        >
                          {opt.label}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    // Model variance (e.g. pump model, electronics SKU) – comma-separated list when hasVariants
    if (shopTypeFields.includes('models') && form.watch('hasVariants')) {
      fields.push(
        <FormField
          key="models"
          control={form.control}
          name="models"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.models}</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. MHM32-200/40, MHM32-250/55, MHM65-250 (comma-separated)"
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    // Sports/Restaurant: size - only when hasVariants is true (or when shop type has no hasVariants e.g. Sports)
    if (shopTypeFields.includes('size') && (!shopTypeFields.includes('hasVariants') || form.watch('hasVariants'))) {
      fields.push(
        <FormField
          key="size"
          control={form.control}
          name="size"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.size}</FormLabel>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SIZE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    // Toys: ageRange, batteryRequired
    if (shopTypeFields.includes('ageRange')) {
      fields.push(
        <FormField
          key="ageRange"
          control={form.control}
          name="ageRange"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRODUCT_FIELD_LABELS.ageRange}</FormLabel>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select age range" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {AGE_RANGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    if (shopTypeFields.includes('batteryRequired')) {
      fields.push(
        <FormField
          key="batteryRequired"
          control={form.control}
          name="batteryRequired"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabelWithInfo label={PRODUCT_FIELD_LABELS.batteryRequired} hint="Product requires batteries" />
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      );
    }

    if (fields.length === 0) return null;

    return (
      <div className="space-y-4">
        <Separator />
        <h4 className="font-medium text-sm text-muted-foreground">
          Additional Information
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields}
        </div>
      </div>
    );
  };

  // =============================================
  // RENDER
  // =============================================

  if (!isShop) {
    return (
      <div className="space-y-4 md:space-y-6">
        <WelcomeSection
          welcomeMessage="Products"
          subText="Manage your product catalog."
        />
        <FeatureNotAvailable
          icon="Package"
          title={FEATURE_NOT_AVAILABLE.SHOP_ONLY.title}
          description={FEATURE_NOT_AVAILABLE.SHOP_ONLY.description}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {!isOnline && (
        <Alert variant="warning" className="mb-4">
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            You are offline. Reconnect to edit products, or use the mobile app for offline work.
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <WelcomeSection
          title="Products"
          subtitle={
            shopContext?.isShopWorkspace && activeShopName
              ? `Catalog for ${activeShopName} — each shop has its own products`
              : 'Manage your product catalog'
          }
          icon={<Package className="h-6 w-6" />}
        />
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0 sm:justify-end sm:ml-auto">
          <ViewToggle value={tableViewMode} onChange={setTableViewMode} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size={isMobile ? 'icon' : 'default'}
                onClick={() => setFilterDrawerOpen(true)}
              >
                <Filter className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Filter</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filter products by category, stock level, or sort</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size={isMobile ? 'icon' : 'default'}
                onClick={handleRefresh}
                disabled={productsFetching}
              >
                {productsFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh products list</TooltipContent>
          </Tooltip>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <MoreVertical className="mr-2 h-4 w-4" />
                  Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem disabled={!scopeReady || !isOnline} onSelect={() => setBulkLabelsOpen(true)}>
                  <Package className="mr-2 h-4 w-4" />
                  Generate labels
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { setImportModalOpen(true); setImportResult(null); setImportFile(null); }}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import products
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => handleOpenReceiveStock()}>
                  <Download className="mr-2 h-4 w-4" />
                  Receive stock
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleOpenStockTransfer()}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Transfer stock
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleCreateProduct} className="min-w-0">
                <Plus className="h-4 w-4" />
                <span className="ml-2">Add Product</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add a new product to your catalog</TooltipContent>
          </Tooltip>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className={cn('grid grid-cols-2 gap-2 md:gap-4', canViewProductSensitiveFields ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3 lg:grid-cols-3')}>
        <DashboardStatsCard
          tooltip="Total number of products in your catalog"
          title="Total Products"
          value={statsLoading ? '...' : stats.total}
          icon={Package}
          iconBgColor="#e0f2fe"
          iconColor="#0284c7"
        />
        <DashboardStatsCard
          tooltip="Products below reorder level – time to restock"
          title="Low Stock"
          value={statsLoading ? '...' : stats.lowStock}
          icon={AlertTriangle}
          iconBgColor={stats.lowStock > 0 ? '#fef3c7' : '#e0f2fe'}
          iconColor={stats.lowStock > 0 ? '#d97706' : '#0284c7'}
        />
        <DashboardStatsCard
          tooltip="Products with zero stock – cannot sell until restocked"
          title="Out of Stock"
          value={statsLoading ? '...' : stats.outOfStock}
          icon={Package}
          iconBgColor={stats.outOfStock > 0 ? '#fee2e2' : '#e0f2fe'}
          iconColor={stats.outOfStock > 0 ? '#dc2626' : '#0284c7'}
        />
        {canViewProductSensitiveFields && (
          <DashboardStatsCard
            tooltip="Total value of all products at cost price"
            title="Total Value"
            value={statsLoading ? '...' : valueFormatter(stats.totalValue)}
            icon={Currency}
            iconBgColor="#dcfce7"
            iconColor="#166534"
          />
        )}
      </div>

      {/* Products list — DashboardTable handles loading + empty state (table on desktop, cards on mobile) */}
      <DashboardTable
        data={products}
        columns={tableColumns}
        loading={loading}
        title={null}
        emptyState={productsEmptyState}
        pageSize={pagination.pageSize}
        externalPagination={{ current: pagination.current, total: pagination.total }}
        onPageChange={handlePageChange}
        viewMode={tableViewMode}
        onViewModeChange={setTableViewMode}
      />

      {/* Filter Drawer */}
      <ResponsiveSheet
        open={filterDrawerOpen}
        onOpenChange={setFilterDrawerOpen}
        title="Filter Products"
        contentClassName="space-y-4 md:space-y-6 mt-4 md:mt-6"
      >
        <div className="space-y-4 md:space-y-6 mt-0">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              onOpenChange={(open) => { if (!open) setCategoryFilterSearchTerm(''); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <div className="p-2 border-b border-border sticky top-0 bg-popover z-10" onPointerDown={(e) => e.stopPropagation()}>
                  <Input
                    placeholder="Search categories..."
                    value={categoryFilterSearchTerm}
                    onChange={(e) => setCategoryFilterSearchTerm(e.target.value)}
                    className="h-8"
                  />
                </div>
                <SelectItem value="all">All categories</SelectItem>
                {(() => {
                  const term = (categoryFilterSearchTerm || '').trim().toLowerCase();
                  const filtered = term
                    ? categories.filter((cat) => (cat.name || '').toLowerCase().includes(term))
                    : categories;
                  return filtered.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </SelectItem>
                  ));
                })()}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Stock Status</Label>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All stock levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock levels</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sort by</Label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger>
                <SelectValue placeholder="Name A–Z" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Name A–Z</SelectItem>
                <SelectItem value="created_desc">Newest added</SelectItem>
                <SelectItem value="updated_desc">Recently updated</SelectItem>
                <SelectItem value="stock_desc">Stock high–low</SelectItem>
                <SelectItem value="stock_asc">Stock low–high</SelectItem>
                <SelectItem value="price_asc">{isRental ? 'Rate low–high' : 'Price low–high'}</SelectItem>
                <SelectItem value="price_desc">{isRental ? 'Rate high–low' : 'Price high–low'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveProductFilters && (
            <Button variant="outline" onClick={handleClearProductFilters} className="w-full">
              Clear Filters
            </Button>
          )}
        </div>
      </ResponsiveSheet>

      <PublishToOnlineStoreDialog
        open={storeListingOpen}
        onOpenChange={(open) => {
          setStoreListingOpen(open);
          if (!open) setStoreListingProduct(null);
        }}
        product={storeListingProduct}
        homeSections={storeHomeSections}
      />

      {/* Product Form Dialog */}
      <MobileFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editingProduct ? 'Edit Product' : 'Add New Product'}
        description={editingProduct ? 'Update product details below' : 'Fill in the product details to add it to your catalog'}
        footer={
          <>
            {!isMobile && (
              <Button
                type="button"
                variant="outline"
                onClick={handleOpenQRGenerateFromForm}
                title="Generate QR code for this product"
              >
                <QrCode className="h-4 w-4 mr-2" />
                Generate QR & Barcode
              </Button>
            )}
            <Button type="submit" form="product-form" loading={submitting}>
              {editingProduct ? 'Update Product' : 'Create Product'}
            </Button>
          </>
        }
      >
          <TooltipProvider delayDuration={200}>
          <Form {...form}>
            <form id="product-form" onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground">Basic Information</h4>
                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field: { value } }) => (
                    <FormItem>
                      <FormLabel>Product image (optional)</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <input
                            ref={productImageInputRef}
                            type="file"
                            accept="image/png,image/jpg,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => handleProductImageSelect(e)}
                          />
                          <div
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && !productImageUploading && productImageInputRef.current?.click()}
                            onClick={() => !productImageUploading && productImageInputRef.current?.click()}
                            onDrop={(e) => {
                              e.preventDefault();
                              setProductImageDragging(false);
                              if (!productImageUploading && e.dataTransfer.files?.[0]) {
                                handleProductImageSelect(e.dataTransfer.files[0]);
                              }
                            }}
                            onDragOver={(e) => { e.preventDefault(); !productImageUploading && setProductImageDragging(true); }}
                            onDragLeave={(e) => { e.preventDefault(); setProductImageDragging(false); }}
                            className={cn(
                              'flex flex-col items-center justify-center w-full min-h-[120px] py-8 px-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
                              productImageDragging ? 'border-brand bg-brand-5' : 'border-border bg-card',
                              productImageUploading && 'opacity-70 cursor-not-allowed'
                            )}
                          >
                            {value ? (
                              <div className="relative w-full max-w-[200px] aspect-square mx-auto">
                                <img
                                  src={resolveProductImageUrl(value) || ''}
                                  alt="Product"
                                  className="w-full h-full object-cover rounded-lg"
                                />
                                {productImageUploading && (
                                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/95 border border-border p-3">
                                    <Loader2 className="h-8 w-8 animate-spin text-brand shrink-0" />
                                    <div
                                      className="text-xs text-center font-medium text-foreground"
                                      role="status"
                                      aria-live="polite"
                                    >
                                      {formatProductImageProgressLabel(productImagePhase, productImageStageProgress)}
                                    </div>
                                    <Progress value={productImageProgress} className="h-2.5 w-full max-w-[200px] bg-muted" />
                                  </div>
                                )}
                                {!productImageUploading && (
                                  <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); productImageInputRef.current?.click(); }}
                                    >
                                      Change
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); handleRemoveProductImage(); }}
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ) : productImageUploading ? (
                              <div className="flex w-full max-w-xs mx-auto flex-col items-center gap-3 py-2">
                                <Loader2 className="h-10 w-10 animate-spin text-brand shrink-0" />
                                <p className="text-sm font-medium text-foreground text-center">
                                  {formatProductImageProgressLabel(productImagePhase, productImageStageProgress)}
                                </p>
                                <Progress value={productImageProgress} className="h-2.5 w-full bg-muted" />
                              </div>
                            ) : (
                              <>
                                <UploadCloud className="h-10 w-10 mb-3 text-brand" />
                                <div className="text-center">
                                  <p className="text-sm">
                                    <span className="font-medium text-brand">Click to upload</span>
                                    <span className="text-muted-foreground">, drag and drop, or paste</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP, JPEG · Ctrl/Cmd+V to paste</p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Name *</FormLabel>
                        <FormControl>
                          <Input placeholder={placeholders.productName} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category (optional)</FormLabel>
                        <div className="flex gap-2">
                          <Select
                            value={field.value || undefined}
                            onValueChange={(v) => field.onChange(v && !String(v).startsWith('_cat_') ? v : '')}
                            onOpenChange={(open) => { if (!open) setCategorySearchTerm(''); }}
                          >
                            <FormControl>
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categories.length > 0 && (
                                <div className="p-2 border-b border-border sticky top-0 bg-popover z-10" onPointerDown={(e) => e.stopPropagation()}>
                                  <Input
                                    placeholder="Search categories..."
                                    value={categorySearchTerm}
                                    onChange={(e) => setCategorySearchTerm(e.target.value)}
                                    className="h-8"
                                  />
                                </div>
                              )}
                              {categories.length === 0 ? (
                                <div className="py-4 px-3 text-center text-sm text-muted-foreground">
                                  No categories yet. Use + to add one.
                                </div>
                              ) : (
                                (() => {
                                  const term = (categorySearchTerm || '').trim().toLowerCase();
                                  const filtered = term
                                    ? categories.filter((cat) => (cat.name || '').toLowerCase().includes(term))
                                    : categories;
                                  if (filtered.length === 0) {
                                    return (
                                      <div className="py-4 px-3 text-center text-sm text-muted-foreground">
                                        No categories match &quot;{categorySearchTerm}&quot;
                                      </div>
                                    );
                                  }
                                  return filtered.map((cat) => {
                                    const idStr = cat.id != null && String(cat.id) !== '' ? String(cat.id) : `_cat_${cat.id ?? 'blank'}`;
                                    return (
                                      <SelectItem key={cat.id ?? idStr} value={idStr}>
                                        {cat.name}
                                      </SelectItem>
                                    );
                                  });
                                })()
                              )}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setCategoryModalOpen(true)}
                            title="Create new category"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Pricing */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground">Pricing</h4>
                {isRental && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="isRentable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Rentable</FormLabel>
                            <p className="text-xs text-muted-foreground">Available for rental bookings</p>
                          </div>
                          <FormControl>
                            <Switch checked={field.value !== false} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="isSalable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Salable</FormLabel>
                            <p className="text-xs text-muted-foreground">Can be sold outright (POS)</p>
                          </div>
                          <FormControl>
                            <Switch checked={field.value === true} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="tracksSerialUnits"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 md:col-span-2">
                          <div className="space-y-0.5">
                            <FormLabel>Track serial units</FormLabel>
                            <p className="text-xs text-muted-foreground">
                              Assign VIN/serial numbers per car, camera, or generator at checkout
                            </p>
                          </div>
                          <FormControl>
                            <Switch checked={field.value === true} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                )}
                <div className={cn(
                  'grid grid-cols-1 gap-4',
                  canViewProductSensitiveFields && showWholesalePriceField
                    ? 'md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(11rem,1.35fr)_auto]'
                    : canViewProductSensitiveFields || showWholesalePriceField
                      ? 'md:grid-cols-3'
                      : 'md:grid-cols-2'
                )}>
                  {canViewProductSensitiveFields && (
                    <FormField
                      control={form.control}
                      name="costPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Cost Price {shopType === SHOP_TYPES.RESTAURANT || isRental ? '(optional)' : '*'}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              {...field}
                              value={numberInputValue(field.value)}
                              onChange={(e) => handleNumberChange(e, field.onChange)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {isRental && watchIsRentable !== false && (
                    <FormField
                      control={form.control}
                      name="rentalRatePerDay"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rate per day *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              {...field}
                              value={numberInputValue(field.value)}
                              onChange={(e) => handleNumberChange(e, field.onChange)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {(!isRental || watchIsSalable) && (
                    <FormField
                      control={form.control}
                      name="sellingPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {isRental ? 'Selling price' : 'Selling Price'}
                            {isRental ? (watchIsSalable ? ' *' : ' (optional)') : ' *'}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              {...field}
                              value={numberInputValue(field.value)}
                              onChange={(e) => handleNumberChange(e, field.onChange)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {showWholesalePriceField && (
                    <FormField
                      control={form.control}
                      name="wholesalePrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="whitespace-nowrap">Wholesale Price (optional)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              {...field}
                              value={numberInputValue(field.value ?? '')}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  field.onChange(null);
                                  return;
                                }
                                handleNumberChange(e, field.onChange);
                              }}
                              placeholder="Uses selling price if empty"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {canViewProductSensitiveFields && (
                    <div className="lg:justify-self-end lg:w-fit">
                      <Label className="mb-2 block whitespace-nowrap">Profit Margin</Label>
                      <div className="h-10 flex items-center">
                        <Badge variant="outline" className={getMarginColor(calculatedMargin)}>
                          {calculatedMargin.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Stock */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground">Stock Management</h4>
                <FormField
                  control={form.control}
                  name="trackStock"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabelWithInfo label="Track stock" hint="Turn off for made-to-order items (pizza, custom meals)" />
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                {form.watch('trackStock') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter SKU" className="h-10 min-h-[44px] md:min-h-[40px]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="barcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabelWithInfo label="Barcode (optional)" hint="Scan barcode at POS. No barcode? Use Generate QR to print and attach." />
                        <FormControl>
                          <Input placeholder="Scan or enter barcode" className="h-10 min-h-[44px] md:min-h-[40px]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="alternateBarcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Code (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Scan or enter product code" className="h-10 min-h-[44px] md:min-h-[40px]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="brand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter brand name" className="h-10 min-h-[44px] md:min-h-[40px]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="quantityOnHand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity on Hand *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            {...field}
                            value={numberInputValue(field.value)}
                            onChange={(e) => handleNumberChange(e, field.onChange)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit *</FormLabel>
                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="h-10 min-h-[44px] md:min-h-[40px]">
                              <SelectValue placeholder="Select unit" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {unitOptions.map((unit) => (
                              <SelectItem key={unit.value} value={unit.value}>
                                {unit.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reorderLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabelWithInfo label="Reorder Level" hint="Alert when stock falls below this" />
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="h-10 min-h-[44px] md:min-h-[40px]"
                            {...field}
                            value={numberInputValue(field.value)}
                            onChange={(e) => handleNumberChange(e, field.onChange)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reorderQuantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabelWithInfo label="Reorder Quantity" hint="Suggested quantity to reorder" />
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="h-10 min-h-[44px] md:min-h-[40px]"
                            {...field}
                            value={numberInputValue(field.value)}
                            onChange={(e) => handleNumberChange(e, field.onChange)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {canViewProductSensitiveFields && (
                    <FormField
                        control={form.control}
                        name="supplier"
                        render={({ field }) => {
                          const supplierValue = field.value || '';
                          const vendorNames = vendors.map((v) => v.name || v.company).filter(Boolean);
                          const hasCustomSupplier = supplierValue && !vendorNames.includes(supplierValue);
                          const selectValue = supplierValue === '' ? '_none_' : supplierValue;
                          return (
                            <FormItem>
                              <FormLabel>Supplier/Vendor (optional)</FormLabel>
                              <Select
                                value={selectValue}
                                onValueChange={(v) => field.onChange(v === '_none_' ? '' : v)}
                                open={vendorSelectOpen}
                                onOpenChange={setVendorSelectOpen}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-10 min-h-[44px] md:min-h-[40px]">
                                    <SelectValue placeholder="Select supplier/vendor" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="_none_">None</SelectItem>
                                  {hasCustomSupplier && (
                                    <SelectItem value={supplierValue}>{supplierValue}</SelectItem>
                                  )}
                                  {vendors.map((vendor) => {
                                    const name = (vendor.name || vendor.company || 'Unnamed').trim() || '_unnamed';
                                    return (
                                      <SelectItem key={vendor.id} value={name}>
                                        {vendor.name || vendor.company || 'Unnamed'}
                                      </SelectItem>
                                    );
                                  })}
                                  <SelectSeparator className="my-2" />
                                  <div
                                    className="px-2 py-1.5"
                                    onPointerDown={(e) => e.preventDefault()}
                                  >
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="w-full justify-start"
                                      onClick={handleAddNewVendor}
                                    >
                                      <Plus className="h-4 w-4 mr-2" />
                                      Add Vendor
                                    </Button>
                                  </div>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                  )}
                </div>
                )}
              </div>

              {/* Shop Type Specific Fields */}
              {renderShopTypeFields()}

              <Separator />

              {/* Additional Info */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={placeholders.description}
                          className="min-h-[80px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabelWithInfo label="Active" hint="Product is available for sale" />
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>
          </TooltipProvider>
      </MobileFormDialog>

      {/* Add Vendor Modal (from product form) */}
      <MobileFormDialog
        open={vendorAddModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setVendorAddModalOpen(false);
            vendorForm.reset({ name: '', company: '', category: '', phone: '' });
          }
        }}
        title="Add Vendor"
        description="Create a new vendor without closing the product form."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setVendorAddModalOpen(false);
                vendorForm.reset({ name: '', company: '', category: '', phone: '' });
              }}
            >
              Cancel
            </Button>
            <Button form="quick-vendor-form" type="submit" loading={addingVendor}>
              Add Vendor
            </Button>
          </>
        }
      >
            <Form {...vendorForm}>
              <form
                id="quick-vendor-form"
                onSubmit={vendorForm.handleSubmit(handleAddVendorSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={vendorForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter vendor name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={vendorForm.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter company name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={vendorForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {vendorCategories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={vendorForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (optional)</FormLabel>
                      <FormControl>
                        <PhoneNumberInput {...field} placeholder="Enter phone number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
      </MobileFormDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{productToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              loading={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReceiveStockModal
        open={receiveStockOpen}
        initialProduct={productToReceive}
        onClose={() => {
          setReceiveStockOpen(false);
          setProductToReceive(null);
        }}
        onSuccess={() => {
          refreshAfterInventoryChange(queryClient);
          if (selectedProduct) {
            productService.getProductById(selectedProduct.id).then((r) => {
              const p = r?.data ?? r;
              if (p?.id) setSelectedProduct(p);
            });
          }
        }}
      />

      <StockTransferModal
        open={stockTransferOpen}
        initialProduct={productToTransfer}
        sourceShopId={activeShopId}
        availableShops={shopContext?.shops || []}
        activeShopId={activeShopId}
        onClose={() => {
          setStockTransferOpen(false);
          setProductToTransfer(null);
        }}
        onSuccess={() => {
          refreshAfterInventoryChange(queryClient);
          if (selectedProduct) {
            productService.getProductById(selectedProduct.id).then((r) => {
              const p = r?.data ?? r;
              if (p?.id) setSelectedProduct(p);
            });
          }
        }}
      />

      <Suspense fallback={<p role="status">Loading label tools…</p>}>
      {bulkLabelsOpen && <BulkProductLabels key={`${activeTenantId}:${activeShopId}`} shopId={activeShopId} profileKey={`abs-label-printer:${activeTenantId}:${activeShopId}`} onClose={() => setBulkLabelsOpen(false)} onSaved={refetchProducts} />}
      {qrGenerateOpen && <ProductQRGenerateModal
        open={qrGenerateOpen}
        onClose={() => {
          setQrGenerateOpen(false);
          setProductForQR(null);
        }}
        product={productForQR}
      />}
      </Suspense>

      {/* Stock Adjustment Dialog */}
      <MobileFormDialog
        open={adjustStockOpen}
        onOpenChange={setAdjustStockOpen}
        title="Adjust Stock"
        description={`Adjust stock for "${productToAdjust?.name}". Current stock: ${productToAdjust?.quantityOnHand} ${productToAdjust?.unit}`}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setAdjustStockOpen(false)}>
              Cancel
            </Button>
            <Button form="adjust-stock-form" type="submit" loading={submitting}>
              Adjust Stock
            </Button>
          </>
        }
      >
          <TooltipProvider delayDuration={200}>
          <Form {...adjustForm}>
            <form id="adjust-stock-form" onSubmit={adjustForm.handleSubmit(handleAdjustStockSubmit)} className="space-y-4">
              <FormField
                control={adjustForm.control}
                name="adjustmentMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adjustment Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="set">Set exact quantity</SelectItem>
                        <SelectItem value="delta">Add/Subtract quantity</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {adjustForm.watch('adjustmentMode') === 'set' ? (
                <FormField
                  control={adjustForm.control}
                  name="newQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Quantity</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          {...field}
                          value={numberInputValue(field.value)}
                          onChange={(e) => handleNumberChange(e, field.onChange)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={adjustForm.control}
                  name="quantityDelta"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabelWithInfo label="Quantity Change (use negative to subtract)" hint="Positive: add stock, Negative: remove stock" />
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          {...field}
                          value={numberInputValue(field.value)}
                          onChange={(e) => handleNumberChange(e, field.onChange)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={adjustForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Physical count, Received shipment" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </form>
          </Form>
          </TooltipProvider>
      </MobileFormDialog>

      {/* Product Details Drawer */}
      <DetailsDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedProduct(null);
          handleCloseVariantForm();
        }}
        title="Product Details"
        width={isMobile ? '100%' : 480}
        tabs={selectedProduct ? [
          {
            key: 'details',
            label: 'Details',
            content: (
              <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-lg border border-border bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                {selectedProduct.imageUrl ? (
                  <button
                    type="button"
                    onClick={() => setImagePreviewUrl(resolveProductImageUrl(selectedProduct.imageUrl))}
                    className="w-full h-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                  >
                    <img
                      src={resolveProductImageUrl(selectedProduct.imageUrl)}
                      alt={selectedProduct.name || 'Product'}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ) : (
                  <Package className="h-10 w-10 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-semibold truncate">{selectedProduct.name}</h3>
                  <StatusChip
                    status={selectedProduct.isActive ? 'active_flag' : 'inactive_flag'}
                  />
                </div>
                {selectedProduct.sku && (
                  <p className="text-sm text-muted-foreground mt-0.5">SKU: {selectedProduct.sku}</p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreVertical className="h-4 w-4 mr-2" />
                    More options
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => handleDuplicateProduct(selectedProduct)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setDrawerOpen(false);
                      handleEditProduct(selectedProduct);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  {selectedProduct.trackStock !== false && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => handleOpenReceiveStock(selectedProduct)}>
                        <Download className="h-4 w-4 mr-2" />
                        Receive Stock
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleAdjustStockClick(selectedProduct)}>
                        <Package className="h-4 w-4 mr-2" />
                        Adjust Stock
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleOpenStockTransfer(selectedProduct)}>
                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                        Transfer Stock
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => handleWhatsAppShare(selectedProduct)}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handleOpenQRGenerate(selectedProduct)}>
                    <QrCode className="h-4 w-4 mr-2" />
                    Generate QR & Barcode
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handleOpenVariantForm()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Variant
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handleOpenStoreListing(selectedProduct)}>
                    <Globe className="h-4 w-4 mr-2" />
                    Publish to online store
                  </DropdownMenuItem>
                  {canDeleteProduct && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => handleDeleteClick(selectedProduct)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <DrawerSectionCard title="Product info">
              <Descriptions column={1} className="space-y-0">
                <DescriptionItem label="Category">
                  <Badge variant="default">
                    {selectedProduct.category?.name || 'Uncategorized'}
                  </Badge>
                </DescriptionItem>
                <DescriptionItem label="Brand">
                  {selectedProduct.brand || '-'}
                </DescriptionItem>
                {canViewProductSensitiveFields && (
                  <DescriptionItem label="Supplier/Vendor">
                    {selectedProduct.supplier || '-'}
                  </DescriptionItem>
                )}
                <DescriptionItem label="Barcode">
                  {selectedProduct.barcode || '-'}
                </DescriptionItem>
                <DescriptionItem label="Product Code">
                  {getProductCodeForTable(selectedProduct) || '-'}
                </DescriptionItem>
              </Descriptions>
            </DrawerSectionCard>

            <DrawerSectionCard title="Pricing">
              <Descriptions column={1} className="space-y-0">
                {isRental && (
                  <>
                    <DescriptionItem label="Rentable">
                      <Badge variant="outline">{selectedProduct.isRentable !== false ? 'Yes' : 'No'}</Badge>
                    </DescriptionItem>
                    <DescriptionItem label="Salable">
                      <Badge variant="outline">{selectedProduct.isSalable ? 'Yes' : 'No'}</Badge>
                    </DescriptionItem>
                    <DescriptionItem label="Serial units">
                      <Badge variant="outline">
                        {selectedProduct.metadata?.tracksSerialUnits ? 'Tracked' : 'Quantity only'}
                      </Badge>
                    </DescriptionItem>
                    {selectedProduct.isRentable !== false && (
                      <DescriptionItem label="Rate per day">
                        {selectedProduct.rentalRatePerDay != null
                          ? valueFormatter(selectedProduct.rentalRatePerDay)
                          : '-'}
                      </DescriptionItem>
                    )}
                  </>
                )}
                {(!isRental || selectedProduct.isSalable) && (
                  <DescriptionItem label="Selling Price">
                    {valueFormatter(selectedVariantDetail?.sellingPrice ?? selectedProduct?.sellingPrice)}
                  </DescriptionItem>
                )}
                {showWholesalePriceField
                  && selectedProduct.wholesalePrice != null
                  && selectedProduct.wholesalePrice !== '' && (
                  <DescriptionItem label="Wholesale Price">
                    {valueFormatter(selectedProduct.wholesalePrice)}
                  </DescriptionItem>
                )}
                {canViewProductSensitiveFields && (
                  <>
                    <DescriptionItem label="Cost Price">
                      {valueFormatter(selectedProduct?.costPrice ?? 0)}
                    </DescriptionItem>
                    <DescriptionItem label="Profit Margin">
                      <Badge
                        variant="outline"
                        className={getMarginColor(calculateMargin(selectedProduct?.costPrice ?? 0, selectedProduct?.sellingPrice ?? 0))}
                      >
                        {marginFormatter(selectedProduct?.costPrice ?? 0, selectedProduct?.sellingPrice ?? 0)}
                      </Badge>
                    </DescriptionItem>
                  </>
                )}
              </Descriptions>
            </DrawerSectionCard>

            {isRental && selectedProduct.metadata?.tracksSerialUnits && (
              <DrawerSectionCard title="Serial units">
                {rentalUnitsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading units...
                  </div>
                ) : (
                  <div className="space-y-4">
                    {rentalUnits.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No units registered yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {rentalUnits.map((unit) => (
                          <div
                            key={unit.id}
                            className="flex items-start justify-between gap-3 border border-border rounded-md p-3"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-sm">{unit.serialNumber}</p>
                              <p className="text-xs text-muted-foreground">
                                {[
                                  unit.metadata?.plateNumber,
                                  unit.metadata?.color,
                                  unit.status,
                                ].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={rentalUnitSaving || unit.status === 'rented'}
                              onClick={() => handleDeleteRentalUnit(unit)}
                              aria-label="Remove unit"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-border rounded-md p-3">
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs text-muted-foreground">Serial / VIN</Label>
                        <Input
                          value={newRentalUnit.serialNumber}
                          onChange={(e) => setNewRentalUnit((prev) => ({ ...prev, serialNumber: e.target.value }))}
                          placeholder="e.g. 1HGCM82633A004352"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Plate number (optional)</Label>
                        <Input
                          value={newRentalUnit.plateNumber}
                          onChange={(e) => setNewRentalUnit((prev) => ({ ...prev, plateNumber: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Color (optional)</Label>
                        <Input
                          value={newRentalUnit.color}
                          onChange={(e) => setNewRentalUnit((prev) => ({ ...prev, color: e.target.value }))}
                        />
                      </div>
                      <div className="sm:col-span-2 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAddRentalUnit}
                          disabled={rentalUnitSaving || !newRentalUnit.serialNumber.trim()}
                        >
                          {rentalUnitSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          <span className="ml-2">Add unit</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </DrawerSectionCard>
            )}

            <DrawerSectionCard title="Stock information">
              <Descriptions column={1} className="space-y-0">
                {selectedProduct.trackStock === false ? (
                  <DescriptionItem label="Stock">
                    <Badge variant="outline" className="text-muted-foreground">Made to order</Badge>
                  </DescriptionItem>
                ) : (
                  <>
                    <DescriptionItem label="Quantity on Hand">
                      <div className="flex items-center gap-2">
                        <span>{formatInteger(getProductStockQuantity(selectedProduct))} {selectedProduct.unit}</span>
                        <StatusChip
                          status={getStockStatus(getProductStockQuantity(selectedProduct), selectedProduct.reorderLevel)}
                          size="small"
                        />
                      </div>
                    </DescriptionItem>
                    <DescriptionItem label="Reorder Level">
                      {selectedProduct.reorderLevel} {selectedProduct.unit}
                    </DescriptionItem>
                    <DescriptionItem label="Reorder Quantity">
                      {selectedProduct.reorderQuantity} {selectedProduct.unit}
                    </DescriptionItem>
                    {canViewProductSensitiveFields && (
                      <DescriptionItem label="Stock Value">
                        {valueFormatter((Number(selectedProduct?.sellingPrice ?? 0) || 0) * getProductStockQuantity(selectedProduct))}
                      </DescriptionItem>
                    )}
                  </>
                )}
              </Descriptions>
            </DrawerSectionCard>

            {selectedProduct.metadata && Object.keys(selectedProduct.metadata).length > 0 && (
              <DrawerSectionCard title="Additional details">
                <Descriptions column={1} className="space-y-0">
                  {selectedProduct.metadata.expiryDate && (
                    <DescriptionItem label="Expiry Date">
                      {dayjs(selectedProduct.metadata.expiryDate).format('MMM DD, YYYY')}
                    </DescriptionItem>
                  )}
                  {selectedProduct.metadata.batchNumber && (
                    <DescriptionItem label="Batch Number">
                      {selectedProduct.metadata.batchNumber}
                    </DescriptionItem>
                  )}
                  {selectedProduct.metadata.serialNumber && (
                    <DescriptionItem label="Serial Number">
                      {selectedProduct.metadata.serialNumber}
                    </DescriptionItem>
                  )}
                  {selectedProduct.metadata.warrantyPeriod > 0 && (
                    <DescriptionItem label="Warranty">
                      {WARRANTY_OPTIONS.find(w => w.value === selectedProduct.metadata.warrantyPeriod)?.label || `${selectedProduct.metadata.warrantyPeriod} months`}
                    </DescriptionItem>
                  )}
                  {selectedProduct.metadata.dimensions && (
                    <DescriptionItem label="Dimensions">
                      {selectedProduct.metadata.dimensions}
                    </DescriptionItem>
                  )}
                  {selectedProduct.metadata.weight && (
                    <DescriptionItem label="Weight">
                      {selectedProduct.metadata.weight}
                    </DescriptionItem>
                  )}
                  {selectedProduct.metadata.material && (
                    <DescriptionItem label="Material">
                      {selectedProduct.metadata.material}
                    </DescriptionItem>
                  )}
                  {selectedProduct.metadata.partNumber && (
                    <DescriptionItem label="Part Number">
                      {selectedProduct.metadata.partNumber}
                    </DescriptionItem>
                  )}
                  {selectedProduct.metadata.isbn && (
                    <DescriptionItem label="ISBN/Code">
                      {selectedProduct.metadata.isbn}
                    </DescriptionItem>
                  )}
                  {selectedProduct.metadata.author && (
                    <DescriptionItem label="Author">
                      {selectedProduct.metadata.author}
                    </DescriptionItem>
                  )}
                  {selectedProduct.metadata.allergens && (
                    <DescriptionItem label="Allergens">
                      {selectedProduct.metadata.allergens}
                    </DescriptionItem>
                  )}
                  {selectedProduct.metadata.optionalFoods && (
                    <DescriptionItem label="Optional foods / add-ons">
                      {selectedProduct.metadata.optionalFoods}
                    </DescriptionItem>
                  )}
                </Descriptions>
              </DrawerSectionCard>
            )}

            {selectedProduct.description && (
              <DrawerSectionCard title="Description">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedProduct.description}
                </p>
              </DrawerSectionCard>
            )}

            {(shopTypeFields.includes('hasVariants') || (selectedProduct.variants && selectedProduct.variants.length > 0)) && (
              <DrawerSectionCard
                title={`Variants (${selectedProduct.variants?.length ?? 0})`}
                extra={
                  shopTypeFields.includes('hasVariants') ? (
                    <Button variant="outline" size="sm" onClick={handleOpenVariantForm}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Variant
                    </Button>
                  ) : null
                }
              >
                {selectedProduct.variants && selectedProduct.variants.length > 0 ? (
                  <div className="space-y-2">
                    {selectedProduct.variants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => handleOpenVariantDetail(variant)}
                        className="flex w-full items-center justify-between gap-3 py-2 border-b border-border last:border-b-0 text-left hover:bg-muted/40 rounded-md px-1 -mx-1 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground">{variant.name}</p>
                          {variant.sku && (
                            <p className="text-xs text-muted-foreground">SKU: {variant.sku}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className="font-medium text-foreground">
                              {valueFormatter(variant.sellingPrice ?? selectedProduct?.sellingPrice)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Stock: {variant.quantityOnHand}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    No variants yet. Add sizes, colors, models, or other options.
                  </p>
                )}
              </DrawerSectionCard>
            )}

            <DrawerSectionCard title="Timestamps">
              <Descriptions column={1} className="space-y-0">
                <DescriptionItem label="Created">
                  {dayjs(selectedProduct.createdAt).format('MMM DD, YYYY HH:mm')}
                </DescriptionItem>
                <DescriptionItem label="Last Updated">
                  {dayjs(selectedProduct.updatedAt).format('MMM DD, YYYY HH:mm')}
                </DescriptionItem>
              </Descriptions>
            </DrawerSectionCard>
              </div>
            ),
          },
          {
            key: 'movement',
            label: 'Movement',
            content: (
              <ProductMovementTab
                productId={selectedProduct.id}
                unit={selectedProduct.unit || 'pcs'}
                valueFormatter={valueFormatter}
              />
            ),
          },
        ] : null}
      />

      {/* Add/Edit Variant Dialog */}
      <MobileFormDialog
        open={variantFormOpen}
        onOpenChange={(open) => !open && handleCloseVariantForm()}
        title={editingVariant ? 'Edit Variant' : 'Add Variant'}
        description={editingVariant ? 'Update variant details (e.g. Small, Medium, Large).' : `Add a variant to ${selectedProduct?.name || 'this product'}.`}
        footer={
          <>
            <Button variant="outline" onClick={handleCloseVariantForm}>
              Cancel
            </Button>
            <Button form="variant-form" type="submit" loading={submitting} disabled={submitting} className="bg-primary hover:bg-primary/90">
              {editingVariant ? 'Update Variant' : 'Add Variant'}
            </Button>
          </>
        }
      >
            <Form {...variantForm}>
              <form id="variant-form" onSubmit={variantForm.handleSubmit(handleVariantFormSubmit)} className="space-y-4">
                <FormField
                  control={variantForm.control}
                  name="size"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Size (optional)</FormLabel>
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select size" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SIZE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {(selectedProduct?.metadata?.models || '').split(',').map((s) => s.trim()).filter(Boolean).length > 0 ? (
                  <FormField
                    control={variantForm.control}
                    name="model"
                    render={({ field }) => {
                      const raw = (selectedProduct?.metadata?.models || '').split(',').map((s) => s.trim());
                      const modelOptions = raw.filter((opt) => opt != null && opt !== '');
                      return (
                        <FormItem>
                          <FormLabel>Model</FormLabel>
                          <Select value={field.value || undefined} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select model" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {modelOptions.map((opt, idx) => (
                                <SelectItem key={`${opt}-${idx}`} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                ) : (
                  <FormField
                    control={variantForm.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model (optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. MHM32-200/40"
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <div className={cn('grid grid-cols-1 gap-4', canViewProductSensitiveFields ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                  <FormField
                    control={variantForm.control}
                    name="sellingPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Selling Price</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') return field.onChange('');
                              const normalized = raw.replace(/,/g, '.');
                              const n = parseFloat(normalized);
                              field.onChange(Number.isNaN(n) ? raw : n);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {canViewProductSensitiveFields && (
                    <FormField
                      control={variantForm.control}
                      name="costPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cost Price</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') return field.onChange('');
                                const normalized = raw.replace(/,/g, '.');
                                const n = parseFloat(normalized);
                                field.onChange(Number.isNaN(n) ? raw : n);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={variantForm.control}
                    name="quantityOnHand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stock</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            {...field}
                            value={numberInputValue(field.value)}
                            onChange={(e) => handleNumberChange(e, field.onChange)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={variantForm.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. PIZZA-SM" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
      </MobileFormDialog>

      {/* Variant Detail Sheet */}
      <Sheet open={variantDetailOpen} onOpenChange={(open) => !open && handleCloseVariantDetail()}>
        <SheetContent side="right" className="flex w-full min-w-0 flex-col overflow-hidden sm:max-w-md">
          <SheetHeader className="pr-8">
            <SheetTitle>{selectedVariantDetail?.name || 'Variant'}</SheetTitle>
            <SheetDescription>
              {selectedProduct?.name ? `Variant of ${selectedProduct.name}` : 'Product variant details'}
            </SheetDescription>
          </SheetHeader>
          {selectedVariantDetail && (
            <div className="flex-1 overflow-y-auto py-4">
              <Descriptions column={1} className="space-y-0">
                {selectedVariantDetail.sku && (
                  <DescriptionItem label="SKU">{selectedVariantDetail.sku}</DescriptionItem>
                )}
                {selectedVariantDetail.barcode && (
                  <DescriptionItem label="Barcode">{selectedVariantDetail.barcode}</DescriptionItem>
                )}
                {selectedVariantDetail.attributes?.size && (
                  <DescriptionItem label="Size">{selectedVariantDetail.attributes.size}</DescriptionItem>
                )}
                {selectedVariantDetail.attributes?.color && (
                  <DescriptionItem label="Color">{selectedVariantDetail.attributes.color}</DescriptionItem>
                )}
                {selectedVariantDetail.attributes?.model && (
                  <DescriptionItem label="Model">{selectedVariantDetail.attributes.model}</DescriptionItem>
                )}
                <DescriptionItem label="Selling Price">
                  {valueFormatter(selectedVariantDetail.sellingPrice ?? selectedProduct?.sellingPrice)}
                </DescriptionItem>
                {canViewProductSensitiveFields && selectedVariantDetail.costPrice != null && (
                  <DescriptionItem label="Cost Price">
                    {valueFormatter(selectedVariantDetail.costPrice)}
                  </DescriptionItem>
                )}
                <DescriptionItem label="Stock">
                  {selectedVariantDetail.quantityOnHand ?? 0}
                </DescriptionItem>
              </Descriptions>
            </div>
          )}
          <SheetFooter className="gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="text-destructive border-destructive hover:bg-destructive/10"
              onClick={() => setVariantDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            <Button type="button" onClick={handleEditVariantFromDetail}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={variantDeleteDialogOpen} onOpenChange={setVariantDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{selectedVariantDetail?.name}&quot;? Past sales that used this variant will keep their records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVariantConfirm}
              loading={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create / Manage Category Dialog */}
      <MobileFormDialog
        open={categoryModalOpen}
        onOpenChange={(open) => {
          setCategoryModalOpen(open);
          if (!open) setNewCategoryName('');
        }}
        title="Categories"
        description="Add a category or delete one that has no products."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setCategoryModalOpen(false);
                setNewCategoryName('');
              }}
            >
              Close
            </Button>
            <Button
              onClick={handleCreateCategory}
              loading={creatingCategory}
              disabled={!newCategoryName.trim()}
              className="bg-green-700 hover:bg-green-800"
            >
              Create Category
            </Button>
          </>
        }
      >
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="categoryName">New category name</Label>
              <Input
                id="categoryName"
                placeholder="e.g., Beverages, Snacks, Dairy..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !creatingCategory) {
                    e.preventDefault();
                    handleCreateCategory();
                  }
                }}
              />
            </div>
            {categories.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Existing categories</Label>
                  <ul className="space-y-1 max-h-40 overflow-y-auto rounded-md border border-input p-2">
                    {categories.map((cat) => (
                      <li key={cat.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/50">
                        <span className="text-sm truncate">{cat.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setCategoryToDelete(cat)}
                          title="Delete category"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
      </MobileFormDialog>

      {/* Confirm delete category */}
      <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{categoryToDelete?.name}&quot;? This only works if no products use this category. Products using it will need their category changed first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCategory}
              disabled={deletingCategory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingCategory ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk import modal */}
      <Dialog open={importModalOpen} onOpenChange={(open) => { setImportModalOpen(open); if (!open) { setImportResult(null); setImportFile(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import products</DialogTitle>
            <DialogDescription>
              Download the CSV template, fill in your products (no images), then upload the file. Max 500 rows per file.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadProductTemplate}
                disabled={templateLoading}
                className="w-full"
              >
                {templateLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Download CSV template
              </Button>
            </div>
            <div>
              <Label htmlFor="import-file">Select CSV or Excel file</Label>
              <Input
                id="import-file"
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="mt-2"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
              {importFile && <p className="text-sm text-muted-foreground mt-1">{importFile.name}</p>}
            </div>
            {importResult && (
              <div className="rounded-md border border-border p-3 space-y-2">
                <p className="text-sm font-medium">
                  {importResult.successCount ?? 0} imported, {(importResult.errors ?? []).length} error(s)
                </p>
                {Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
                  <ul className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-1">
                    {importResult.errors.slice(0, 20).map((err, i) => (
                      <li key={i}>Row {err.row}: {err.message}</li>
                    ))}
                    {importResult.errors.length > 20 && <li>… and {importResult.errors.length - 20} more</li>}
                  </ul>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportModalOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={handleImportSubmit} disabled={!importFile || importLoading}>
              {importLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image preview modal */}
      <Dialog open={!!imagePreviewUrl} onOpenChange={(open) => !open && setImagePreviewUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Image preview</DialogTitle>
          </DialogHeader>
          <DialogBody className="p-0">
            {imagePreviewUrl && (
              <img
                src={imagePreviewUrl}
                alt="Product preview"
                className="w-full h-auto max-h-[85vh] object-contain"
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
