import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useClipboardImagePaste from '../hooks/useClipboardImagePaste';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ImageIcon,
  Loader2,
  Monitor,
  Package,
  Smartphone,
  Sparkles,
  UploadCloud,
} from 'lucide-react';

import productService from '../services/productService';
import storeService from '../services/storeService';
import { resolveImageUrl } from '../utils/fileUtils';
import { formatAmount, formatInteger } from '../utils/formatNumber';
import { getErrorMessage, showError, showSuccess } from '../utils/toast';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import StoreListingHomeSectionsField from '../components/store/StoreListingHomeSectionsField';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const INVENTORY_POLICIES = [
  { value: 'track', label: 'Track inventory', description: 'Use the product stock count for availability.' },
  { value: 'deny', label: 'Stop when out of stock', description: 'Do not allow orders after stock reaches zero.' },
  { value: 'continue', label: 'Continue selling', description: 'Keep accepting orders even when stock is low.' },
];

const VISIBILITY_OPTIONS = [
  { value: 'draft', label: 'Draft', description: 'Keep this listing private while you finish editing.' },
  { value: 'published', label: 'Published', description: 'Show this product in your online store.' },
  { value: 'hidden', label: 'Hidden', description: 'Hide this listing without deleting its content.' },
];

const listingSchema = z.object({
  title: z.string().trim().min(1, 'Listing title is required'),
  shortDescription: z.string().trim().min(1, 'Short description is required').max(280, 'Keep the short description under 280 characters'),
  description: z.string().optional(),
  salesCopy: z.string().optional(),
  publicPrice: z.coerce.number().min(0.01, 'Public selling price must be greater than zero'),
  compareAtPrice: z.preprocess(
    (value) => (value === '' || value === null ? '' : value),
    z.union([z.coerce.number().min(0), z.literal('')]).optional(),
  ),
  inventoryPolicy: z.enum(['track', 'continue', 'deny']),
  slug: z.string()
    .trim()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and dashes only'),
  seoTitle: z.string().max(70, 'Keep SEO title under 70 characters').optional(),
  seoDescription: z.string().max(160, 'Keep SEO description under 160 characters').optional(),
  sectionIds: z.array(z.string()).default([]),
  status: z.enum(['draft', 'published', 'hidden']),
  images: z.array(z.string()).max(5, 'Use up to 5 images'),
}).refine((data) => data.status !== 'published' || data.images.length >= 1, {
  path: ['images'],
  message: 'Published products need 1 to 5 images',
});

const normalizeSlug = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const unwrapData = (response) => response?.data?.data || response?.data || response;

const getDefaultValues = (product, listing) => ({
  title: listing?.title || product?.name || '',
  shortDescription: listing?.shortDescription || '',
  description: listing?.description || product?.description || '',
  salesCopy: listing?.salesCopy || '',
  publicPrice: Number(listing?.publicPrice ?? product?.sellingPrice ?? 0),
  compareAtPrice: listing?.compareAtPrice ?? '',
  inventoryPolicy: listing?.inventoryPolicy || (product?.trackStock === false ? 'continue' : 'track'),
  slug: listing?.slug || normalizeSlug(product?.name || 'product'),
  seoTitle: listing?.metadata?.seoTitle || '',
  seoDescription: listing?.metadata?.seoDescription || '',
  sectionIds: Array.isArray(listing?.metadata?.sectionIds) ? listing.metadata.sectionIds : [],
  status: listing?.status || 'draft',
  images: Array.isArray(listing?.images)
    ? listing.images.slice(0, 5)
    : (product?.imageUrl ? [product.imageUrl] : []),
});

const StatusStepper = ({ status }) => {
  const currentIndex = status === 'published' ? 2 : 1;
  const steps = ['Inventory Product', 'Store Listing', 'Published'];

  return (
    <div className="rounded-2xl border border-border bg-background p-3 sm:p-4">
      <div className="grid grid-cols-3">
        {steps.map((step, index) => {
          const reached = index <= currentIndex;
          const completed = index < currentIndex;
          return (
            <div key={step} className="relative flex flex-col items-center gap-1.5 text-center sm:gap-2">
              {index > 0 && (
                <span className={cn(
                  'absolute right-1/2 top-3.5 h-0.5 w-full sm:top-4',
                  reached ? 'bg-green-700' : 'bg-border',
                )}
                />
              )}
              <span className={cn(
                'relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold sm:h-8 sm:w-8 sm:text-sm',
                reached ? 'border-green-700 bg-green-700 text-white' : 'border-border bg-background text-muted-foreground',
              )}
              >
                {completed ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span className={cn(
                'max-w-[5.5rem] text-[11px] font-medium leading-tight sm:max-w-none sm:text-sm',
                reached ? 'text-green-800' : 'text-muted-foreground',
              )}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StoreStatusCard = ({ status }) => {
  const isPublished = status === 'published';
  const badgeLabel = isPublished ? 'Published' : 'Not Published';

  return (
    <Card className="border border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Store Status</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPublished ? 'This product is visible in your online store.' : 'Finish the listing details before publishing.'}
          </p>
        </div>
        <Badge className={cn(
          'shrink-0',
          isPublished
            ? 'border-transparent bg-green-700 text-white hover:bg-green-700'
            : 'border-border bg-muted text-muted-foreground hover:bg-muted',
        )}
        >
          {badgeLabel}
        </Badge>
      </CardHeader>
    </Card>
  );
};

const ProductSummary = ({ product }) => {
  const stockLabel = product?.trackStock === false
    ? 'Not tracked'
    : `${formatInteger(product?.quantityOnHand || 0)} ${product?.unit || 'pcs'}`;
  const categoryLabel = product?.category?.name || product?.categoryName || 'Uncategorized';

  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-5 w-5 text-green-700" />
          Product Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted sm:h-28 sm:w-28">
            {product?.imageUrl ? (
              <img src={resolveImageUrl(product.imageUrl)} alt="" className="h-full w-full object-cover" />
            ) : (
              <Package className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Product</p>
              <p className="font-semibold">{product?.name || 'Untitled product'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Price</p>
              <p className="font-medium">{formatAmount(product?.sellingPrice || 0)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Stock</p>
              <p className="font-medium">{stockLabel}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Category</p>
              <p className="font-medium">{categoryLabel}</p>
            </div>
          </div>
        </div>
        {product?.description && (
          <p className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {product.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const ImageGallery = ({ images, onUpload, onRemove, onMakeCover, uploading, inputRef }) => (
  <Card className="border border-border">
    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <CardTitle className="text-base">Store Images</CardTitle>
        <p className="text-sm text-muted-foreground">Add 1 to 5 images. The first image is the cover. You can also paste an image (Ctrl/Cmd+V).</p>
      </div>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpg,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={onUpload}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading || images.length >= 5}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          Upload images
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {images.map((image, index) => (
          <div key={`${image}-${index}`} className="rounded-xl border border-border p-2">
            <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
              <img src={resolveImageUrl(image)} alt="" className="h-full w-full object-cover" />
              <Badge className="absolute left-2 top-2 bg-green-700 text-white hover:bg-green-700">
                {index === 0 ? 'Cover' : index + 1}
              </Badge>
            </div>
            <div className="mt-2 grid gap-2">
              <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => onMakeCover(index)}>
                Make cover
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => onRemove(index)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        {images.length < 5 && (
          <button
            type="button"
            className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mb-2 h-7 w-7 animate-spin text-muted-foreground" />
            ) : (
              <ImageIcon className="mb-2 h-7 w-7 text-muted-foreground" />
            )}
            <span className="font-medium">Add Image</span>
            <span className="mt-1 text-xs text-muted-foreground">
              {images.length === 0 ? 'Required to publish' : `${5 - images.length} remaining`}
            </span>
          </button>
        )}
      </div>
    </CardContent>
  </Card>
);

const DescriptionToolbar = () => (
  <div className="flex flex-wrap items-center gap-2 rounded-t-md border border-b-0 border-input bg-muted/30 px-3 py-2">
    {['B', 'I', '• List'].map((item) => (
      <Button key={item} type="button" variant="outline" size="sm" className="h-8 px-2" disabled>
        {item}
      </Button>
    ))}
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="ml-auto h-8" disabled>
          <Sparkles className="mr-2 h-4 w-4" />
          Generate with AI
        </Button>
      </TooltipTrigger>
      <TooltipContent>Coming soon</TooltipContent>
    </Tooltip>
  </div>
);

const VisibilityCards = ({ value, onChange }) => (
  <div className="grid gap-3 sm:grid-cols-3">
    {VISIBILITY_OPTIONS.map((option) => {
      const selected = value === option.value;
      return (
        <button
          key={option.value}
          type="button"
          className={cn(
            'min-h-28 rounded-xl border p-4 text-left transition-colors',
            selected
              ? 'border-green-700 bg-green-50 text-green-950'
              : 'border-border bg-background hover:bg-muted/40',
          )}
          onClick={() => onChange(option.value)}
        >
          <span className="flex items-center justify-between gap-3">
            <span className="font-semibold">{option.label}</span>
            <span className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full border',
              selected ? 'border-green-700 bg-green-700 text-white' : 'border-border',
            )}
            >
              {selected ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
          </span>
          <span className="mt-2 block text-sm text-muted-foreground">{option.description}</span>
        </button>
      );
    })}
  </div>
);

const ListingPreview = ({ values, product, previewMode, onPreviewModeChange }) => {
  const image = values.images?.[0] || product?.imageUrl;
  const isMobile = previewMode === 'mobile';
  const stockText = values.inventoryPolicy === 'continue'
    ? 'Available for order'
    : product?.trackStock === false
      ? 'Availability confirmed after order'
      : `${formatInteger(product?.quantityOnHand || 0)} available`;

  return (
    <Card className="border border-border xl:sticky xl:top-4">
      <CardHeader className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Live preview</CardTitle>
          <Tabs value={previewMode} onValueChange={onPreviewModeChange}>
            <TabsList className="grid w-full grid-cols-2 sm:w-auto">
              <TabsTrigger value="desktop" className="px-3">
                <Monitor className="mr-2 h-4 w-4" />
                Desktop
              </TabsTrigger>
              <TabsTrigger value="mobile" className="px-3">
                <Smartphone className="mr-2 h-4 w-4" />
                Mobile
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <p className="text-sm text-muted-foreground">Reviews and wishlist are hidden for the MVP preview.</p>
      </CardHeader>
      <CardContent>
        <div className={cn('rounded-2xl border border-border bg-background p-3', isMobile ? 'mx-auto max-w-[330px]' : 'w-full')}>
          <div className={cn('grid gap-4', isMobile ? 'grid-cols-1' : 'grid-cols-[1fr_1fr]')}>
            <div className="aspect-square overflow-hidden rounded-xl border border-border bg-muted">
              {image ? (
                <img src={resolveImageUrl(image)} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                  <ImageIcon className="mb-2 h-8 w-8" />
                  <span className="text-sm">Cover image</span>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <Badge variant={values.status === 'published' ? 'default' : 'outline'}>{values.status || 'draft'}</Badge>
              <div>
                <h2 className="text-xl font-semibold">{values.title || product?.name || 'Listing title'}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{values.shortDescription || 'Short description appears here.'}</p>
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-semibold text-green-800">{formatAmount(values.publicPrice || 0)}</span>
                {values.compareAtPrice ? (
                  <span className="text-sm text-muted-foreground line-through">{formatAmount(values.compareAtPrice)}</span>
                ) : null}
              </div>
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{stockText}</p>
              <Button type="button" className="w-full bg-green-700 hover:bg-green-800">Add to cart</Button>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm leading-6 text-muted-foreground">
              {values.salesCopy || values.description || product?.description || 'Full product description and sales copy will appear here.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const StoreListingEditor = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const imageInputRef = useRef(null);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [seoOpen, setSeoOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingAction, setSavingAction] = useState(null);

  const productQuery = useQuery({
    queryKey: ['products', productId],
    queryFn: () => productService.getProductById(productId),
    enabled: Boolean(productId),
  });

  const listingQuery = useQuery({
    queryKey: ['store', 'listing', 'product', productId],
    queryFn: () => storeService.getListingForProduct(productId),
    enabled: Boolean(productId),
  });

  const settingsQuery = useQuery({
    queryKey: ['store', 'settings'],
    queryFn: () => storeService.getSettings(),
  });

  const product = useMemo(() => unwrapData(productQuery.data), [productQuery.data]);
  const listing = useMemo(() => unwrapData(listingQuery.data), [listingQuery.data]);
  const storeSettings = useMemo(() => unwrapData(settingsQuery.data), [settingsQuery.data]);
  const homeSections = useMemo(() => {
    const sections = storeSettings?.metadata?.productSections;
    const items = Array.isArray(sections?.items) ? sections.items : [];
    return items;
  }, [storeSettings?.metadata?.productSections]);

  const form = useForm({
    resolver: zodResolver(listingSchema),
    defaultValues: getDefaultValues(null, null),
  });

  const values = form.watch();
  const images = values.images || [];

  useEffect(() => {
    if (!productQuery.isLoading && !listingQuery.isLoading && product?.id) {
      form.reset(getDefaultValues(product, listing));
    }
  }, [form, listing, listingQuery.isLoading, product, productQuery.isLoading]);

  const handleTitleBlur = useCallback((event) => {
    const currentSlug = form.getValues('slug');
    if (!currentSlug) {
      form.setValue('slug', normalizeSlug(event.target.value), { shouldValidate: true });
    }
  }, [form]);

  const setImages = useCallback((nextImages) => {
    form.setValue('images', nextImages.slice(0, 5), { shouldDirty: true, shouldValidate: true });
  }, [form]);

  const uploadImageFiles = useCallback(async (selectedFiles) => {
    const files = Array.from(selectedFiles || []).slice(0, 5 - images.length);
    if (!files.length) return;

    setUploading(true);
    try {
      const response = await storeService.uploadListingImages(files);
      const uploaded = response?.imageUrls || response?.data?.imageUrls || [];
      setImages([...images, ...uploaded].slice(0, 5));
      showSuccess('Listing images uploaded');
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to upload listing images'));
    } finally {
      setUploading(false);
    }
  }, [images, setImages]);

  const handleUpload = useCallback((event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    uploadImageFiles(files);
  }, [uploadImageFiles]);

  useClipboardImagePaste({
    enabled: !uploading && images.length < 5,
    onImages: uploadImageFiles,
  });

  const handleRemoveImage = useCallback((index) => {
    setImages(images.filter((_, imageIndex) => imageIndex !== index));
  }, [images, setImages]);

  const handleMakeCover = useCallback((index) => {
    const nextImages = [...images];
    const [cover] = nextImages.splice(index, 1);
    setImages([cover, ...nextImages]);
  }, [images, setImages]);

  const buildPayload = useCallback((data, statusOverride) => ({
    title: data.title,
    shortDescription: data.shortDescription || null,
    description: data.description || null,
    salesCopy: data.salesCopy || null,
    publicPrice: data.publicPrice,
    compareAtPrice: data.compareAtPrice === '' ? null : data.compareAtPrice,
    images: data.images,
    inventoryPolicy: data.inventoryPolicy,
    slug: normalizeSlug(data.slug || data.title),
    status: statusOverride || data.status,
    metadata: {
      ...(listing?.metadata || {}),
      seoTitle: data.seoTitle || null,
      seoDescription: data.seoDescription || null,
      sectionIds: Array.isArray(data.sectionIds) ? data.sectionIds : [],
    },
  }), [listing?.metadata]);

  const saveListing = useCallback(async (statusOverride) => {
    form.setValue('status', statusOverride, { shouldValidate: true, shouldDirty: true });
    const isValid = await form.trigger();
    if (!isValid) {
      showError('Fix the highlighted listing fields before saving.');
      return;
    }

    const data = form.getValues();
    const payload = buildPayload(data, statusOverride);
    setSavingAction(statusOverride);
    try {
      const response = listing?.id
        ? await storeService.updateListing(listing.id, payload)
        : await storeService.createOrUpdateProductListing(productId, payload);
      const savedListing = unwrapData(response);
      form.reset(getDefaultValues(product, savedListing));
      await listingQuery.refetch();
      showSuccess(statusOverride === 'published'
        ? 'Product published to store'
        : statusOverride === 'hidden'
          ? 'Listing hidden from store'
          : 'Store listing draft saved');
      if (statusOverride === 'published') {
        navigate(`/store/listings/${productId}/published`, {
          state: { listing: savedListing, product },
        });
      }
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to save store listing'));
    } finally {
      setSavingAction(null);
    }
  }, [buildPayload, form, listing?.id, listingQuery, navigate, product, productId]);

  const isLoading = productQuery.isLoading || listingQuery.isLoading;
  const isSaving = Boolean(savingAction);

  if (isLoading) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!product?.id) {
    return (
      <div className="space-y-4">
        <Button type="button" variant="ghost" onClick={() => navigate('/products')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to products
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Product not found or you do not have access to it.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-5 pb-36 sm:space-y-6 sm:pb-28">
        <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:hidden">
          <div className="relative flex min-h-10 items-center justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute left-0 h-10 px-2"
              onClick={() => navigate('/products')}
              aria-label="Back to products"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-base font-semibold">Publish Product</h1>
          </div>
        </div>

        <div className="space-y-4">
          <div className="hidden flex-col gap-4 sm:flex lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Button type="button" variant="ghost" className="-ml-3" onClick={() => navigate('/products')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to products
              </Button>
              <div>
                <h1 className="text-2xl font-semibold">Publish Product</h1>
                <p className="text-muted-foreground">Configure how this product appears in your online store.</p>
              </div>
            </div>
            <div className="w-full max-w-xl">
              <StatusStepper status={values.status} />
            </div>
          </div>

          <div className="space-y-3 sm:hidden">
            <p className="text-sm text-muted-foreground">Configure how this product appears in your online store.</p>
            <StatusStepper status={values.status} />
          </div>

          <StoreStatusCard status={values.status} />
        </div>

        <Form {...form}>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-6">
              <ProductSummary product={product} />

              <Card className="border border-border">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">Store Listing</CardTitle>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="outline" size="sm" disabled>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate with AI
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Coming soon</TooltipContent>
                  </Tooltip>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Listing title</FormLabel>
                        <FormControl><Input {...field} onBlur={(event) => { field.onBlur(); handleTitleBlur(event); }} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shortDescription"
                    render={({ field }) => (
                      <FormItem>
                  <FormLabel>Short description</FormLabel>
                        <FormControl><Input maxLength={280} {...field} /></FormControl>
                        <FormDescription>Shown in product cards and the preview header.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full description / sales copy (optional)</FormLabel>
                        <FormControl>
                          <div>
                            <DescriptionToolbar />
                            <Textarea rows={6} className="rounded-t-none" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="salesCopy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional sales copy (optional)</FormLabel>
                        <FormControl><Textarea rows={4} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <ImageGallery
                images={images}
                inputRef={imageInputRef}
                uploading={uploading}
                onUpload={handleUpload}
                onRemove={handleRemoveImage}
                onMakeCover={handleMakeCover}
              />
              <FormField
                control={form.control}
                name="images"
                render={() => (
                  <FormItem>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Card className="border border-border">
                <CardHeader>
                  <CardTitle className="text-base">Product Visibility</CardTitle>
                  <p className="text-sm text-muted-foreground">Choose how this listing should appear in the store.</p>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <VisibilityCards value={field.value} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="border border-border">
                <CardHeader>
                  <CardTitle className="text-base">Pricing</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="publicPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Public selling price</FormLabel>
                        <FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl>
                        <FormDescription>Can differ from the inventory price.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="compareAtPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Compare-at price (optional)</FormLabel>
                        <FormControl><Input type="number" min="0" step="0.01" {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="border border-border">
                <CardHeader>
                  <CardTitle className="text-base">Availability and stock behavior</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="inventoryPolicy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inventory policy</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {INVENTORY_POLICIES.map((policy) => (
                              <SelectItem key={policy.value} value={policy.value}>{policy.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {INVENTORY_POLICIES.find((policy) => policy.value === field.value)?.description}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="border border-border">
                <CardHeader>
                  <CardTitle className="text-base">Home sections (optional)</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Show this product on selected Online Store home shelves.
                  </p>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="sectionIds"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <StoreListingHomeSectionsField
                            sections={homeSections}
                            value={field.value || []}
                            onChange={field.onChange}
                            idPrefix="listing-section"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Collapsible open={seoOpen} onOpenChange={setSeoOpen}>
                <Card className="border border-border">
                  <CollapsibleTrigger asChild>
                    <button type="button" className="flex w-full items-center justify-between p-6 text-left">
                      <div>
                        <CardTitle className="text-base">Advanced Options</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">Optional slug and search preview fields. Collapsed by default on mobile.</p>
                      </div>
                      <ChevronDown className={cn('h-5 w-5 transition-transform', seoOpen && 'rotate-180')} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="space-y-4 pt-0">
                      <FormField
                        control={form.control}
                        name="slug"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Slug</FormLabel>
                            <FormControl><Input {...field} onChange={(event) => field.onChange(normalizeSlug(event.target.value))} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="seoTitle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SEO title (optional)</FormLabel>
                            <FormControl><Input maxLength={70} {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="seoDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SEO description (optional)</FormLabel>
                            <FormControl><Textarea rows={3} maxLength={160} {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            <ListingPreview
              values={values}
              product={product}
              previewMode={previewMode}
              onPreviewModeChange={setPreviewMode}
            />
          </div>
        </Form>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto grid max-w-screen-2xl grid-cols-1 gap-2 sm:flex sm:justify-end">
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => navigate('/products')}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => saveListing(values.status === 'hidden' ? 'hidden' : 'draft')}
            >
              {savingAction === 'draft' || savingAction === 'hidden' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Draft
            </Button>
            <Button type="button" className="bg-green-700 hover:bg-green-800" disabled={isSaving} onClick={() => saveListing('published')}>
              {savingAction === 'published' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Publish Product
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default StoreListingEditor;
