import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, TextInput } from 'react-native-paper';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import apiClient from '../../services/apiClient';
import { logoutMarketer } from '../../api/absMarketer';
export default function AccountSecurityScreen({ navigation, route }: any) {
  const recovery = route.name === 'PasswordRecovery';
  const { theme, effectiveTheme } = useTheme();
  const { colors } = getTheme(effectiveTheme || theme);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async () => {
    setBusy(true); setMessage('');
    try {
      const action = recovery ? sent ? 'reset-password' : 'forgot-password' : 'change-password';
      const res = await apiClient.post(`/public/sabito-marketer/auth/${action}`, { email, code, password, currentPassword });
      setMessage(res.data.data.message);
      if (recovery && !sent) setSent(true);
      else { if (!recovery) await logoutMarketer(); else navigation.goBack(); }
    } catch (e: any) { setMessage(e.response?.data?.message || 'Unable to continue. Please retry.'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Button onPress={() => navigation.goBack()}>Back</Button><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
    <Text style={{ color: colors.text, fontSize: 24 }}>{recovery ? 'Reset password' : 'Privacy & security'}</Text>
    {recovery ? <TextInput label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} /> : <TextInput label="Current password" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />}
    {recovery && sent && <TextInput label="Reset code" keyboardType="number-pad" value={code} onChangeText={setCode} maxLength={6} />}
    {(!recovery || sent) && <TextInput label="New password (at least 8 characters)" secureTextEntry value={password} onChangeText={setPassword} />}
    {!!message && <Text accessibilityRole="alert" style={{ color: colors.text }}>{message}</Text>}
    <Button mode="contained" loading={busy} disabled={busy} onPress={submit}>{recovery && !sent ? 'Send reset code' : 'Save password'}</Button>
    {recovery && sent && <Button onPress={() => setSent(false)}>Request another code</Button>}
  </ScrollView></SafeAreaView>;
}
