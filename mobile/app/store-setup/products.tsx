import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { AppIcon } from '@/components/AppIcon';
import { FormSheetModal } from '@/components/FormSheetModal';
import { FormInput, FormLabel } from '@/components/FormField';
import { StoreSetupChrome } from '@/components/store/StoreSetupChrome';
import { useAuth } from '@/context/AuthContext';
import { useStoreSetup, type StoreSetupProduct } from '@/context/StoreSetupContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { storeService } from '@/services/storeService';
import { formatCurrency } from '@/utils/formatCurrency';
import { getErrorMessage } from '@/utils/errorMessages';
import { resolveImageUrl } from '@/utils/fileUtils';
import { BRAND_GREEN } from '@/constants/brand';
import { FontFamily, FontSize } from '@/constants/typography';

type PublishDraft = {
  title: string;
  description: string;
  price: string;
  imageUrl: string;
};

function productPublishable(product: StoreSetupProduct): { ok: boolean; reason?: string } {
  const price = Number(product.sellingPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: 'Needs a selling price' };
  }
  const image = String(product.imageUrl || '').trim();
  if (!image || image === 'null' || image === 'undefined') {
    return { ok: false, reason: 'Needs a photo' };
  }
  return { ok: true };
}

function draftFromProduct(product: StoreSetupProduct, existing?: PublishDraft): PublishDraft {
  return {
    title: existing?.title ?? String(product.name || ''),
    description: existing?.description ?? String(product.description || ''),
    price: existing?.price ?? String(product.sellingPrice ?? ''),
    imageUrl: existing?.imageUrl ?? String(product.imageUrl || ''),
  };
}

function draftPublishable(draft: PublishDraft): { ok: boolean; reason?: string } {
  const title = draft.title.trim();
  if (!title) return { ok: false, reason: 'Name is required' };
  const price = Number(draft.price);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: 'Enter a valid price' };
  }
  const image = String(draft.imageUrl || '').trim();
  if (!image) return { ok: false, reason: 'Add a product photo' };
  return { ok: true };
}

/**
 * Step 6 — Multi-select stock products to publish online. Skip is OK.
 * Tapping a product opens a Menu-style sheet to confirm/edit listing details.
 */
export default function StoreSetupProductsScreen() {
  const { hasFeature } = useAuth();
  const { textColor, mutedColor, borderColor, cardBg } = useScreenColors();
  const { gapFlags, products, productsLoading, ensureProductsLoaded, advanceFrom } = useStoreSetup();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, PublishDraft>>({});
  const [editingProduct, setEditingProduct] = useState<StoreSetupProduct | null>(null);
  const [editDraft, setEditDraft] = useState<PublishDraft | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    void ensureProductsLoaded();
  }, [ensureProductsLoaded]);

  const rows = useMemo(
    () =>
      products.map((product) => ({
        product,
        publishable: productPublishable(product),
      })),
    [products]
  );

  const openEditor = useCallback(
    (product: StoreSetupProduct) => {
      setEditingProduct(product);
      setEditDraft(draftFromProduct(product, drafts[product.id]));
    },
    [drafts]
  );

  const closeEditor = useCallback(() => {
    setEditingProduct(null);
    setEditDraft(null);
  }, []);

  const confirmDraft = useCallback(() => {
    if (!editingProduct || !editDraft) return;
    const check = draftPublishable(editDraft);
    if (!check.ok) {
      Alert.alert('Almost ready', check.reason || 'Complete the listing details.');
      return;
    }
    setDrafts((prev) => ({ ...prev, [editingProduct.id]: { ...editDraft } }));
    setSelected((prev) => {
      const next = new Set(prev);
      next.add(editingProduct.id);
      return next;
    });
    closeEditor();
  }, [closeEditor, editDraft, editingProduct]);

  const removeFromPublish = useCallback(() => {
    if (!editingProduct) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(editingProduct.id);
      return next;
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[editingProduct.id];
      return next;
    });
    closeEditor();
  }, [closeEditor, editingProduct]);

  const pickImage = useCallback(async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Allow camera access to take a product photo.');
          return;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Allow photo library access to choose an image.');
          return;
        }
      }
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
        aspect: [1, 1],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingImage(true);
      try {
        const uploaded = await storeService.uploadStoreAsset(
          asset.uri,
          asset.mimeType ?? 'image/jpeg',
          asset.fileName
        );
        if (!uploaded) throw new Error('Upload returned no URL');
        setEditDraft((prev) => (prev ? { ...prev, imageUrl: String(uploaded) } : prev));
      } catch (error) {
        Alert.alert('Upload failed', getErrorMessage(error, 'Could not upload image.'));
      } finally {
        setUploadingImage(false);
      }
    } catch (error) {
      Alert.alert('Could not open camera', getErrorMessage(error, 'Try again.'));
    }
  }, []);

  const chooseImageSource = useCallback(() => {
    Alert.alert('Product photo', 'Add an image for this listing', [
      { text: 'Take photo', onPress: () => void pickImage(true) },
      { text: 'Choose from library', onPress: () => void pickImage(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickImage]);

  const publishSelected = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) {
      advanceFrom('products');
      return;
    }

    setPublishing(true);
    try {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const product = products.find((p) => p.id === id);
          if (!product) throw new Error('missing');
          const draft = drafts[id] ?? draftFromProduct(product);
          const check = draftPublishable(draft);
          if (!check.ok) throw new Error(check.reason || 'not publishable');
          await storeService.createOrUpdateProductListing(product.id, {
            title: draft.title.trim(),
            shortDescription: String(draft.description || draft.title).trim().slice(0, 280),
            description: draft.description.trim() || null,
            publicPrice: Number(draft.price),
            images: [String(draft.imageUrl)],
            status: 'published',
          });
        })
      );
      const failureCount = results.filter((r) => r.status === 'rejected').length;
      if (failureCount) {
        Alert.alert(
          'Some products skipped',
          `${failureCount} could not be published. You can finish them later from the store.`
        );
      }
      advanceFrom('products');
    } catch (error) {
      Alert.alert('Could not publish', getErrorMessage(error, 'Failed to publish products.'));
    } finally {
      setPublishing(false);
    }
  }, [advanceFrom, drafts, products, selected]);

  const onSkip = useCallback(() => {
    advanceFrom('products');
  }, [advanceFrom]);

  if (!hasFeature('paymentsExpenses')) {
    return <FeatureAccessDenied message="Online store is not enabled for your workspace." />;
  }

  if (productsLoading && !products.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BRAND_GREEN} />
      </View>
    );
  }

  const isEditingSelected = editingProduct ? selected.has(editingProduct.id) : false;
  const previewUri = editDraft?.imageUrl ? resolveImageUrl(editDraft.imageUrl) : '';

  return (
    <StoreSetupChrome
      stepId="products"
      gapFlags={gapFlags}
      onSkip={onSkip}
      skipLabel="Skip for now"
      onContinue={() => {
        void publishSelected();
      }}
      continueLabel={selected.size ? `Publish ${selected.size}` : 'Continue'}
      continuing={publishing}
      hideFooter={false}
    >
      <Text style={[styles.headline, { color: textColor }]}>What will you sell?</Text>
      <Text style={[styles.body, { color: mutedColor }]}>
        Pick products from your stock. Review name, price, and photo before they go live. You can skip and add later.
      </Text>

      {!rows.length ? (
        <Text style={[styles.empty, { color: mutedColor }]}>
          No active products yet. Skip and add stock later, then publish from the store.
        </Text>
      ) : (
        <View style={styles.list}>
          {rows.map(({ product, publishable }) => {
            const active = selected.has(product.id);
            const draft = drafts[product.id];
            const displayImage = draft?.imageUrl || product.imageUrl;
            const uri =
              publishable.ok || draft
                ? resolveImageUrl(String(displayImage || ''))
                : '';
            return (
              <Pressable
                key={product.id}
                onPress={() => openEditor(product)}
                style={({ pressed }) => [
                  styles.row,
                  { borderColor, backgroundColor: cardBg, opacity: publishable.ok || active ? 1 : 0.7 },
                  active && { borderColor: BRAND_GREEN },
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.thumb, { borderColor }]}>
                  {uri ? (
                    <Image source={{ uri }} style={styles.thumbImg} />
                  ) : (
                    <AppIcon name="package" size={20} color={mutedColor} />
                  )}
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: textColor }]} numberOfLines={1}>
                    {draft?.title || product.name}
                  </Text>
                  <Text style={[styles.rowMeta, { color: mutedColor }]}>
                    {publishable.ok || draft
                      ? formatCurrency(Number(draft?.price ?? product.sellingPrice))
                      : publishable.reason}
                  </Text>
                </View>
                <View
                  style={[
                    styles.check,
                    {
                      borderColor: active ? BRAND_GREEN : borderColor,
                      backgroundColor: active ? BRAND_GREEN : 'transparent',
                    },
                  ]}
                >
                  {active ? <AppIcon name="check" size={14} color="#fff" /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <FormSheetModal
        visible={!!editingProduct && !!editDraft}
        title="Publish product"
        onClose={closeEditor}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <View style={styles.sheetFooter}>
            {isEditingSelected ? (
              <Pressable
                onPress={removeFromPublish}
                style={[styles.secondaryBtn, { borderColor }]}
                accessibilityRole="button"
                accessibilityLabel="Remove from publish list"
              >
                <Text style={[styles.secondaryBtnText, { color: textColor }]}>Remove</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={confirmDraft}
              style={styles.primaryBtn}
              accessibilityRole="button"
              accessibilityLabel={isEditingSelected ? 'Update listing' : 'Add to publish list'}
            >
              <Text style={styles.primaryBtnText}>
                {isEditingSelected ? 'Update' : 'Add to publish list'}
              </Text>
            </Pressable>
          </View>
        }
      >
        {editDraft ? (
          <>
            <Pressable
              onPress={chooseImageSource}
              disabled={uploadingImage}
              style={[styles.imagePicker, { borderColor }]}
            >
              {uploadingImage ? (
                <ActivityIndicator color={BRAND_GREEN} />
              ) : previewUri ? (
                <Image source={{ uri: previewUri }} style={styles.imagePreview} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <AppIcon name="camera" size={22} color={mutedColor} />
                  <Text style={[styles.imageHint, { color: mutedColor }]}>Add photo</Text>
                </View>
              )}
            </Pressable>

            <FormLabel>Name</FormLabel>
            <FormInput
              value={editDraft.title}
              onChangeText={(title) => setEditDraft((prev) => (prev ? { ...prev, title } : prev))}
              placeholder="Product name"
            />

            <FormLabel optional>Description</FormLabel>
            <FormInput
              value={editDraft.description}
              onChangeText={(description) =>
                setEditDraft((prev) => (prev ? { ...prev, description } : prev))
              }
              placeholder="Short description for your store"
              multiline
            />

            <FormLabel>Price</FormLabel>
            <FormInput
              value={editDraft.price}
              onChangeText={(price) => setEditDraft((prev) => (prev ? { ...prev, price } : prev))}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          </>
        ) : null}
      </FormSheetModal>
    </StoreSetupChrome>
  );
}

const styles = StyleSheet.create({
  headline: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.display,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    lineHeight: 24,
    marginTop: -4,
  },
  empty: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    lineHeight: 22,
    marginTop: 8,
  },
  list: {
    gap: 10,
  },
  row: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  rowMeta: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.88 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheetFooter: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 1.4,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: BRAND_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  imagePicker: {
    height: 160,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
    gap: 6,
  },
  imageHint: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
});
