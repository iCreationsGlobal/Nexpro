import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import { logger } from '@/utils/logger';
import { api } from '@/services/api';
import {
  getBusinessOptionsByGroup,
  BUSINESS_GROUP_LABELS,
  BUSINESS_GROUP_EXAMPLES,
  findBusinessOptionById,
} from '@/constants/businessTypes';
import { BUSINESS_GROUPS } from '@/constants/businessTypes';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import {
  AppBottomSheet,
  APP_SHEET_HEIGHT_MEDIUM,
  SheetMenuRow,
} from '@/components/AppBottomSheet';
import { BRAND_GREEN } from '@/constants/brand';
import { FontFamily, FontSize } from '@/constants/typography';
import { TOUCH_TARGET, BORDER_WIDTH } from '@/constants/sizing';

/** Icon name per business group (retail = cart; matches web concepts: Briefcase, Scissors, Car, UtensilsCrossed, Pill, Package). */
function getBusinessGroupIconName(groupKey: string): AppIconName {
  switch (groupKey) {
    case BUSINESS_GROUPS.RETAIL:
      return 'cart-outline';
    case BUSINESS_GROUPS.PRINT_PHOTO:
      return 'briefcase-outline';
    case BUSINESS_GROUPS.BEAUTY:
      return 'cut-outline';
    case BUSINESS_GROUPS.AUTO:
      return 'car-outline';
    case BUSINESS_GROUPS.FOOD:
      return 'restaurant-outline';
    case BUSINESS_GROUPS.HEALTH:
      return 'medical-outline';
    case BUSINESS_GROUPS.RENTAL:
      return 'package-outline';
    case BUSINESS_GROUPS.SERVICES:
    default:
      return 'briefcase-outline';
  }
}

const COUNTRY_CODES = [
  // Core African markets (mirrors backend phone utils)
  { code: '+233', country: 'GH', name: 'Ghana' },
  { code: '+234', country: 'NG', name: 'Nigeria' },
  { code: '+254', country: 'KE', name: 'Kenya' },
  { code: '+27', country: 'ZA', name: 'South Africa' },
  { code: '+256', country: 'UG', name: 'Uganda' },
  { code: '+255', country: 'TZ', name: 'Tanzania' },
  { code: '+251', country: 'ET', name: 'Ethiopia' },
  { code: '+20', country: 'EG', name: 'Egypt' },
  { code: '+212', country: 'MA', name: 'Morocco' },
  { code: '+213', country: 'DZ', name: 'Algeria' },
  { code: '+216', country: 'TN', name: 'Tunisia' },
  { code: '+225', country: 'CI', name: 'Ivory Coast' },
  { code: '+237', country: 'CM', name: 'Cameroon' },
  { code: '+221', country: 'SN', name: 'Senegal' },
  { code: '+260', country: 'ZM', name: 'Zambia' },
  { code: '+263', country: 'ZW', name: 'Zimbabwe' },
  { code: '+265', country: 'MW', name: 'Malawi' },
  { code: '+258', country: 'MZ', name: 'Mozambique' },
  { code: '+244', country: 'AO', name: 'Angola' },
  { code: '+249', country: 'SD', name: 'Sudan' },
  { code: '+250', country: 'RW', name: 'Rwanda' },
  { code: '+257', country: 'BI', name: 'Burundi' },
  { code: '+229', country: 'BJ', name: 'Benin' },
  { code: '+226', country: 'BF', name: 'Burkina Faso' },
  { code: '+223', country: 'ML', name: 'Mali' },
  { code: '+227', country: 'NE', name: 'Niger' },
  { code: '+235', country: 'TD', name: 'Chad' },
  { code: '+222', country: 'MR', name: 'Mauritania' },
  { code: '+220', country: 'GM', name: 'Gambia' },
  { code: '+224', country: 'GN', name: 'Guinea' },
  { code: '+232', country: 'SL', name: 'Sierra Leone' },
  { code: '+231', country: 'LR', name: 'Liberia' },
  { code: '+228', country: 'TG', name: 'Togo' },
  // Common international codes for completeness
  { code: '+1', country: 'US', name: 'United States' },
  { code: '+44', country: 'GB', name: 'United Kingdom' },
];

/**
 * Drop a leading national trunk "0" from a number that's about to sit next to a country-code
 * selector — e.g. "+233" alongside "0244123456" would otherwise display/send as if the number
 * started twice. Matches Frontend/src/utils/phoneUtils.js. Only strips zeros at the very start.
 */
function stripLeadingTrunkZero(value: string): string {
  return value.replace(/^0+(?=\d)/, '');
}

type StepId = 'businessType' | 'businessInfo' | 'contactInfo';

const STEPS: { id: StepId; title: string; subtitle: string }[] = [
  { id: 'businessType', title: 'What type of business are you running?', subtitle: 'This helps us set up the right dashboard and tools for you.' },
  { id: 'businessInfo', title: 'Tell us about your business', subtitle: 'This information will appear on your invoices and receipts.' },
  { id: 'contactInfo', title: 'Contact Information', subtitle: 'Add your business contact details.' },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshAuth } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [businessGroup, setBusinessGroup] = useState('');
  /** User can pick more than one sub-type; the first pick stays "primary" and drives businessType/shopType/studioType. */
  const [businessSubTypes, setBusinessSubTypes] = useState<string[]>([]);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [subTypeDropdownVisible, setSubTypeDropdownVisible] = useState(false);
  const [phoneCountryCode, setPhoneCountryCode] = useState('+233');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState(user?.email ?? '');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countryDropdownVisible, setCountryDropdownVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const businessOptionsByGroup = useMemo(() => getBusinessOptionsByGroup(), []);

  /** Groups that have at least one option (for step 1). */
  const groupsWithOptions = useMemo(
    () => Object.keys(businessOptionsByGroup).filter((k) => businessOptionsByGroup[k]?.length > 0),
    [businessOptionsByGroup]
  );

  /** Options for the selected group only (step 2). */
  const optionsForSelectedGroup = useMemo(
    () => (businessGroup ? businessOptionsByGroup[businessGroup] ?? [] : []),
    [businessGroup, businessOptionsByGroup]
  );

  const stepId = STEPS[currentStep]?.id ?? 'businessType';

  const canProceed = () => {
    if (stepId === 'businessType') return !!businessGroup;
    if (stepId === 'businessInfo') return businessSubTypes.length > 0 && !!companyName.trim();
    if (stepId === 'contactInfo') return !!companyPhone.trim();
    return false;
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setError('');
      if (stepId === 'businessType') {
        setBusinessSubTypes([]);
      }
      setCurrentStep((s) => s + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setError('');
      setSubTypeDropdownVisible(false);
      setCurrentStep((s) => s - 1);
    }
  };

  const pickLogo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!result.canceled && result.assets[0]) {
        setCompanyLogo(result.assets[0].uri);
      }
    } catch {
      // ignore
    }
  };

  const handleSubmit = async () => {
    const primarySubType = businessSubTypes[0] ?? '';
    const option = findBusinessOptionById(primarySubType);
    const businessType = option?.coreType ?? 'shop';
    const formData = new FormData();
    formData.append('businessType', businessType);
    if (primarySubType) formData.append('businessSubType', primarySubType);
    if (businessSubTypes.length > 0) formData.append('businessSubTypes', JSON.stringify(businessSubTypes));
    if (businessType === 'shop' && primarySubType) {
      formData.append('shopType', primarySubType);
    } else if (businessType === 'studio' && primarySubType) {
      formData.append('studioType', primarySubType);
    }
    formData.append('companyName', companyName.trim());
    if (companyLogo) {
      formData.append('companyLogo', { uri: companyLogo, name: 'logo.jpg', type: 'image/jpeg' } as any);
    }
    const fullPhone = phoneCountryCode ? `${phoneCountryCode} ${companyPhone.trim()}` : companyPhone.trim();
    formData.append('companyPhone', fullPhone);
    if (companyEmail.trim()) formData.append('companyEmail', companyEmail.trim());
    if (companyWebsite.trim()) {
      const website = companyWebsite.trim().startsWith('http') ? companyWebsite.trim() : `https://${companyWebsite.trim()}`;
      formData.append('companyWebsite', website);
    }
    if (companyAddress.trim()) formData.append('companyAddress', companyAddress.trim());

    setLoading(true);
    setError('');
    try {
      // Must override default application/json or axios JSON-stringifies FormData and multer never sees the file.
      await api.post('/tenants/onboarding', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      logger.info('Onboarding', 'Complete, refreshing auth');
      await refreshAuth();
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Failed to save. Please try again.');
      setError(msg);
      logger.error('Onboarding', 'Submit failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Text style={styles.title}>Let's set up your business</Text>
        <View style={styles.stepper}>
          {STEPS.map((step, i) => (
            <View key={step.id} style={[styles.stepDot, i === currentStep && styles.stepDotCurrent, i < currentStep && styles.stepDotDone]} />
          ))}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.stepTitle, stepId === 'businessInfo' && styles.stepTitleCenter]}>{STEPS[currentStep]?.title}</Text>
        <Text style={[styles.stepSubtitle, stepId === 'businessInfo' && styles.stepSubtitleCenter]}>{STEPS[currentStep]?.subtitle}</Text>

        {stepId === 'businessType' && (
          <View style={styles.options}>
            {groupsWithOptions.map((groupKey) => {
              const selected = businessGroup === groupKey;
              const label = BUSINESS_GROUP_LABELS[groupKey] ?? 'Other';
              const example = BUSINESS_GROUP_EXAMPLES[groupKey];
              const iconName = getBusinessGroupIconName(groupKey);
              const iconColor = selected ? '#fff' : '#6b7280';
              return (
                <Pressable
                  key={groupKey}
                  style={[styles.optionCard, selected && styles.optionCardSelected]}
                  onPress={() => setBusinessGroup(groupKey)}
                >
                  <View style={styles.optionCardRow}>
                    <View style={[styles.optionIconWrap, selected && styles.optionIconWrapSelected]}>
                      <AppIcon name={iconName} size={20} color={iconColor} />
                    </View>
                    <View style={styles.optionCardText}>
                      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
                      {example ? <Text style={styles.optionDesc}>{example}</Text> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {stepId === 'businessInfo' && (
          <View style={styles.form}>
            <View style={styles.logoSection}>
              <Pressable style={styles.logoTouchable} onPress={pickLogo}>
                {companyLogo ? (
                  <Image source={{ uri: companyLogo }} style={styles.logoPreview} />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <AppIcon name="camera-outline" size={24} color="#9ca3af" />
                    <Text style={styles.logoPlaceholderText}>Logo</Text>
                  </View>
                )}
              </Pressable>
              <Text style={[styles.label, styles.labelOptional, styles.logoLabelCenter]}>Company Logo (optional)</Text>
            </View>

            <Text style={styles.label}>Company Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your company name"
              placeholderTextColor="#9ca3af"
              value={companyName}
              onChangeText={setCompanyName}
              editable={!loading}
            />

            <Text style={[styles.label, styles.labelOptional]}>Address (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your business address"
              placeholderTextColor="#9ca3af"
              value={companyAddress}
              onChangeText={setCompanyAddress}
              editable={!loading}
            />

            <Text style={styles.label}>What do you mainly do?</Text>
            <Text style={styles.dropdownDescription}>Select everything that matches your business.</Text>
            <Pressable
              style={styles.dropdownTrigger}
              onPress={() => optionsForSelectedGroup.length > 0 && setSubTypeDropdownVisible(true)}
              disabled={optionsForSelectedGroup.length === 0}
            >
              <Text
                style={[styles.dropdownTriggerText, businessSubTypes.length === 0 && styles.dropdownTriggerPlaceholder]}
                numberOfLines={1}
              >
                {businessSubTypes.length > 0
                  ? businessSubTypes.length === 1
                    ? findBusinessOptionById(businessSubTypes[0])?.label ?? businessSubTypes[0]
                    : `${findBusinessOptionById(businessSubTypes[0])?.label ?? businessSubTypes[0]} +${businessSubTypes.length - 1} more`
                  : (optionsForSelectedGroup.length > 0 ? 'Select what best matches your business' : 'Select business type first')}
              </Text>
              <AppIcon name="chevron-down" size={20} color="#6b7280" />
            </Pressable>

            <AppBottomSheet
              visible={subTypeDropdownVisible}
              title="What do you mainly do?"
              onClose={() => setSubTypeDropdownVisible(false)}
              height={APP_SHEET_HEIGHT_MEDIUM}
              footer={
                <Pressable
                  style={[styles.sheetDoneButton, businessSubTypes.length === 0 && styles.nextButtonDisabled]}
                  onPress={() => setSubTypeDropdownVisible(false)}
                  disabled={businessSubTypes.length === 0}
                >
                  <Text style={styles.sheetDoneButtonText}>
                    Done{businessSubTypes.length > 0 ? ` (${businessSubTypes.length})` : ''}
                  </Text>
                </Pressable>
              }
            >
              {optionsForSelectedGroup.map((opt) => {
                const selected = businessSubTypes.includes(opt.id);
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.subTypeRow, selected && styles.subTypeRowSelected]}
                    onPress={() => {
                      setBusinessSubTypes((prev) =>
                        prev.includes(opt.id) ? prev.filter((id) => id !== opt.id) : [...prev, opt.id]
                      );
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                  >
                    <View style={[styles.circleCheckbox, selected && styles.circleCheckboxSelected]}>
                      {selected ? <AppIcon name="check" size={13} color="#fff" /> : null}
                    </View>
                    <View style={styles.subTypeRowText}>
                      <Text style={styles.subTypeRowLabel}>{opt.label}</Text>
                      {opt.description ? (
                        <Text style={styles.dropdownItemDesc}>{opt.description}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </AppBottomSheet>
          </View>
        )}

        {stepId === 'contactInfo' && (
          <View style={styles.form}>
            <Text style={styles.label}>Business phone</Text>
            <View style={styles.phoneRow}>
              <Pressable
                style={styles.countryDropdown}
                onPress={() => setCountryDropdownVisible(true)}
                disabled={loading}
              >
                <Text style={styles.countryDropdownText}>{phoneCountryCode}</Text>
                <AppIcon name="chevron-down" size={18} color="#6b7280" />
              </Pressable>
              <TextInput
                style={styles.phoneInput}
                placeholder="Phone number"
                placeholderTextColor="#9ca3af"
                value={companyPhone}
                onChangeText={(text) => setCompanyPhone(stripLeadingTrunkZero(text))}
                keyboardType="phone-pad"
                editable={!loading}
              />
            </View>
            <AppBottomSheet
              visible={countryDropdownVisible}
              title="Country code"
              onClose={() => {
                setCountryDropdownVisible(false);
                setCountrySearch('');
              }}
              height={APP_SHEET_HEIGHT_MEDIUM}
            >
              <TextInput
                style={styles.countrySearchInput}
                placeholder="Search country or code"
                placeholderTextColor="#9ca3af"
                value={countrySearch}
                onChangeText={setCountrySearch}
                autoCapitalize="none"
              />
              {COUNTRY_CODES.filter((c) => {
                if (!countrySearch.trim()) return true;
                const q = countrySearch.trim().toLowerCase();
                return (
                  c.code.toLowerCase().includes(q) ||
                  c.name.toLowerCase().includes(q) ||
                  c.country.toLowerCase().includes(q)
                );
              }).map((c) => {
                const selected = phoneCountryCode === c.code;
                return (
                  <SheetMenuRow
                    key={c.country}
                    label={`${c.code} — ${c.name}`}
                    active={selected}
                    onPress={() => {
                      setPhoneCountryCode(c.code);
                      setCountryDropdownVisible(false);
                      setCountrySearch('');
                    }}
                    trailing={selected ? <AppIcon name="check" size={18} color="#fff" /> : <View />}
                  />
                );
              })}
            </AppBottomSheet>
            <Text style={[styles.label, styles.labelOptional]}>Business email (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="business@company.com"
              placeholderTextColor="#9ca3af"
              value={companyEmail}
              onChangeText={setCompanyEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
            <Text style={[styles.label, styles.labelOptional]}>Website (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="https://..."
              placeholderTextColor="#9ca3af"
              value={companyWebsite}
              onChangeText={setCompanyWebsite}
              keyboardType="url"
              autoCapitalize="none"
              editable={!loading}
            />
          </View>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {currentStep > 0 ? (
          <Pressable style={styles.backButton} onPress={handleBack} disabled={loading}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : currentStep === 0 ? (
          <Pressable style={styles.setupLaterButtonFooter} onPress={() => { setError(''); router.replace('/(tabs)'); }} disabled={loading}>
            <Text style={styles.setupLaterButtonText}>Setup later</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[
            styles.nextButton,
            (!canProceed() || loading) && styles.nextButtonDisabled,
          ]}
          onPress={handleNext}
          disabled={!canProceed() || loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.nextButtonText}>{currentStep === STEPS.length - 1 ? 'Finish' : 'Next'}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: '#111', marginBottom: 12 },
  stepper: { flexDirection: 'row', gap: 8 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d1d5db' },
  stepDotCurrent: { backgroundColor: BRAND_GREEN },
  stepDotDone: { backgroundColor: BRAND_GREEN },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 24 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 4 },
  stepTitleCenter: { textAlign: 'center' },
  stepSubtitle: { fontSize: 15, color: '#6b7280', marginBottom: 20 },
  stepSubtitleCenter: { textAlign: 'center' },
  options: { gap: 20 },
  group: { gap: 8 },
  groupLabel: { fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 4 },
  optionCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 14 },
  optionCardSelected: { borderColor: BRAND_GREEN, backgroundColor: 'rgba(22, 101, 52, 0.06)' },
  optionCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionIconWrap: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  optionIconWrapSelected: { backgroundColor: BRAND_GREEN },
  optionCardText: { flex: 1, minWidth: 0 },
  optionLabel: { fontSize: 16, fontWeight: '600', color: '#111' },
  optionLabelSelected: { color: BRAND_GREEN },
  optionDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  setupLaterButtonFooter: {
    minHeight: TOUCH_TARGET.standard,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minWidth: 80,
    borderWidth: BORDER_WIDTH.standard,
    borderColor: '#d1d5db',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupLaterButtonText: { fontSize: 16, color: '#6b7280', fontWeight: '500' },
  form: { gap: 12 },
  label: { fontFamily: FontFamily.semiBold, fontSize: FontSize.md, fontWeight: '600', color: '#374151' },
  labelOptional: { fontWeight: '400', color: '#6b7280' },
  logoSection: { alignItems: 'center', marginBottom: 4 },
  logoLabelCenter: { textAlign: 'center' },
  logoTouchable: {},
  logoPreview: { width: 80, height: 80, borderRadius: 40 },
  logoPlaceholder: { width: 80, height: 80, borderRadius: 40, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', gap: 4 },
  logoPlaceholderText: { fontSize: 12, color: '#9ca3af' },
  dropdownDescription: { fontFamily: FontFamily.regular, fontSize: FontSize.sm, color: '#6b7280', marginTop: -4, marginBottom: 4 },
  dropdownTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 16, backgroundColor: '#fff' },
  dropdownTriggerText: { fontFamily: FontFamily.regular, fontSize: FontSize.body, color: '#111' },
  dropdownTriggerPlaceholder: { color: '#9ca3af' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  dropdownModal: { backgroundColor: '#fff', borderRadius: 12, maxHeight: '80%', width: '100%' },
  dropdownScroll: { maxHeight: '80%' },
  dropdownItem: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dropdownItemSelected: { backgroundColor: 'rgba(22, 101, 52, 0.08)' },
  dropdownItemLabel: { fontSize: 16, fontWeight: '600', color: '#111' },
  dropdownItemLabelSelected: { color: BRAND_GREEN },
  dropdownItemDesc: { fontFamily: FontFamily.regular, fontSize: FontSize.sm, color: '#6b7280', marginTop: 2 },
  subTypeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    marginBottom: 8,
  },
  subTypeRowSelected: { backgroundColor: 'rgba(22, 101, 52, 0.06)', borderColor: 'rgba(22, 101, 52, 0.25)' },
  subTypeRowText: { flex: 1, marginLeft: 12 },
  subTypeRowLabel: { fontFamily: FontFamily.semiBold, fontSize: FontSize.body, fontWeight: '600', color: '#111' },
  circleCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginTop: 1,
  },
  circleCheckboxSelected: { backgroundColor: BRAND_GREEN, borderColor: BRAND_GREEN },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  countryDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    minWidth: 90,
    backgroundColor: '#fff',
  },
  countryDropdownText: { fontSize: 16, color: '#111' },
  phoneInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  countrySearchInput: {
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 4,
  },
  errorBox: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, padding: 12, marginTop: 16 },
  error: { color: '#dc2626', fontSize: 14 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, paddingBottom: 32, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  backButton: {
    minHeight: TOUCH_TARGET.standard,
    minWidth: 80,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: BORDER_WIDTH.standard,
    borderColor: '#d1d5db',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: { fontSize: 16, color: BRAND_GREEN, fontWeight: '600' },
  nextButton: {
    flex: 1,
    height: TOUCH_TARGET.standard,
    backgroundColor: BRAND_GREEN,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  nextButtonDisabled: { opacity: 0.6 },
  nextButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sheetDoneButton: {
    height: TOUCH_TARGET.standard,
    backgroundColor: BRAND_GREEN,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDoneButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
