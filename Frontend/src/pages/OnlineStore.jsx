import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import storeService from '../services/storeService';
import settingsService from '../services/settingsService';
import {
  getStoreTemplate,
  mergeColorsForTemplate,
  normalizeTemplateId,
} from '../constants/storeTemplates';
import { buildOnlineStoreUrl } from '../utils/storefrontUrl';
import { resolveStoreCurrencyCode } from '../utils/storeCurrency';
import {
  buildOnlineStoreDefaultsFromTenant,
  firstFilled,
  resolveStoreLogoUrl,
} from '../utils/onlineStoreDefaults';
import { showError, showSuccess } from '../utils/toast';
import OnlineStoreWelcome from '../components/store/OnlineStoreWelcome';
import OnlineStoreDashboard from '../components/store/OnlineStoreDashboard';
import { buildDnsRecord } from '../components/store/ConnectDomainDialog';
import StoreTemplateGalleryModal from '../components/store/StoreTemplateGalleryModal';

/**
 * MVP shell for the "Online Store" product: custom-domain storefront with selectable layouts.
 */
const OnlineStore = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { activeTenant, user } = useAuth();
  const [domainInput, setDomainInput] = useState('');
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [selectingTemplateId, setSelectingTemplateId] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [heroOpen, setHeroOpen] = useState(false);
  const [testimonialsOpen, setTestimonialsOpen] = useState(false);
  const [productSectionsOpen, setProductSectionsOpen] = useState(false);
  const [productCardActionsOpen, setProductCardActionsOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const appliedDeepLinkRef = useRef(null);

  const deepLinkRaw = searchParams.get('template');
  const hasDeepLink = Boolean(deepLinkRaw);
  const deepLinkTemplate = normalizeTemplateId(deepLinkRaw);
  const stepParam = searchParams.get('step');
  const testimonialsDeepLink = stepParam === 'testimonials';
  const productSectionsDeepLink = stepParam === 'product-sections';
  const productButtonsDeepLink = stepParam === 'product-buttons';
  const productsDeepLink = stepParam === 'products';
  const heroDeepLink = stepParam === 'hero';
  const editDeepLink = stepParam === 'edit';

  const { data: response, isLoading } = useQuery({
    queryKey: ['store', 'domain'],
    queryFn: () => storeService.getDomainSettings(),
    // A pending domain is checked again on each fetch (when ABS connects domains by itself), so it turns Connected on its own.
    refetchInterval: (query) => {
      const d = query.state.data?.data ?? query.state.data;
      return d?.autoConnect && d?.customDomainStatus === 'pending' ? 60_000 : false;
    },
  });

  const data = response?.data ?? response ?? {};
  const hasStoreSettings = Boolean(data.hasStoreSettings);
  const cnameTarget = data.cnameTarget || 'store.absghana.com';
  const domainStatus = data.customDomainStatus || 'none';

  const { data: settingsResponse, isLoading: settingsLoading } = useQuery({
    queryKey: ['store', 'settings'],
    queryFn: () => storeService.getSettings(),
    enabled: hasDeepLink || hasStoreSettings || testimonialsDeepLink || productSectionsDeepLink || productButtonsDeepLink || productsDeepLink || heroDeepLink || editDeepLink,
  });

  const { data: organizationResponse } = useQuery({
    queryKey: ['settings', 'organization'],
    queryFn: () => settingsService.getOrganization(),
  });

  const settings = settingsResponse?.data ?? settingsResponse ?? null;
  const organization = organizationResponse?.data?.data || organizationResponse?.data || organizationResponse || null;
  const currentTemplateId = normalizeTemplateId(data.templateId || settings?.templateId);

  const galleryPreviewBranding = useMemo(() => {
    const defaults = buildOnlineStoreDefaultsFromTenant(activeTenant, user, { organization });
    const displayName = firstFilled(settings?.displayName, data.displayName, defaults.displayName);
    const logoUrl = resolveStoreLogoUrl(settings, data, defaults, organization, activeTenant?.metadata, activeTenant);
    const primaryColor = firstFilled(settings?.primaryColor, defaults.primaryColor);
    const merged = mergeColorsForTemplate(currentTemplateId, {
      primaryColor,
      secondaryColor: settings?.secondaryColor || null,
      tertiaryColor: settings?.tertiaryColor || null,
    });
    return {
      displayName,
      logoUrl,
      primaryColor: merged.primaryColor,
      secondaryColor: merged.secondaryColor || '',
      tertiaryColor: merged.tertiaryColor || '',
      description: firstFilled(settings?.description, defaults.description),
      contactPhone: firstFilled(settings?.contactPhone, defaults.contactPhone),
      whatsappNumber: firstFilled(settings?.whatsappNumber, defaults.whatsappNumber),
      contactEmail: firstFilled(settings?.contactEmail, defaults.contactEmail),
      currency: resolveStoreCurrencyCode(settings?.currency, defaults.currency),
    };
  }, [activeTenant, currentTemplateId, data, organization, settings, user]);

  useEffect(() => {
    setDomainInput(data.customDomain || '');
  }, [data.customDomain]);

  const clearTemplateQuery = useCallback(() => {
    if (!searchParams.has('template')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('template');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const clearStepQuery = useCallback(() => {
    if (!searchParams.has('step')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('step');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!hasStoreSettings) return;
    if (testimonialsDeepLink) {
      setTestimonialsOpen(true);
      clearStepQuery();
      return;
    }
    if (productSectionsDeepLink) {
      setProductSectionsOpen(true);
      clearStepQuery();
      return;
    }
    if (productButtonsDeepLink) {
      setProductCardActionsOpen(true);
      clearStepQuery();
      return;
    }
    if (productsDeepLink) {
      setProductsOpen(true);
      clearStepQuery();
      return;
    }
    if (heroDeepLink) {
      setHeroOpen(true);
      clearStepQuery();
      return;
    }
    if (editDeepLink) {
      setEditOpen(true);
      clearStepQuery();
    }
  }, [clearStepQuery, editDeepLink, hasStoreSettings, heroDeepLink, productButtonsDeepLink, productSectionsDeepLink, productsDeepLink, testimonialsDeepLink]);

  const saveTestimonialsMutation = useMutation({
    mutationFn: async (testimonials) => {
      let currentSettings = settings;
      if (!currentSettings) {
        const fetched = await storeService.getSettings();
        currentSettings = fetched?.data ?? fetched;
      }
      if (!currentSettings) {
        throw new Error('Store settings unavailable');
      }
      return storeService.updateSettings({
        displayName: currentSettings.displayName,
        slug: currentSettings.slug,
        description: currentSettings.description,
        logoUrl: currentSettings.logoUrl,
        bannerImageUrl: currentSettings.bannerImageUrl,
        primaryColor: currentSettings.primaryColor,
        secondaryColor: currentSettings.secondaryColor || null,
        tertiaryColor: currentSettings.tertiaryColor || null,
        contactPhone: currentSettings.contactPhone,
        whatsappNumber: currentSettings.whatsappNumber,
        contactEmail: currentSettings.contactEmail,
        pickupEnabled: currentSettings.pickupEnabled,
        deliveryEnabled: currentSettings.deliveryEnabled,
        deliveryFee: currentSettings.deliveryFee,
        currency: resolveStoreCurrencyCode(currentSettings.currency),
        enabled: currentSettings.enabled,
        templateId: currentSettings.templateId,
        // Omit heroSlides so upsert keeps the DB value (avoids wiping when resolve is empty).
        metadata: {
          ...(currentSettings.metadata || {}),
          testimonials,
        },
      });
    },
    onSuccess: async () => {
      showSuccess('Testimonials saved');
      await queryClient.invalidateQueries({ queryKey: ['store', 'settings'] });
    },
    onError: (error) => showError(error, 'Could not save testimonials'),
  });

  const handleSaveTestimonials = useCallback(
    (testimonials) => saveTestimonialsMutation.mutateAsync(testimonials),
    [saveTestimonialsMutation],
  );

  const saveProductSectionsMutation = useMutation({
    mutationFn: async (productSections) => {
      let currentSettings = settings;
      if (!currentSettings) {
        const fetched = await storeService.getSettings();
        currentSettings = fetched?.data ?? fetched;
      }
      if (!currentSettings) {
        throw new Error('Store settings unavailable');
      }
      return storeService.updateSettings({
        displayName: currentSettings.displayName,
        slug: currentSettings.slug,
        description: currentSettings.description,
        logoUrl: currentSettings.logoUrl,
        bannerImageUrl: currentSettings.bannerImageUrl,
        primaryColor: currentSettings.primaryColor,
        secondaryColor: currentSettings.secondaryColor || null,
        tertiaryColor: currentSettings.tertiaryColor || null,
        contactPhone: currentSettings.contactPhone,
        whatsappNumber: currentSettings.whatsappNumber,
        contactEmail: currentSettings.contactEmail,
        pickupEnabled: currentSettings.pickupEnabled,
        deliveryEnabled: currentSettings.deliveryEnabled,
        deliveryFee: currentSettings.deliveryFee,
        currency: resolveStoreCurrencyCode(currentSettings.currency),
        enabled: currentSettings.enabled,
        templateId: currentSettings.templateId,
        metadata: {
          ...(currentSettings.metadata || {}),
          productSections,
        },
      });
    },
    onSuccess: async () => {
      showSuccess('Product sections saved');
      await queryClient.invalidateQueries({ queryKey: ['store', 'settings'] });
    },
    onError: (error) => showError(error, 'Could not save product sections'),
  });

  const handleSaveProductSections = useCallback(
    (productSections) => saveProductSectionsMutation.mutateAsync(productSections),
    [saveProductSectionsMutation],
  );

  const saveProductCardActionsMutation = useMutation({
    mutationFn: async (productCardActions) => {
      let currentSettings = settings;
      if (!currentSettings) {
        const fetched = await storeService.getSettings();
        currentSettings = fetched?.data ?? fetched;
      }
      if (!currentSettings) {
        throw new Error('Store settings unavailable');
      }
      return storeService.updateSettings({
        displayName: currentSettings.displayName,
        slug: currentSettings.slug,
        description: currentSettings.description,
        logoUrl: currentSettings.logoUrl,
        bannerImageUrl: currentSettings.bannerImageUrl,
        primaryColor: currentSettings.primaryColor,
        secondaryColor: currentSettings.secondaryColor || null,
        tertiaryColor: currentSettings.tertiaryColor || null,
        contactPhone: currentSettings.contactPhone,
        whatsappNumber: currentSettings.whatsappNumber,
        contactEmail: currentSettings.contactEmail,
        pickupEnabled: currentSettings.pickupEnabled,
        deliveryEnabled: currentSettings.deliveryEnabled,
        deliveryFee: currentSettings.deliveryFee,
        currency: resolveStoreCurrencyCode(currentSettings.currency),
        enabled: currentSettings.enabled,
        templateId: currentSettings.templateId,
        metadata: {
          ...(currentSettings.metadata || {}),
          productCardActions,
        },
      });
    },
    onSuccess: async () => {
      showSuccess('Product buttons saved');
      await queryClient.invalidateQueries({ queryKey: ['store', 'settings'] });
    },
    onError: (error) => showError(error, 'Could not save product buttons'),
  });

  const handleSaveProductCardActions = useCallback(
    (productCardActions) => saveProductCardActionsMutation.mutateAsync(productCardActions),
    [saveProductCardActionsMutation],
  );

  const saveHeroMutation = useMutation({
    mutationFn: async ({ heroSlides: nextHeroSlides, heroAnimation: nextHeroAnimation } = {}) => {
      let currentSettings = settings;
      if (!currentSettings) {
        const fetched = await storeService.getSettings();
        currentSettings = fetched?.data ?? fetched;
      }
      if (!currentSettings) {
        throw new Error('Store settings unavailable');
      }
      const animationKey = String(nextHeroAnimation || '').trim().toLowerCase();
      const heroAnimation = ['fade', 'slide', 'zoom'].includes(animationKey) ? animationKey : 'fade';
      return storeService.updateSettings({
        displayName: currentSettings.displayName,
        slug: currentSettings.slug,
        description: currentSettings.description,
        logoUrl: currentSettings.logoUrl,
        bannerImageUrl: currentSettings.bannerImageUrl,
        primaryColor: currentSettings.primaryColor,
        secondaryColor: currentSettings.secondaryColor || null,
        tertiaryColor: currentSettings.tertiaryColor || null,
        contactPhone: currentSettings.contactPhone,
        whatsappNumber: currentSettings.whatsappNumber,
        contactEmail: currentSettings.contactEmail,
        pickupEnabled: currentSettings.pickupEnabled,
        deliveryEnabled: currentSettings.deliveryEnabled,
        deliveryFee: currentSettings.deliveryFee,
        currency: resolveStoreCurrencyCode(currentSettings.currency),
        enabled: currentSettings.enabled,
        templateId: currentSettings.templateId,
        heroSlides: Array.isArray(nextHeroSlides) ? nextHeroSlides : [],
        metadata: {
          ...(currentSettings.metadata || {}),
          heroAnimation,
        },
      });
    },
    onSuccess: async () => {
      showSuccess('Hero banners saved');
      await queryClient.invalidateQueries({ queryKey: ['store', 'settings'] });
    },
    onError: (error) => showError(error, 'Could not save hero banners'),
  });

  const handleSaveHero = useCallback(
    (payload) => saveHeroMutation.mutateAsync(payload),
    [saveHeroMutation],
  );

  /**
   * Apply a template (in-app gallery or public `?template=` deep-link).
   * New stores continue to Store Setup; existing stores save and stay on the hub.
   * @param {string} templateId
   * @param {{ closeGallery?: boolean }} [options]
   */
  const applyTemplateFromGallery = useCallback(async (templateId, options = {}) => {
    const { closeGallery = false } = options;
    const id = normalizeTemplateId(templateId);
    setApplyingTemplate(true);
    setSelectingTemplateId(id);
    try {
      if (hasStoreSettings) {
        let currentSettings = settings;
        if (!currentSettings) {
          const fetched = await storeService.getSettings();
          currentSettings = fetched?.data ?? fetched;
        }
        if (!currentSettings) {
          throw new Error('Store settings unavailable');
        }
        const mergedColors = mergeColorsForTemplate(id, {
          primaryColor: currentSettings.primaryColor,
          secondaryColor: currentSettings.secondaryColor || null,
          tertiaryColor: currentSettings.tertiaryColor || null,
        });
        await storeService.updateSettings({
          displayName: currentSettings.displayName,
          slug: currentSettings.slug,
          description: currentSettings.description,
          logoUrl: currentSettings.logoUrl,
          primaryColor: mergedColors.primaryColor,
          secondaryColor: mergedColors.secondaryColor || null,
          tertiaryColor: mergedColors.tertiaryColor || null,
          contactPhone: currentSettings.contactPhone,
          whatsappNumber: currentSettings.whatsappNumber,
          contactEmail: currentSettings.contactEmail,
          pickupEnabled: currentSettings.pickupEnabled,
          deliveryEnabled: currentSettings.deliveryEnabled,
          deliveryFee: currentSettings.deliveryFee,
          currency: resolveStoreCurrencyCode(currentSettings.currency),
          enabled: currentSettings.enabled,
          templateId: id,
          metadata: {
            ...(currentSettings.metadata || {}),
            templateChosen: true,
          },
        });
        showSuccess(`${getStoreTemplate(id).name} template saved`);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['store', 'domain'] }),
          queryClient.invalidateQueries({ queryKey: ['store', 'settings'] }),
        ]);
        clearTemplateQuery();
        if (closeGallery) setGalleryOpen(false);
      } else {
        clearTemplateQuery();
        if (closeGallery) setGalleryOpen(false);
        navigate(`/store/setup?template=${encodeURIComponent(id)}`);
      }
    } catch (error) {
      showError(error, 'Could not save template');
      appliedDeepLinkRef.current = null;
      clearTemplateQuery();
    } finally {
      setApplyingTemplate(false);
      setSelectingTemplateId(null);
    }
  }, [clearTemplateQuery, hasStoreSettings, navigate, queryClient, settings]);

  const handleGallerySelect = useCallback(
    (templateId) => applyTemplateFromGallery(templateId, { closeGallery: true }),
    [applyTemplateFromGallery],
  );

  // Public gallery / marketing deep-link → /online-store?template=<id>
  useEffect(() => {
    if (!hasDeepLink || isLoading) return;
    if (hasStoreSettings && (settingsLoading || !settings)) return;
    if (appliedDeepLinkRef.current === deepLinkTemplate) return;

    appliedDeepLinkRef.current = deepLinkTemplate;
    applyTemplateFromGallery(deepLinkTemplate);
  }, [
    applyTemplateFromGallery,
    deepLinkTemplate,
    hasDeepLink,
    hasStoreSettings,
    isLoading,
    settings,
    settingsLoading,
  ]);

  const liveStoreUrl = useMemo(
    () => (
      data.slug || data.customDomain
        ? buildOnlineStoreUrl(data.slug, {
          preview: settings?.enabled !== true,
          customDomain: data.customDomain,
          customDomainStatus: data.customDomainStatus || domainStatus,
        })
        : ''
    ),
    [data.customDomain, data.customDomainStatus, data.slug, domainStatus, settings?.enabled],
  );

  const dnsRecord = useMemo(
    () => buildDnsRecord(data.customDomain, cnameTarget, data),
    [data, cnameTarget],
  );

  const storeName = useMemo(
    () => data.displayName || galleryPreviewBranding.displayName || activeTenant?.name || 'Your store',
    [activeTenant?.name, data.displayName, galleryPreviewBranding.displayName],
  );

  const saveMutation = useMutation({
    mutationFn: (customDomain) => storeService.updateDomain(customDomain),
    onSuccess: () => {
      showSuccess('Domain saved. Add the DNS record below at your domain provider.');
      queryClient.invalidateQueries({ queryKey: ['store', 'domain'] });
    },
    onError: (error) => showError(error, 'Could not save domain'),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => storeService.updateDomain(''),
    onSuccess: () => {
      showSuccess('Custom domain disconnected');
      queryClient.invalidateQueries({ queryKey: ['store', 'domain'] });
    },
    onError: (error) => showError(error, 'Could not disconnect domain'),
  });

  const handleSave = useCallback((event) => {
    event.preventDefault();
    saveMutation.mutate(domainInput.trim());
  }, [domainInput, saveMutation]);

  const handleCopyAllRecord = useCallback(async () => {
    if (!dnsRecord) return;
    const text = dnsRecord.records
      .map((record) => `Type: ${record.type}\nHost / Name: ${record.host}\nValue / Target / Points to: ${record.value}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(dnsRecord.records.length > 1 ? 'DNS records copied' : 'DNS record copied');
    } catch {
      showError('Could not copy to clipboard');
    }
  }, [dnsRecord]);

  if (isLoading || (hasDeepLink && (applyingTemplate || (hasStoreSettings && settingsLoading)))) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        {hasDeepLink ? (
          <p className="text-sm text-muted-foreground">
            Applying {getStoreTemplate(deepLinkTemplate).name} template…
          </p>
        ) : null}
      </div>
    );
  }

  // First-run: single rich welcome → in-app template gallery modal
  if (!hasStoreSettings && !hasDeepLink) {
    return (
      <>
        <OnlineStoreWelcome onStartSetup={() => setGalleryOpen(true)} />
        <StoreTemplateGalleryModal
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
          onSelect={handleGallerySelect}
          selectingId={selectingTemplateId}
          previewBranding={galleryPreviewBranding}
        />
      </>
    );
  }

  return (
    <>
      <OnlineStoreDashboard
        storeName={storeName}
        liveStoreUrl={liveStoreUrl}
        isPublished={settings?.enabled === true}
        domainStatus={domainStatus}
        domainInput={domainInput}
        onDomainInputChange={setDomainInput}
        customDomain={data.customDomain || ''}
        cnameTarget={cnameTarget}
        dnsRecord={dnsRecord}
        onSaveDomain={handleSave}
        onDisconnectDomain={() => disconnectMutation.mutate()}
        onCopyAllRecord={handleCopyAllRecord}
        onChangeTemplate={() => setGalleryOpen(true)}
        primaryColor={settings?.primaryColor || galleryPreviewBranding.primaryColor}
        heroSlides={settings?.heroSlides || []}
        heroAnimation={settings?.metadata?.heroAnimation || 'fade'}
        onSaveHero={handleSaveHero}
        heroSaving={saveHeroMutation.isPending}
        heroOpen={heroOpen}
        onHeroOpenChange={setHeroOpen}
        testimonials={settings?.metadata?.testimonials || null}
        onSaveTestimonials={handleSaveTestimonials}
        testimonialsSaving={saveTestimonialsMutation.isPending}
        testimonialsOpen={testimonialsOpen}
        onTestimonialsOpenChange={setTestimonialsOpen}
        productSections={settings?.metadata?.productSections || null}
        onSaveProductSections={handleSaveProductSections}
        productSectionsSaving={saveProductSectionsMutation.isPending}
        productSectionsOpen={productSectionsOpen}
        onProductSectionsOpenChange={setProductSectionsOpen}
        productCardActions={settings?.metadata?.productCardActions || null}
        onSaveProductCardActions={handleSaveProductCardActions}
        productCardActionsSaving={saveProductCardActionsMutation.isPending}
        productCardActionsOpen={productCardActionsOpen}
        onProductCardActionsOpenChange={setProductCardActionsOpen}
        whatsappNumber={settings?.whatsappNumber || galleryPreviewBranding.whatsappNumber}
        contactPhone={settings?.contactPhone || galleryPreviewBranding.contactPhone}
        productsOpen={productsOpen}
        onProductsOpenChange={setProductsOpen}
        editOpen={editOpen}
        onEditOpenChange={setEditOpen}
        savePending={saveMutation.isPending}
        disconnectPending={disconnectMutation.isPending}
      />

      <StoreTemplateGalleryModal
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onSelect={handleGallerySelect}
        currentTemplateId={currentTemplateId}
        selectingId={selectingTemplateId}
        title="Change storefront layout"
        description="Switch layouts anytime. Your products and branding stay — only the look changes."
        previewBranding={galleryPreviewBranding}
      />
    </>
  );
};

export default OnlineStore;
