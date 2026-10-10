import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { AppIcon } from '@/components/AppIcon';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { StoreSetupChrome } from '@/components/store/StoreSetupChrome';
import { useAuth } from '@/context/AuthContext';
import { useStoreSetup, useStoreSetupEditing } from '@/context/StoreSetupContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { storeService } from '@/services/storeService';
import { getErrorMessage } from '@/utils/errorMessages';
import { firstFilled, resolveStoreLogoUrl } from '@/utils/onlineStoreDefaults';
import { resolveImageUrl } from '@/utils/fileUtils';
import { BRAND_GREEN } from '@/constants/brand';

const LOGO_SIZE = 140;

/**
 * Step 3 — Optional logo. Prefills business/org logo (same sources as web StoreSetup).
 * Circular preview; tap opens Take photo / Choose from library (products pattern).
 * Upload matches web: POST /store/listings/upload-images → `/uploads/store-listings/...`.
 * Continue / Skip navigate immediately; logo persist is background when a URL is set.
 */
export default function StoreSetupLogoScreen() {
  const { hasFeature } = useAuth();
  const { textColor, mutedColor, borderColor, bg } = useScreenColors();
  const {
    loading,
    defaults,
    settings,
    organization,
    gapFlags,
    persistSoftAndAdvance,
    advanceFrom,
    saveLiveEdit,
    closeEditor,
  } = useStoreSetup();
  const editing = useStoreSetupEditing();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Prefer store settings, then org/tenant defaults (web resolveStoreLogoUrl order).
    const existing = firstFilled(
      settings?.logoUrl,
      resolveStoreLogoUrl(settings, organization, defaults),
      defaults.logoUrl
    );
    if (existing) setLogoUrl(existing);
  }, [defaults, defaults.logoUrl, organization, settings, settings?.logoUrl]);

  const uploadFromAsset = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    setUploading(true);
    try {
      // Same as Frontend StoreSetup handleAssetUpload → uploadStoreAsset.
      const url = await storeService.uploadStoreAsset(
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
        asset.fileName
      );
      if (!url) throw new Error('Upload returned no URL');
      setLogoUrl(url);
    } catch (error) {
      Alert.alert('Upload failed', getErrorMessage(error, 'Could not upload logo.'));
    } finally {
      setUploading(false);
    }
  }, []);

  const takePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera access to take a logo photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]) return;
      await uploadFromAsset(result.assets[0]);
    } catch (error) {
      Alert.alert('Camera failed', getErrorMessage(error, 'Could not take photo.'));
    }
  }, [uploadFromAsset]);

  const chooseFromLibrary = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo library access to upload a logo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]) return;
      await uploadFromAsset(result.assets[0]);
    } catch (error) {
      Alert.alert('Photo picker failed', getErrorMessage(error, 'Could not choose logo.'));
    }
  }, [uploadFromAsset]);

  const openLogoPicker = useCallback(() => {
    if (uploading) return;
    Alert.alert('Store logo', 'Add a logo using your camera or photo library.', [
      { text: 'Take photo', onPress: () => void takePhoto() },
      { text: 'Choose from library', onPress: () => void chooseFromLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [chooseFromLibrary, takePhoto, uploading]);

  const onContinue = useCallback(async () => {
    if (editing) {
      if (!logoUrl || logoUrl === settings?.logoUrl) {
        closeEditor();
        return;
      }
      setSaving(true);
      try {
        await saveLiveEdit({ logoUrl });
        closeEditor();
      } catch (error) {
        Alert.alert('Could not save', getErrorMessage(error, 'Failed to save logo.'));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (logoUrl) {
      persistSoftAndAdvance('logo', { logoUrl }, { logoUrl });
      return;
    }
    advanceFrom('logo');
  }, [advanceFrom, closeEditor, editing, logoUrl, persistSoftAndAdvance, saveLiveEdit, settings?.logoUrl]);

  const onSkip = useCallback(() => {
    advanceFrom('logo');
  }, [advanceFrom]);

  if (!hasFeature('paymentsExpenses')) {
    return <FeatureAccessDenied message="Online store is not enabled for your workspace." />;
  }

  if (editing && loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BRAND_GREEN} />
      </View>
    );
  }

  const preview = logoUrl ? resolveImageUrl(logoUrl) : '';

  return (
    <StoreSetupChrome
      stepId="logo"
      gapFlags={gapFlags}
      onSkip={editing ? undefined : onSkip}
      skipLabel="Skip"
      onContinue={() => {
        void onContinue();
      }}
      continueLabel={editing ? 'Save' : logoUrl ? 'Continue' : 'Continue without logo'}
      continuing={uploading || saving}
      editing={editing}
    >
      <Text style={[styles.headline, { color: textColor }]}>{editing ? 'Store logo' : 'Add your logo'}</Text>
      <Text style={[styles.body, { color: mutedColor }]}>
        {editing
          ? 'Customers see this on your online store.'
          : 'Optional — your store looks more trustworthy with a logo. You can skip and add it later.'}
      </Text>

      <View style={styles.logoSection}>
        <View style={styles.logoWrap}>
          <Pressable
            onPress={openLogoPicker}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel={preview ? 'Change store logo' : 'Upload store logo'}
            style={({ pressed }) => [
              styles.logoCircle,
              { borderColor, backgroundColor: bg },
              pressed && styles.pressed,
            ]}
          >
            {uploading ? (
              <ActivityIndicator color={BRAND_GREEN} />
            ) : preview ? (
              <Image source={{ uri: preview }} style={styles.logoImage} contentFit="cover" />
            ) : (
              <AppIcon name="camera" size={40} color={BRAND_GREEN} />
            )}
          </Pressable>
          {preview && !uploading ? (
            <Pressable
              onPress={openLogoPicker}
              accessibilityRole="button"
              accessibilityLabel="Change store logo"
              style={[styles.cameraBadge, { backgroundColor: BRAND_GREEN, borderColor: bg }]}
            >
              <AppIcon name="camera" size={16} color="#fff" />
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.hint, { color: mutedColor }]}>
          {preview ? 'Tap to change logo' : 'Tap to take a photo or choose from library'}
        </Text>
      </View>
    </StoreSetupChrome>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: -4,
  },
  logoSection: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  logoWrap: {
    position: 'relative',
  },
  logoCircle: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  pressed: { opacity: 0.85 },
});
