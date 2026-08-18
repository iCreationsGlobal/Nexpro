import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, MapPin, DollarSign, Clock, Building2, MessageCircle, Bookmark } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import { requestAIMatch, getAIMatchUsage, saveAIMatch } from '../../api/aiMatch';
import type { RootStackScreenProps } from '../../types/navigation';
import type { User as UserType, Business } from '../../types/api';

type MarketerAIMatchScreenProps = RootStackScreenProps<'MarketerAIMatch'>;

interface AIMatchUsage {
  used: number;
  limit: number;
  resetDate: string;
}

interface AIMatchResult {
  matches: Business[];
}

const MarketerAIMatchScreen: React.FC<MarketerAIMatchScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const { searchQuery } = route.params || {};
  const [user, setUser] = useState<UserType | null>(null);
  const [customerNeed, setCustomerNeed] = useState<string>(searchQuery || '');
  const [location, setLocation] = useState<string>('');
  const [budget, setBudget] = useState<string>('');
  const [timeline, setTimeline] = useState<string>('');
  
  const [usage, setUsage] = useState<AIMatchUsage | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState<boolean>(true);
  const [isMatching, setIsMatching] = useState<boolean>(false);
  const [matches, setMatches] = useState<Business[] | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (): Promise<void> => {
    try {
      // Load user
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        setUser(JSON.parse(userData) as UserType);
      }

      // Load usage/quota
      const usageResult = await getAIMatchUsage();
      if (usageResult.success && usageResult.data) {
        setUsage(usageResult.data as AIMatchUsage);
      }
    } catch (error) {
      // Handle error
    } finally {
      setIsLoadingUsage(false);
    }
  };

  const handleFindMatches = async (): Promise<void> => {
    if (!customerNeed.trim()) {
      showDialog({
        title: 'Customer Need Required',
        message: 'Please describe what your customer needs.',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
      return;
    }

    // Check quota
    if (usage && usage.used >= usage.limit) {
      showDialog({
        title: 'Quota Reached',
        message: `You've used all ${usage.limit} AI matches this month. Resets on ${new Date(usage.resetDate).toLocaleDateString()}.`,
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
      return;
    }

    setIsMatching(true);
    
    try {
      const matchData: any = {
        customerNeed: customerNeed.trim(),
      };
      
      if (location.trim()) matchData.location = location.trim();
      if (budget.trim()) matchData.budget = budget.trim();
      if (timeline.trim()) matchData.timeline = timeline.trim();

      const result = await requestAIMatch(matchData);

      if (result.success && result.data) {
        const matchResult = result.data as AIMatchResult;
        setMatches(matchResult.matches || []);
        
        // Refresh usage
        const usageResult = await getAIMatchUsage();
        if (usageResult.success && usageResult.data) {
          setUsage(usageResult.data as AIMatchUsage);
        }
      } else {
        showDialog({
          title: 'Error',
          message: result.error || 'Failed to generate matches',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      }
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: 'Something went wrong. Please try again.',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsMatching(false);
    }
  };

  const handleSaveMatch = async (businessId: string, matchDetails: any): Promise<void> => {
    const result = await saveAIMatch(businessId, matchDetails);
    if (result.success) {
      showDialog({
        title: 'Saved',
        message: 'Match saved successfully!',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } else {
      showDialog({
        title: 'Error',
        message: 'Failed to save match',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    }
  };

  const handleViewBusiness = (businessId: string, business?: any): void => {
    // Pass the business data for instant loading
    navigation.navigate('BusinessDetails', { businessId, initialData: business });
  };

  const handleContactBusiness = (businessId: string, businessName: string): void => {
    navigation.navigate('NewChat', { 
      recipientId: businessId, 
      recipientName: businessName, 
      recipientType: 'business' 
    });
  };

  return (
    <>
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>AI Business Match</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
      >
        <ScrollView 
          style={[styles.scrollView, { backgroundColor: colors.background }]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Usage Info */}
          {usage && (
            <View style={[styles.usageCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Sparkles size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
              <Text style={[styles.usageText, { color: colors.text }]}>
                {usage.used} / {usage.limit} matches used this month
              </Text>
            </View>
          )}

          {/* Input Form */}
          {!matches && (
            <View style={[styles.formCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>What does your customer need?</Text>
              
              <TextInput
                style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={customerNeed}
                onChangeText={setCustomerNeed}
                placeholder="Describe the service or product your customer is looking for..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {/* Optional Filters */}
              <View style={styles.filtersContainer}>
                <View style={styles.filterRow}>
                  <MapPin size={18} color={colors.iconSecondary} strokeWidth={1.5} />
                  <TextInput
                    style={[styles.filterInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={location}
                    onChangeText={setLocation}
                    placeholder="Location (optional)"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>

                <View style={styles.filterRow}>
                  <DollarSign size={18} color={colors.iconSecondary} strokeWidth={1.5} />
                  <TextInput
                    style={[styles.filterInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={budget}
                    onChangeText={setBudget}
                    placeholder="Budget (optional)"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.filterRow}>
                  <Clock size={18} color={colors.iconSecondary} strokeWidth={1.5} />
                  <TextInput
                    style={[styles.filterInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={timeline}
                    onChangeText={setTimeline}
                    placeholder="Timeline (optional)"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.findButton, isMatching && styles.findButtonDisabled]}
                onPress={handleFindMatches}
                disabled={isMatching || !customerNeed.trim()}
              >
                {isMatching ? (
                  <ActivityIndicator size="small" color={COLORS.WHITE} />
                ) : (
                  <>
                    <Sparkles size={20} color={COLORS.WHITE} strokeWidth={2} />
                    <Text style={styles.findButtonText}>Find Matches</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Matches Results */}
          {matches && matches.length > 0 && (
            <View style={styles.matchesContainer}>
              <Text style={[styles.matchesTitle, { color: colors.text }]}>Recommended Businesses</Text>
              {matches.map((business) => (
                <View key={business.id} style={[styles.matchCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                  <View style={styles.matchHeader}>
                    <Building2 size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
                    <View style={styles.matchInfo}>
                      <Text style={[styles.matchBusinessName, { color: colors.text }]}>{business.businessName}</Text>
                      {business.industry && (
                        <Text style={[styles.matchIndustry, { color: colors.textSecondary }]}>{business.industry}</Text>
                      )}
                    </View>
                  </View>
                  
                  {business.description && (
                    <Text style={[styles.matchDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                      {business.description}
                    </Text>
                  )}

                  <View style={styles.matchActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                      onPress={() => handleViewBusiness(business.id, business)}
                    >
                      <Text style={[styles.actionButtonText, { color: colors.text }]}>View Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.contactButton]}
                      onPress={() => handleContactBusiness(business.id, business.businessName)}
                    >
                      <MessageCircle size={18} color={COLORS.WHITE} strokeWidth={2} />
                      <Text style={styles.contactButtonText}>Contact</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {matches && matches.length === 0 && (
            <View style={styles.noMatchesContainer}>
              <Text style={[styles.noMatchesText, { color: colors.textSecondary }]}>
                No matches found. Try adjusting your criteria.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>

    <CustomDialog
      visible={dialog.visible}
      title={dialog.title}
      message={dialog.message}
      buttons={dialog.buttons}
      onClose={hideDialog}
    />
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  usageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.md,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  usageText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  formCard: {
    padding: SPACING.lg,
    borderRadius: 12,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  formTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    minHeight: 100,
    marginBottom: SPACING.md,
  },
  filtersContainer: {
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  filterInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.sm,
    fontSize: FONT_SIZES.sm,
  },
  findButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.APP_GREEN,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    gap: SPACING.sm,
  },
  findButtonDisabled: {
    opacity: 0.5,
  },
  findButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  matchesContainer: {
    gap: SPACING.md,
  },
  matchesTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.sm,
  },
  matchCard: {
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  matchInfo: {
    flex: 1,
  },
  matchBusinessName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  matchIndustry: {
    fontSize: FONT_SIZES.sm,
  },
  matchDescription: {
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
    lineHeight: 18,
  },
  matchActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    gap: SPACING.xs,
  },
  actionButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  contactButton: {
    backgroundColor: COLORS.APP_GREEN,
    borderColor: COLORS.APP_GREEN,
  },
  contactButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  noMatchesContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  noMatchesText: {
    fontSize: FONT_SIZES.md,
    textAlign: 'center',
  },
});

export default MarketerAIMatchScreen;






