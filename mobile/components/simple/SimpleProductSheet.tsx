import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppBottomSheet, APP_SHEET_HEIGHT_TALL } from '@/components/AppBottomSheet';
import { AppIcon } from '@/components/AppIcon';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { SimpleBigButton, SimpleField, simpleStyles } from '@/components/simple/SimpleUI';
import { useScreenColors } from '@/hooks/useScreenColors';
import { productService } from '@/services/productService';
import { resolveImageUrl } from '@/utils/fileUtils';
import { formatCurrency } from '@/utils/formatCurrency';
import { getApiErrorMessage } from '@/utils/parseApiListResponse';
import { FontFamily } from '@/constants/typography';

type AnyProduct = Record<string, any>;
const numberText = (value: unknown) => (value === null || value === undefined || value === '' ? '' : String(Number(value)));
const cleanNumber = (text: string) => text.replace(/[^\d.]/g, '');

/**
 * Simple Mode product form: photo, name, selling price, cost (optional), how many are in stock
 * and a barcode (typed, from a Bluetooth scanner, or scanned with the camera). Stock changes on
 * an existing product go through adjust-stock so a stock movement is recorded.
 */
export function SimpleProductSheet({ visible, product, onClose }: {
  visible: boolean; product: AnyProduct | null; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { textColor, mutedColor, borderColor, cardBg } = useScreenColors();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [quantity, setQuantity] = useState('');
  const [barcode, setBarcode] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState('');
  const [variantDraft, setVariantDraft] = useState<null | {
    id?: string; size: string; color: string; price: string; quantity: string;
  }>(null);
  const variantsQuery = useQuery({
    queryKey: ['simple', 'product-variants', product?.id],
    queryFn: () => productService.getProductVariants(String(product?.id)),
    enabled: visible && Boolean(product?.id),
  });
  const variantRows = (() => {
    const body = variantsQuery.data as { data?: AnyProduct[] } | AnyProduct[] | undefined;
    if (Array.isArray(body)) return body;
    if (body && Array.isArray(body.data)) return body.data;
    return Array.isArray(product?.variants) ? product.variants as AnyProduct[] : [];
  })();
  const hasVariants = Boolean(product?.hasVariants) || variantRows.length > 0;

  useEffect(() => {
    if (!visible) return;
    setName(product?.name || '');
    setPrice(numberText(product?.sellingPrice));
    setCost(Number(product?.costPrice) > 0 ? numberText(product?.costPrice) : '');
    setQuantity(product ? numberText(product.quantityOnHand ?? 0) : '');
    setBarcode(product?.barcode || '');
    setImageUri(null);
    setVariantDraft(null);
    setError('');
  }, [visible, product]);

  const pickPhoto = async (from: 'camera' | 'library') => {
    try {
      const permission = from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') return;
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const result = from === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
    } catch {
      // picker dismissed or unavailable
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const imageUrl = imageUri ? await productService.uploadProductImage(imageUri) : undefined;
      const sellingPrice = Number(price);
      const costPrice = cost === '' ? undefined : Number(cost);
      const qty = quantity === '' ? 0 : Math.max(0, Number(quantity));
      const base = {
        name: name.trim(),
        sellingPrice,
        ...(costPrice !== undefined ? { costPrice } : {}),
        barcode: barcode.trim() || undefined,
        ...(imageUrl ? { imageUrl } : {}),
      };
      if (!product?.id) {
        return productService.createProduct({ ...base, quantityOnHand: qty, trackStock: true });
      }
      const result = await productService.updateProduct(String(product.id), base);
      if (!product.hasVariants && qty !== Number(product.quantityOnHand ?? 0)) {
        await productService.adjustStock(String(product.id), qty, 'set', 'Stock count (Simple Mode)', { type: 'adjustment' });
      }
      return result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['simple'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
    onError: (err: unknown) => Alert.alert('Product', getApiErrorMessage(err, 'Could not save this product.')),
  });

  const saveVariant = useMutation({
    mutationFn: async () => {
      if (!product?.id || !variantDraft) return null;
      const size = variantDraft.size.trim();
      const color = variantDraft.color.trim();
      const variantName = size || color;
      if (!variantName) throw new Error('Enter a size or colour.');
      if (variantDraft.price === '' || !Number.isFinite(Number(variantDraft.price))) throw new Error('Enter the selling price.');
      const attributes: Record<string, string> = {};
      if (size) attributes.size = size;
      if (color) attributes.color = color;
      const payload = {
        name: variantName,
        sellingPrice: Number(variantDraft.price),
        quantityOnHand: variantDraft.quantity === '' ? 0 : Math.max(0, Number(variantDraft.quantity)),
        attributes,
      };
      if (variantDraft.id) return productService.updateProductVariant(variantDraft.id, payload);
      return productService.createProductVariant(String(product.id), payload);
    },
    onSuccess: () => {
      setVariantDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['simple', 'product-variants', product?.id] });
      void queryClient.invalidateQueries({ queryKey: ['simple'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: unknown) => Alert.alert('Size or colour', getApiErrorMessage(err, 'Could not save this option.')),
  });

  const removeVariant = (variant: AnyProduct) => {
    Alert.alert('Delete size or colour', `Delete "${variant.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void productService.deleteProductVariant(String(variant.id)).then(() => {
            void queryClient.invalidateQueries({ queryKey: ['simple', 'product-variants', product?.id] });
            void queryClient.invalidateQueries({ queryKey: ['simple'] });
          }).catch((err: unknown) => Alert.alert('Size or colour', getApiErrorMessage(err, 'Could not delete this option.')));
        },
      },
    ]);
  };

  const handleSave = () => {
    if (name.trim().length < 2) return setError('Enter the product name.');
    if (price === '' || !Number.isFinite(Number(price))) return setError('Enter the selling price.');
    save.mutate();
    return undefined;
  };

  const preview = imageUri || resolveImageUrl(product?.imageUrl) || null;
  const inputStyle = [simpleStyles.input, { borderColor, color: textColor, backgroundColor: cardBg }];

  const openVariant = (variant?: AnyProduct) => {
    setError('');
    setVariantDraft({
      id: variant?.id ? String(variant.id) : undefined,
      size: variant?.attributes?.size || '',
      color: variant?.attributes?.color || '',
      price: numberText(variant?.sellingPrice ?? product?.sellingPrice),
      quantity: variant ? numberText(variant.quantityOnHand ?? 0) : '',
    });
  };

  return (
    <AppBottomSheet visible={visible} title={product ? 'Edit Product' : 'Add Product'} onClose={onClose} height={APP_SHEET_HEIGHT_TALL}>
        <View style={{ gap: 16, paddingBottom: 24 }}>
          <View style={styles.photoRow}>
            <View style={[styles.photo, { borderColor, backgroundColor: cardBg }]}>
              {preview ? <Image source={{ uri: preview }} style={styles.photoImage} /> : <AppIcon name="package" size={40} color={mutedColor} />}
            </View>
            <View style={{ flex: 1, gap: 10 }}>
              <SimpleBigButton label="Take photo" icon="camera" variant="outline" onPress={() => { void pickPhoto('camera'); }} />
              <SimpleBigButton label="Choose photo" icon="image" variant="outline" onPress={() => { void pickPhoto('library'); }} />
            </View>
          </View>

          <SimpleField label="Product name">
            <TextInput value={name} onChangeText={(t) => { setName(t); setError(''); }} placeholder="e.g. Bel Aqua 500ml"
              placeholderTextColor={mutedColor} style={inputStyle} accessibilityLabel="Product name" />
          </SimpleField>
          <View style={styles.twoCols}>
            <View style={{ flex: 1 }}>
              <SimpleField label="Selling price (₵)">
                <TextInput value={price} onChangeText={(t) => { setPrice(cleanNumber(t)); setError(''); }} placeholder="0.00"
                  placeholderTextColor={mutedColor} keyboardType="decimal-pad" style={inputStyle} accessibilityLabel="Selling price" />
              </SimpleField>
            </View>
            <View style={{ flex: 1 }}>
              <SimpleField label="Cost (₵)" hint="Optional">
                <TextInput value={cost} onChangeText={(t) => setCost(cleanNumber(t))} placeholder="0.00"
                  placeholderTextColor={mutedColor} keyboardType="decimal-pad" style={inputStyle} accessibilityLabel="What it cost you" />
              </SimpleField>
            </View>
          </View>
          {hasVariants ? (
            <Text style={{ color: mutedColor, fontFamily: FontFamily.regular }}>Stock is counted on each size or colour.</Text>
          ) : (
            <SimpleField label="How many do you have?">
              <TextInput value={quantity} onChangeText={(t) => setQuantity(cleanNumber(t))} placeholder="0"
                placeholderTextColor={mutedColor} keyboardType="number-pad" style={inputStyle} accessibilityLabel="Quantity in stock" />
            </SimpleField>
          )}
          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: textColor }]}>Sizes and colours (optional)</Text>
            {product?.id ? (
              <>
                {variantRows.length === 0 ? (
                  <Text style={{ color: mutedColor, fontFamily: FontFamily.regular }}>No sizes or colours yet.</Text>
                ) : variantRows.map((variant) => (
                  <Pressable
                    key={String(variant.id)}
                    onPress={() => openVariant(variant)}
                    style={[styles.variantRow, { borderColor }]}
                    accessibilityRole="button"
                    accessibilityLabel={String(variant.name || 'Size or colour')}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.variantName, { color: textColor }]}>{variant.name}</Text>
                      <Text style={{ color: mutedColor, fontFamily: FontFamily.regular }}>Stock: {variant.quantityOnHand ?? 0}</Text>
                    </View>
                    <Text style={[styles.variantName, { color: textColor }]}>{formatCurrency(variant.sellingPrice ?? product?.sellingPrice)}</Text>
                    <Pressable onPress={() => removeVariant(variant)} accessibilityRole="button" accessibilityLabel={`Delete ${variant.name}`}>
                      <AppIcon name="trash" size={18} color="#b91c1c" />
                    </Pressable>
                  </Pressable>
                ))}
                {variantDraft ? (
                  <View style={{ gap: 10 }}>
                    <SimpleField label="Size (optional)">
                      <TextInput value={variantDraft.size} onChangeText={(t) => setVariantDraft({ ...variantDraft, size: t })} placeholder="e.g. Medium"
                        placeholderTextColor={mutedColor} style={inputStyle} accessibilityLabel="Variant size" />
                    </SimpleField>
                    <SimpleField label="Colour (optional)">
                      <TextInput value={variantDraft.color} onChangeText={(t) => setVariantDraft({ ...variantDraft, color: t })} placeholder="e.g. Blue"
                        placeholderTextColor={mutedColor} style={inputStyle} accessibilityLabel="Variant colour" />
                    </SimpleField>
                    <SimpleField label="Selling price (₵)">
                      <TextInput value={variantDraft.price} onChangeText={(t) => setVariantDraft({ ...variantDraft, price: cleanNumber(t) })} placeholder="0.00"
                        placeholderTextColor={mutedColor} keyboardType="decimal-pad" style={inputStyle} accessibilityLabel="Variant price" />
                    </SimpleField>
                    <SimpleField label="How many do you have?">
                      <TextInput value={variantDraft.quantity} onChangeText={(t) => setVariantDraft({ ...variantDraft, quantity: cleanNumber(t) })} placeholder="0"
                        placeholderTextColor={mutedColor} keyboardType="number-pad" style={inputStyle} accessibilityLabel="Variant quantity" />
                    </SimpleField>
                    <SimpleBigButton label="Cancel" variant="outline" onPress={() => setVariantDraft(null)} />
                    <SimpleBigButton label={variantDraft.id ? 'Save size or colour' : 'Add size or colour'} icon="check" onPress={() => saveVariant.mutate()} loading={saveVariant.isPending} />
                  </View>
                ) : (
                  <SimpleBigButton label="Add size or colour" icon="plus" variant="outline" onPress={() => openVariant()} />
                )}
              </>
            ) : (
              <Text style={{ color: mutedColor, fontFamily: FontFamily.regular }}>Save the product first, then you can add sizes or colours.</Text>
            )}
          </View>
          <SimpleField label="Barcode (optional)" hint="Tap Scan to use the camera, or scan into the box with a scanner.">
            <View style={styles.barcodeRow}>
              <TextInput value={barcode} onChangeText={setBarcode} placeholder="Barcode number"
                placeholderTextColor={mutedColor} autoCapitalize="none" autoCorrect={false}
                style={[...inputStyle, { flex: 1 }]} accessibilityLabel="Barcode" />
              <Pressable
                onPress={() => setScannerOpen(true)}
                style={[styles.scanButton, { borderColor }]}
                accessibilityRole="button"
                accessibilityLabel="Scan barcode"
              >
                <AppIcon name="camera" size={22} color={textColor} />
                <Text style={[styles.scanText, { color: textColor }]}>Scan</Text>
              </Pressable>
            </View>
          </SimpleField>

          {error ? <Text style={simpleStyles.error}>{error}</Text> : null}
          <SimpleBigButton label={product ? 'Save changes' : 'Save product'} icon="check" onPress={handleSave} loading={save.isPending} />
        </View>
      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => { setBarcode(code); setScannerOpen(false); }}
      />
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 16, fontFamily: FontFamily.semiBold },
  variantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 12 },
  variantName: { fontSize: 16, fontFamily: FontFamily.semiBold },
  photoRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  photo: { width: 120, height: 120, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%' },
  twoCols: { flexDirection: 'row', gap: 12 },
  barcodeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  scanButton: { height: 60, borderWidth: 2, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  scanText: { fontSize: 16, fontFamily: FontFamily.semiBold },
});
