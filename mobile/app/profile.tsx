import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { AppIcon } from '@/components/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { settingsService } from '@/services/settings';
import { resolveDisplayImageUrl } from '@/utils/fileUtils';
import { getErrorMessage } from '@/utils/errorMessages';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { StackPageHeader } from '@/components/StackPageHeader';
import { logger } from '@/utils/logger';

type ProfileData = {
  name?: string;
  email?: string;
  profilePicture?: string;
};

const PROFILE_QUERY_KEY = ['settings', 'profile'] as const;

const getStringValue = (value: unknown) => (typeof value === 'string' ? value : '');

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, refreshAuth, logout } = useAuth();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor, inputBg } = useScreenColors();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(getStringValue(user?.name));
  const [email, setEmail] = useState(getStringValue(user?.email));
  const [profilePreview, setProfilePreview] = useState(
    () => resolveDisplayImageUrl(getStringValue(user?.profilePicture)) || ''
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    currentPassword?: string;
    newPassword?: string;
  }>({});
  const nameInputRef = useRef<TextInput>(null);
  const currentPasswordRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);

  const { data: profileRes, isLoading: profileLoading } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => settingsService.getProfile(),
  });

  const profileData = useMemo<ProfileData | undefined>(() => {
    const rawProfileData = profileRes?.data ?? profileRes;
    if (!rawProfileData || typeof rawProfileData !== 'object' || Array.isArray(rawProfileData)) {
      return undefined;
    }
    return rawProfileData as ProfileData;
  }, [profileRes]);

  const profilePreviewUrl = useMemo(() => {
    const rawUrl = getStringValue(profilePreview).trim();
    return rawUrl ? resolveDisplayImageUrl(rawUrl) : '';
  }, [profilePreview]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [profilePreviewUrl]);

  useEffect(() => {
    if (!profileData) return;
    setName(getStringValue(profileData.name));
    setEmail(getStringValue(profileData.email) || getStringValue(user?.email));
    const nextPicture =
      getStringValue(profileData.profilePicture) || getStringValue(user?.profilePicture);
    // Never keep oversized data URLs in state (display URL is empty for those).
    setProfilePreview(resolveDisplayImageUrl(nextPicture) || '');
  }, [profileData, user?.email, user?.profilePicture]);

  const resetForm = useCallback(() => {
    setName(getStringValue(profileData?.name) || getStringValue(user?.name));
    setEmail(getStringValue(profileData?.email) || getStringValue(user?.email));
    const nextPicture =
      getStringValue(profileData?.profilePicture) || getStringValue(user?.profilePicture);
    setProfilePreview(resolveDisplayImageUrl(nextPicture) || '');
    setCurrentPassword('');
    setNewPassword('');
    setShowChangePassword(false);
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setFieldErrors({});
  }, [profileData, user?.email, user?.name, user?.profilePicture]);

  const handleToggleEdit = useCallback(() => {
    if (editing) {
      resetForm();
      setEditing(false);
      return;
    }
    setEditing(true);
  }, [editing, resetForm]);

  const uploadFromAsset = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      const previousPreview = profilePreview;
      // Optimistic local preview while upload runs.
      setProfilePreview(asset.uri);
      setUploadingPhoto(true);
      try {
        const response = await settingsService.uploadProfilePicture(
          asset.uri,
          asset.mimeType ?? 'image/jpeg',
          asset.fileName
        );
        const updatedUser = response?.data ?? response;
        const imageUrl = getStringValue(updatedUser?.profilePicture).trim();
        // Prefer server URL when safe; otherwise keep the local file URI (never stash huge data URLs).
        const nextPreview = resolveDisplayImageUrl(imageUrl) || asset.uri;
        queryClient.setQueryData(PROFILE_QUERY_KEY, { success: true, data: updatedUser });
        setProfilePreview(nextPreview);
        await refreshAuth();
        await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
        logger.info('Profile', 'Profile picture updated');
        Alert.alert('Saved', 'Profile picture updated.');
      } catch (err) {
        setProfilePreview(previousPreview);
        logger.error('Profile', 'Photo upload failed:', err);
        Alert.alert('Upload failed', getErrorMessage(err, 'Could not upload profile picture.'));
      } finally {
        setUploadingPhoto(false);
      }
    },
    [profilePreview, queryClient, refreshAuth]
  );

  const takePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera access to take a profile picture.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.55,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      await uploadFromAsset(result.assets[0]);
    } catch (err) {
      logger.error('Profile', 'Camera failed:', err);
      Alert.alert('Camera failed', getErrorMessage(err, 'Could not take photo.'));
    }
  }, [uploadFromAsset]);

  const chooseFromLibrary = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo library access to upload a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.55,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      await uploadFromAsset(result.assets[0]);
    } catch (err) {
      logger.error('Profile', 'Photo picker failed:', err);
      Alert.alert('Photo picker failed', getErrorMessage(err, 'Could not choose photo.'));
    }
  }, [uploadFromAsset]);

  const handlePickPhoto = useCallback(() => {
    if (uploadingPhoto) return;
    Alert.alert('Profile picture', 'Update your photo using the camera or photo library.', [
      { text: 'Take photo', onPress: () => void takePhoto() },
      { text: 'Choose from library', onPress: () => void chooseFromLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [chooseFromLibrary, takePhoto, uploadingPhoto]);

  const handleRemovePhoto = useCallback(async () => {
    setUploadingPhoto(true);
    try {
      const response = await settingsService.updateProfile({ profilePicture: '' });
      const updatedUser = response?.data ?? response;
      queryClient.setQueryData(PROFILE_QUERY_KEY, { success: true, data: updatedUser });
      setProfilePreview('');
      await refreshAuth();
      await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      Alert.alert('Removed', 'Profile picture removed.');
    } catch (err) {
      logger.error('Profile', 'Remove photo failed:', err);
      Alert.alert('Error', getErrorMessage(err, 'Could not remove profile picture.'));
    } finally {
      setUploadingPhoto(false);
    }
  }, [queryClient, refreshAuth]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    const nextErrors: { name?: string; currentPassword?: string; newPassword?: string } = {};
    if (!trimmedName) {
      nextErrors.name = 'Enter your full name.';
    }

    if (newPassword && newPassword.length < 6) {
      nextErrors.newPassword = 'Use at least 6 characters for your new password.';
    }

    if (newPassword && !currentPassword.trim()) {
      nextErrors.currentPassword = 'Enter your current password to set a new one.';
    }

    if (nextErrors.name || nextErrors.currentPassword || nextErrors.newPassword) {
      setFieldErrors(nextErrors);
      requestAnimationFrame(() => {
        if (nextErrors.name) nameInputRef.current?.focus();
        else if (nextErrors.currentPassword) currentPasswordRef.current?.focus();
        else if (nextErrors.newPassword) newPasswordRef.current?.focus();
      });
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      const payload: Parameters<typeof settingsService.updateProfile>[0] = {
        name: trimmedName,
      };
      if (newPassword) {
        payload.password = newPassword;
        payload.currentPassword = currentPassword;
      }

      const response = await settingsService.updateProfile(payload);
      const updatedUser = response?.data ?? response;
      queryClient.setQueryData(PROFILE_QUERY_KEY, { success: true, data: updatedUser });
      await refreshAuth();
      setCurrentPassword('');
      setNewPassword('');
      setFieldErrors({});
      setShowChangePassword(false);
      setEditing(false);
      logger.info('Profile', 'Profile updated');
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (err) {
      logger.error('Profile', 'Update failed:', err);
      Alert.alert('Error', getErrorMessage(err, 'Failed to update profile. Please try again.'));
    } finally {
      setSaving(false);
    }
  }, [name, newPassword, currentPassword, queryClient, refreshAuth]);

  const handleLogout = useCallback(() => {
    Alert.alert('Log out?', 'You will need to sign in again to use the app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          // Same as Account: clear session then leave authenticated stack.
          router.replace('/login');
        },
      },
    ]);
  }, [logout, router]);

  const inputDisabledBg = inputBg;

  const renderProfileSkeleton = () => (
    <View
      style={styles.skeletonWrap}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading profile details"
    >
      <View style={styles.skeletonAvatar} />
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={[styles.skeletonLine, styles.skeletonTitle]} />
        <View style={[styles.skeletonLine, styles.skeletonLabel]} />
        <View style={styles.skeletonInput} />
        <View style={[styles.skeletonLine, styles.skeletonLabel]} />
        <View style={styles.skeletonInput} />
      </View>
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={[styles.skeletonLine, styles.skeletonTitle]} />
        <View style={styles.skeletonButton} />
      </View>
    </View>
  );

  return (
    <ScreenShell style={styles.container}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StackPageHeader
        title="Profile"
        right={
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleToggleEdit}
              disabled={saving || uploadingPhoto}
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor },
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: textColor }]}>
                {editing ? 'Cancel' : 'Edit'}
              </Text>
            </Pressable>
            {editing ? (
              <Pressable
                onPress={handleSave}
                disabled={saving || uploadingPhoto}
                style={({ pressed }) => [
                  styles.primaryButtonSmall,
                  { backgroundColor: colors.tint },
                  pressed && styles.buttonPressed,
                  (saving || uploadingPhoto) && styles.buttonDisabled,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonSmallText}>Save</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {profileLoading ? renderProfileSkeleton() : (
        <>

        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            {profilePreviewUrl && !avatarLoadFailed ? (
              <Image
                source={{ uri: profilePreviewUrl }}
                style={styles.avatar}
                contentFit="cover"
                onError={() => setAvatarLoadFailed(true)}
                accessibilityLabel="Profile picture"
              />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.tint }]}>
                <AppIcon name="user" size={40} color="#fff" />
              </View>
            )}
            {editing ? (
              <Pressable
                onPress={handlePickPhoto}
                disabled={uploadingPhoto}
                accessibilityRole="button"
                accessibilityLabel="Upload profile picture"
                style={[styles.cameraButton, { backgroundColor: colors.tint, borderColor: bg }]}
              >
                {uploadingPhoto ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <AppIcon name="camera" size={16} color="#fff" />
                )}
              </Pressable>
            ) : null}
          </View>
          {editing && (profilePreviewUrl || getStringValue(profilePreview).trim()) ? (
            <Pressable
              onPress={handleRemovePhoto}
              disabled={uploadingPhoto}
              accessibilityRole="button"
              accessibilityLabel="Remove profile picture"
              style={({ pressed }) => [styles.removePhotoBtn, pressed && styles.buttonPressed]}
            >
              <Text style={{ color: '#dc2626', fontWeight: '600', fontSize: 14 }}>Remove photo</Text>
            </Pressable>
          ) : null}
          {editing ? (
            <Text style={[styles.hint, { color: mutedColor, textAlign: 'center' }]}>
              {uploadingPhoto
                ? 'Uploading photo…'
                : 'Tap the camera icon to take a photo or choose from your library.'}
            </Text>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Personal information</Text>
          <Text style={[styles.label, { color: mutedColor }]}>Full name</Text>
          <TextInput
            ref={nameInputRef}
            style={[
              styles.input,
              {
                color: textColor,
                borderColor,
                backgroundColor: editing ? cardBg : inputDisabledBg,
              },
              fieldErrors.name && styles.inputError,
            ]}
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (fieldErrors.name) setFieldErrors((current) => ({ ...current, name: undefined }));
            }}
            placeholder="Your name"
            placeholderTextColor={mutedColor}
            autoCapitalize="words"
            accessibilityLabel="Full name"
            accessibilityHint={fieldErrors.name || 'Enter your full name'}
            editable={editing && !saving}
          />
          {fieldErrors.name ? <Text style={styles.fieldError}>{fieldErrors.name}</Text> : null}
          <Text style={[styles.label, { color: mutedColor, marginTop: 16 }]}>Email</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: mutedColor,
                borderColor,
                backgroundColor: inputDisabledBg,
              },
            ]}
            value={email}
            editable={false}
            placeholder="Email"
            placeholderTextColor={mutedColor}
            accessibilityLabel="Email address"
          />
          <Text style={[styles.hint, { color: mutedColor }]}>
            Email cannot be changed here.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Change password</Text>
          {!showChangePassword ? (
            <Pressable
              onPress={() => {
                setShowChangePassword(true);
                if (!editing) setEditing(true);
              }}
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor, alignSelf: 'flex-start' },
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: textColor }]}>Change password</Text>
            </Pressable>
          ) : (
            <View style={styles.passwordFields}>
              <Text style={[styles.label, { color: mutedColor }]}>Current password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  ref={currentPasswordRef}
                  style={[
                    styles.input,
                    styles.passwordInput,
                    { color: textColor, borderColor, backgroundColor: cardBg },
                    fieldErrors.currentPassword && styles.inputError,
                  ]}
                  value={currentPassword}
                  onChangeText={(value) => {
                    setCurrentPassword(value);
                    if (fieldErrors.currentPassword) {
                      setFieldErrors((current) => ({ ...current, currentPassword: undefined }));
                    }
                  }}
                  placeholder="Enter current password"
                  placeholderTextColor={mutedColor}
                  secureTextEntry={!showCurrentPassword}
                  autoCapitalize="none"
                  accessibilityLabel="Current password"
                  accessibilityHint={fieldErrors.currentPassword || 'Enter your current password'}
                  editable={editing && !saving}
                />
                <Pressable
                  onPress={() => setShowCurrentPassword((v) => !v)}
                  style={styles.eyeButton}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                >
                  <AppIcon name={showCurrentPassword ? 'eye-off' : 'eye'} size={18} color={mutedColor} />
                </Pressable>
              </View>
              {fieldErrors.currentPassword ? (
                <Text style={styles.fieldError}>{fieldErrors.currentPassword}</Text>
              ) : null}

              <Text style={[styles.label, { color: mutedColor, marginTop: 16 }]}>New password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  ref={newPasswordRef}
                  style={[
                    styles.input,
                    styles.passwordInput,
                    { color: textColor, borderColor, backgroundColor: cardBg },
                    fieldErrors.newPassword && styles.inputError,
                  ]}
                  value={newPassword}
                  onChangeText={(value) => {
                    setNewPassword(value);
                    if (fieldErrors.newPassword) {
                      setFieldErrors((current) => ({ ...current, newPassword: undefined }));
                    }
                  }}
                  placeholder="Enter new password"
                  placeholderTextColor={mutedColor}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  accessibilityLabel="New password"
                  accessibilityHint={fieldErrors.newPassword || 'Enter a new password'}
                  editable={editing && !saving}
                />
                <Pressable
                  onPress={() => setShowNewPassword((v) => !v)}
                  style={styles.eyeButton}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showNewPassword ? 'Hide new password' : 'Show new password'}
                >
                  <AppIcon name={showNewPassword ? 'eye-off' : 'eye'} size={18} color={mutedColor} />
                </Pressable>
              </View>
              {fieldErrors.newPassword ? (
                <Text style={styles.fieldError}>{fieldErrors.newPassword}</Text>
              ) : null}

              <Pressable
                onPress={() => {
                  setShowChangePassword(false);
                  setCurrentPassword('');
                  setNewPassword('');
                }}
                style={({ pressed }) => [styles.cancelPasswordBtn, pressed && styles.buttonPressed]}
              >
                <Text style={{ color: mutedColor, fontWeight: '600' }}>Cancel password change</Text>
              </Pressable>
            </View>
          )}
        </View>
        </>
        )}

        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <Pressable
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            style={({ pressed }) => [styles.logoutRow, pressed && styles.buttonPressed]}
          >
            <AppIcon name="logout" size={20} color="#dc2626" />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButton: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  removePhotoBtn: { marginTop: 12, paddingVertical: 4 },
  card: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#dc2626',
  },
  fieldError: {
    color: '#dc2626',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  passwordFields: { gap: 0 },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 44 },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  cancelPasswordBtn: { marginTop: 12, alignSelf: 'flex-start', paddingVertical: 4 },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 12,
  },
  logoutText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: { fontSize: 12, marginTop: 6 },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '600' },
  primaryButtonSmall: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 72,
    alignItems: 'center',
  },
  primaryButtonSmallText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  buttonPressed: { opacity: 0.88 },
  buttonDisabled: { opacity: 0.6 },
  skeletonWrap: { gap: 16 },
  skeletonAvatar: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#e5e7eb',
    marginBottom: 8,
  },
  skeletonLine: { backgroundColor: '#e5e7eb', borderRadius: 8 },
  skeletonTitle: { width: '52%', height: 18, marginBottom: 18 },
  skeletonLabel: { width: '34%', height: 12, marginBottom: 8 },
  skeletonInput: {
    height: 46,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    marginBottom: 16,
  },
  skeletonButton: {
    width: 150,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
});
