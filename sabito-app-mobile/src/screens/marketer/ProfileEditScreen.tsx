import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import TextInput from '../../components/common/TextInput';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import { getMarketerSession, updateMarketerProfile } from '../../api/absMarketer';

type Props = { navigation: any };

const ProfileEditScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const session = await getMarketerSession();
        setName(session.marketer.name || '');
        setEmail(session.marketer.email || '');
        setPhone(session.marketer.phone || '');
      } catch {
        const cached = await AsyncStorage.getItem('user');
        if (cached) {
          const u = JSON.parse(cached);
          setName(u.name || '');
          setEmail(u.email || '');
          setPhone(u.phone || '');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!name.trim() || name.trim().length < 2) {
      showDialog({
        title: 'Name required',
        message: 'Enter your full name (at least 2 characters).',
        buttons: [{ text: 'OK', onPress: hideDialog }],
      });
      return;
    }
    setSaving(true);
    try {
      const res = await updateMarketerProfile({
        name: name.trim(),
        phone: phone.trim() || undefined,
      });
      const user = {
        ...res.marketer,
        userID: res.marketer.id,
      };
      await AsyncStorage.setItem('user', JSON.stringify(user));
      showDialog({
        title: 'Saved',
        message: 'Your profile was updated.',
        buttons: [{ text: 'OK', onPress: () => { hideDialog(); navigation.goBack(); } }],
      });
    } catch (err: any) {
      showDialog({
        title: 'Error',
        message: err?.message || 'Could not update profile.',
        buttons: [{ text: 'OK', onPress: hideDialog }],
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={COLORS.APP_GREEN} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextInput
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
          />
          <TextInput
            label="Email"
            value={email}
            editable={false}
            placeholder="Email"
            helperText="Email cannot be changed"
          />
          <TextInput
            label="Phone (optional)"
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. 0555155972"
            keyboardType="phone-pad"
          />
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.saveBtn}
          >
            Save changes
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

      <CustomDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={hideDialog}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.semibold },
  content: { padding: 16, paddingBottom: 40 },
  saveBtn: { marginTop: SPACING.lg, borderRadius: 8 },
});

export default ProfileEditScreen;
