import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import useClipboardImagePaste from '../../hooks/useClipboardImagePaste';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Globe, ImagePlus, Loader2, Package, UploadCloud } from 'lucide-react';

import storeService from '../../services/storeService';
import { resolveImageUrl } from '../../utils/fileUtils';
import { formatAmount } from '../../utils/formatNumber';
import { getErrorMessage, showError, showSuccess } from '../../utils/toast';
import { isSabitoStoreEnabled } from '../../utils/sabitoStoreFeature';
import StoreListingHomeSectionsField from './StoreListingHomeSectionsField';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
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

const parseListingImages = (value) => String(value || '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(0, 5);

const formatListingImages = (images = []) => images
  .map((image) => String(image || '').trim())
  .filter(Boolean)
  .slice(0, 5)
  .join('\n');

const storeListingSchema = z.object({
  title: z.string().min(1, 'Listing title is required'),
  shortDescription: z.string().trim().min(1, 'Short description is required').max(280, 'Keep the short description under 280 characters'),
  description: z.string().optional(),
  publicPrice: z.coerce.number().min(0.01, 'Public selling price must be greater than zero'),
  compareAtPrice: z.preprocess(
    (value) => (value === '' || value === null ? '' : value),
    z.union([z.coerce.number().min(0), z.literal('')]).optional(),
  ),
  imagesText: z.string().optional(),
  sectionIds: z.array(z.string()).default([]),
});

const defaultValues = {
  title: '',
  shortDescription: '',
  description: '',
  publicPrice: 0,
  compareAtPrice: '',
  imagesText: '',
  sectionIds: [],
};

/**
 * Listing image uploader for the publish dialog.
 */
const ListingImagesField = ({
  images,
  field,
  uploading,
  inputId,
  onUpload,
  onAddClick,
  onRemove,
  onMakeCover,
}) => (
  <FormItem>
    <input type="hidden" {...field} />
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <FormLabel>Listing images</FormLabel>
        <p className="text-sm text-muted-foreground">Add 1 to 5 images. The first image is used as the cover. You can also paste an image (Ctrl/Cmd+V).</p>
      </div>
      <div>
        <input
          id={inputId}
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
          onClick={onAddClick}
        >
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          Upload images
        </Button>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {images.map((image, index) => (
        <div key={`${image}-${index}`} className="rounded-xl border border-border p-2">
          <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
            <img
              src={resolveImageUrl(image) || ''}
              alt={`Listing image ${index + 1}`}
              className="h-full w-full object-cover"
            />
            <Badge className="absolute left-2 top-2 bg-green-700 text-white hover:bg-green-700">
              {index === 0 ? 'Cover' : index + 1}
            </Badge>
          </div>
          <div className="mt-2 grid gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={index === 0}
              onClick={() => onMakeCover(index)}
            >
              Make cover
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onRemove(index)}>
              Remove
            </Button>
          </div>
        </div>
      ))}
      {images.length < 5 ? (
        <button
          type="button"
          className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={uploading}
          onClick={onAddClick}
        >
          {uploading ? (
            <Loader2 className="mb-2 h-7 w-7 animate-spin text-muted-foreground" />
          ) : (
            <ImagePlus className="mb-2 h-7 w-7 text-muted-foreground" />
          )}
          <span className="font-medium">Add image</span>
          <span className="mt-1 text-xs text-muted-foreground">
            {images.length === 0 ? 'Required to publish' : `${5 - images.length} remaining`}
          </span>
        </button>
      ) : null}
    </div>
    <FormMessage />
  </FormItem>
);

/**
 * Shared “Publish to online store” dialog used by Products and Online Store → Edit → Products.
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   product: object | null,
 *   homeSections?: Array<{ id: string, title: string, enabled?: boolean }> | null,
 *   onSuccess?: (payload: { listing: object, product: object, published: boolean }) => void,
 * }} props
 */
const PublishToOnlineStoreDialog = ({
  open,
  onOpenChange,
  product,
  homeSections = [],
  onSuccess,
}) => {
  const navigate = useNavigate();
  const imagesInputId = useId();
  const [loadingListing, setLoadingListing] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** @type {[null | 'draft' | 'published', function]} Which footer action is in flight (avoids spinner on the idle button). */
  const [submittingAction, setSubmittingAction] = useState(null);
  const submitting = submittingAction != null;
  const [exitPromptOpen, setExitPromptOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(storeListingSchema),
    defaultValues,
  });

  const dirty = form.formState.isDirty;
  const imagesText = form.watch('imagesText');
  const images = useMemo(() => parseListingImages(imagesText), [imagesText]);
  const sabitoEnabled = isSabitoStoreEnabled();

  const resetForProduct = useCallback(async (nextProduct) => {
    if (!nextProduct?.id) {
      form.reset(defaultValues);
      return;
    }

    setLoadingListing(true);
    let existingListing = null;
    try {
      const response = await storeService.getListingForProduct(nextProduct.id);
      existingListing = response?.data?.data || response?.data || response;
      if (existingListing?.success === false || !existingListing?.id) {
        existingListing = null;
      }
    } catch {
      existingListing = null;
    } finally {
      setLoadingListing(false);
    }

    form.reset({
      title: existingListing?.title || nextProduct.name || '',
      shortDescription: existingListing?.shortDescription || '',
      description: existingListing?.description || nextProduct.description || '',
      publicPrice: Number(existingListing?.publicPrice ?? nextProduct.sellingPrice ?? 0),
      compareAtPrice: existingListing?.compareAtPrice ?? '',
      imagesText: formatListingImages(
        Array.isArray(existingListing?.images)
          ? existingListing.images
          : (nextProduct.imageUrl ? [nextProduct.imageUrl] : []),
      ),
      sectionIds: Array.isArray(existingListing?.metadata?.sectionIds)
        ? existingListing.metadata.sectionIds
        : [],
    });
  }, [form]);

  useEffect(() => {
    if (!open || !product?.id) return;
    resetForProduct(product);
  }, [open, product, resetForProduct]);

  useEffect(() => {
    if (!open || !dirty || submitting) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty, open, submitting]);

  const buildPayload = useCallback((values, status) => {
    const publicPrice = Number.parseFloat(values.publicPrice);
    const compareAtPrice = Number.parseFloat(values.compareAtPrice);

    return {
      title: String(values.title || product?.name || '').trim(),
      shortDescription: values.shortDescription || null,
      description: values.description || null,
      publicPrice: Number.isFinite(publicPrice) ? publicPrice : undefined,
      compareAtPrice: values.compareAtPrice === '' || !Number.isFinite(compareAtPrice) ? null : compareAtPrice,
      images: parseListingImages(values.imagesText),
      status,
      metadata: {
        sectionIds: Array.isArray(values.sectionIds) ? values.sectionIds : [],
      },
    };
  }, [product?.name]);

  const uploadImageFiles = useCallback(async (selectedFiles) => {
    const current = parseListingImages(form.getValues('imagesText'));
    const files = Array.from(selectedFiles || []).slice(0, 5 - current.length);
    if (!files.length) return;
    setUploading(true);
    try {
      const response = await storeService.uploadListingImages(files);
      const uploaded = response?.imageUrls || response?.data?.imageUrls || [];
      const nextImages = [...current, ...uploaded].slice(0, 5);
      form.setValue('imagesText', formatListingImages(nextImages), { shouldDirty: true, shouldValidate: true });
      showSuccess('Store listing images uploaded');
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to upload listing images'));
    } finally {
      setUploading(false);
    }
  }, [form]);

  const handleImagesUpload = useCallback((event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    uploadImageFiles(files);
  }, [uploadImageFiles]);

  useClipboardImagePaste({
    enabled: open && !uploading && images.length < 5,
    onImages: uploadImageFiles,
  });

  const handleAddImagesClick = useCallback(() => {
    document.getElementById(imagesInputId)?.click();
  }, [imagesInputId]);

  const handleRemoveImage = useCallback((index) => {
    const current = parseListingImages(form.getValues('imagesText'));
    const nextImages = current.filter((_, imageIndex) => imageIndex !== index);
    form.setValue('imagesText', formatListingImages(nextImages), { shouldDirty: true, shouldValidate: true });
  }, [form]);

  const handleMakeCover = useCallback((index) => {
    const current = parseListingImages(form.getValues('imagesText'));
    if (index <= 0 || index >= current.length) return;
    const nextImages = [...current];
    const [cover] = nextImages.splice(index, 1);
    form.setValue('imagesText', formatListingImages([cover, ...nextImages]), { shouldDirty: true, shouldValidate: true });
  }, [form]);

  /**
   * Persist listing as draft or published.
   * @param {object} values - Validated form values
   * @param {'draft'|'published'} status - Listing status to save
   */
  const saveListing = useCallback(async (values, status) => {
    if (!product?.id) return;
    const published = status === 'published';
    setSubmittingAction(published ? 'published' : 'draft');
    try {
      const payload = buildPayload(values, status);
      const response = await storeService.createOrUpdateProductListing(product.id, payload);
      const savedListing = response?.data?.data || response?.data || response;
      showSuccess(published ? 'Product published to online store' : 'Store listing saved as draft');
      form.reset(values);
      setExitPromptOpen(false);
      onOpenChange(false);
      onSuccess?.({ listing: savedListing, product, published });
      if (published && sabitoEnabled) {
        navigate(`/store/listings/${product.id}/published`, {
          state: { listing: savedListing, product },
        });
      }
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to save store listing'));
    } finally {
      setSubmittingAction(null);
    }
  }, [buildPayload, form, navigate, onOpenChange, onSuccess, product, sabitoEnabled]);

  const handleSaveDraft = useCallback((event) => {
    void form.handleSubmit((values) => saveListing(values, 'draft'))(event);
  }, [form, saveListing]);

  const handlePublishNow = useCallback((event) => {
    void form.handleSubmit((values) => {
      const count = parseListingImages(values.imagesText).length;
      if (count < 1 || count > 5) {
        form.setError('imagesText', {
          type: 'manual',
          message: 'Add 1 to 5 image URLs before publishing',
        });
        return;
      }
      return saveListing(values, 'published');
    })(event);
  }, [form, saveListing]);

  const handleCloseRequest = useCallback((nextOpen) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (submitting || uploading) return;
    if (dirty) {
      setExitPromptOpen(true);
      return;
    }
    onOpenChange(false);
  }, [dirty, onOpenChange, submitting, uploading]);

  const handleDiscard = useCallback(() => {
    form.reset(form.getValues());
    setExitPromptOpen(false);
    onOpenChange(false);
  }, [form, onOpenChange]);

  const handleSaveDraftAndClose = useCallback(async () => {
    if (!product?.id) return;
    setSubmittingAction('draft');
    try {
      const values = form.getValues();
      const payload = buildPayload(values, 'draft');
      await storeService.createOrUpdateProductListing(product.id, payload);
      showSuccess('Store listing saved as draft');
      form.reset(values);
      setExitPromptOpen(false);
      onOpenChange(false);
      onSuccess?.({ listing: null, product, published: false });
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to save store listing draft'));
    } finally {
      setSubmittingAction(null);
    }
  }, [buildPayload, form, onOpenChange, onSuccess, product]);

  const handleOpenFullEditor = useCallback(() => {
    if (!product?.id) return;
    if (dirty) {
      setExitPromptOpen(true);
      return;
    }
    onOpenChange(false);
    navigate(`/store/listings/${product.id}/edit`);
  }, [dirty, navigate, onOpenChange, product?.id]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleCloseRequest}>
        <DialogContent
          className="sm:max-w-[min(96vw,72rem)]"
          style={{ '--modal-w': 'min(96vw, 72rem)', '--modal-min-h': 'auto', '--modal-max-h': '90vh' }}
        >
          <DialogHeader>
            <DialogTitle>Publish to online store</DialogTitle>
            <DialogDescription>
              Create or update the public listing for {product?.name || 'this product'}.
            </DialogDescription>
          </DialogHeader>
          {loadingListing ? (
            <div className="flex min-h-48 flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Form {...form}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                }}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <DialogBody>
                  <div className="space-y-5">
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Inventory product</p>
                      <div className="mt-3 flex gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                          {product?.imageUrl ? (
                            <img src={resolveImageUrl(product.imageUrl) || ''} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{product?.name || 'Product'}</p>
                          <p className="text-sm text-muted-foreground">
                            {product?.sku || 'No SKU'} • {formatAmount(product?.sellingPrice || 0)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Listing title</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (optional)</FormLabel>
                          <FormControl><Textarea rows={4} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="publicPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Public selling price</FormLabel>
                            <FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl>
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
                            <FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="imagesText"
                      render={({ field }) => (
                        <ListingImagesField
                          images={images}
                          field={field}
                          uploading={uploading}
                          inputId={imagesInputId}
                          onUpload={handleImagesUpload}
                          onAddClick={handleAddImagesClick}
                          onRemove={handleRemoveImage}
                          onMakeCover={handleMakeCover}
                        />
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sectionIds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Home sections (optional)</FormLabel>
                          <FormControl>
                            <StoreListingHomeSectionsField
                              sections={homeSections}
                              value={field.value || []}
                              onChange={field.onChange}
                              idPrefix="publish-section"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </DialogBody>
                <DialogFooter className="gap-2 sm:space-x-0">
                  {sabitoEnabled ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="sm:mr-auto"
                      onClick={handleOpenFullEditor}
                      disabled={submitting || !product?.id}
                    >
                      Open full editor
                    </Button>
                  ) : null}
                  <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-w-[8.5rem]"
                      onClick={handleSaveDraft}
                      disabled={submitting || uploading}
                    >
                      {submittingAction === 'draft' ? (
                        <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      ) : null}
                      Save as draft
                    </Button>
                    <Button
                      type="button"
                      onClick={handlePublishNow}
                      disabled={submitting || uploading}
                      className="min-w-[9.5rem] bg-[#166534] text-white hover:bg-[#14532d]"
                    >
                      {submittingAction === 'published' ? (
                        <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      ) : (
                        <Globe className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                      )}
                      Publish now
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={exitPromptOpen} onOpenChange={setExitPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save this product listing?</AlertDialogTitle>
            <AlertDialogDescription>
              You have changes that have not been saved. Save them as a draft, discard them, or continue editing before you publish.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>
              Continue editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscard}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleSaveDraftAndClose();
              }}
              loading={submitting}
              disabled={!product?.id}
            >
              Save as draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PublishToOnlineStoreDialog;
