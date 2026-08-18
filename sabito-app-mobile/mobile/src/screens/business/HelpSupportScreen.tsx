import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  TextInput,
  Animated,
  Easing,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Mail, 
  Phone, 
  MessageCircle, 
  Book, 
  FileText,
  ExternalLink,
  Globe,
  Search,
  ChevronRight,
  Users,
  CreditCard,
  Settings,
  HelpCircle,
  Briefcase,
  Headset,
  TrendingUp,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import { useSupportContent } from '../../hooks/useSupportContent';
import type { RootStackScreenProps } from '../../types/navigation';

type HelpSupportScreenProps = RootStackScreenProps<'HelpSupport'>;

interface ContactOption {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  title: string;
  value: string;
  action: () => void;
}

const HelpSupportScreen: React.FC<HelpSupportScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  // Use support content from website
  const { content, loading, error, refresh } = useSupportContent();
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Animation ref for floating icon
  const iconFloatY = useRef(new Animated.Value(0)).current;

  // Floating animation for support icon
  useEffect(() => {
    const floatAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(iconFloatY, {
          toValue: -10,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(iconFloatY, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    floatAnimation.start();

    return () => floatAnimation.stop();
  }, [iconFloatY]);

  // Icon mapping
  const iconMap: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
    Users: Users,
    Briefcase: Briefcase,
    CreditCard: CreditCard,
    Settings: Settings,
    TrendingUp: TrendingUp,
  };

  // Use content from website or fallback to empty arrays
  const helpTopics = content?.topics || [];
  const popularArticles = content?.articles?.slice(0, 6) || [];
  
  const contactOptions: ContactOption[] = [
    {
      icon: Mail,
      title: 'Email Us',
      value: content?.contacts?.email || 'support@sabito.com',
      action: () => Linking.openURL(`mailto:${content?.contacts?.email || 'support@sabito.com'}`),
    },
    {
      icon: Phone,
      title: 'Call Us',
      value: content?.contacts?.phone || '+233 XX XXX XXXX',
      action: () => Linking.openURL(`tel:${content?.contacts?.phone || '+233XXXXXXXXX'}`),
    },
    {
      icon: MessageCircle,
      title: 'Live Chat',
      value: 'Chat with support',
      action: () => navigation.navigate('ChatList' as any),
    },
  ];

  const handleArticlePress = (article: any): void => {
    // Could navigate to article detail
  };

  const handleTopicPress = (topic: any): void => {
    // Could navigate to topic detail
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Help & Support</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading support content...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Help & Support</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <HelpCircle size={64} color="#EF4444" />
          <Text style={[styles.errorTitle, { color: colors.text }]}>Unable to Load Content</Text>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refresh}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Help & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={[styles.scrollView, { backgroundColor: colors.background }]} 
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {/* Floating Support Icon */}
        <View style={[styles.iconContainer, { backgroundColor: colors.background }]}>
          <Animated.View
            style={{
              transform: [{ translateY: iconFloatY }],
            }}
          >
            <View style={[styles.floatingIconBg, { 
              backgroundColor: isDark ? colors.cardBackground : '#F0FDF4' 
            }]}>
              <Headset size={40} color={COLORS.APP_GREEN} strokeWidth={1.5} />
            </View>
          </Animated.View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.searchBar, { 
            backgroundColor: colors.cardBackground,
            borderWidth: 1,
            borderColor: colors.border
          }]}>
            <Search size={20} color={colors.iconSecondary} strokeWidth={1.5} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="How can I help you?"
              placeholderTextColor={colors.inputPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Help Topics */}
        <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Help Topics</Text>
          <View style={styles.topicsGrid}>
            {helpTopics.map((topic: any, index: number) => {
              const Icon = iconMap[topic.icon] || HelpCircle;
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.topicCard, { 
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.border
                  }]}
                  onPress={() => handleTopicPress(topic)}
                >
                  <View style={[styles.topicIconContainer, { 
                    backgroundColor: isDark ? colors.backgroundSecondary : topic.iconBg 
                  }]}>
                    <Icon size={24} color={topic.iconColor} strokeWidth={1.5} />
                  </View>
                  <Text style={[styles.topicTitle, { color: colors.text }]}>{topic.title}</Text>
                  <Text style={[styles.topicDescription, { color: colors.textSecondary }]}>{topic.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Popular Articles */}
        <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Popular Articles</Text>
          <View style={[styles.articlesGroup, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {popularArticles.map((article: any, index: number) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.articleItem,
                  { borderBottomColor: colors.border },
                  index === popularArticles.length - 1 && styles.lastArticleItem,
                ]}
                onPress={() => handleArticlePress(article)}
              >
                <View style={styles.articleInfo}>
                  <Text style={[styles.articleTitle, { color: colors.text }]}>{article.title}</Text>
                  <Text style={[styles.articleCategory, { color: colors.textSecondary }]}>{article.category}</Text>
                </View>
                <ChevronRight size={20} color={colors.iconSecondary} strokeWidth={1.5} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Contact Support */}
        <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Contact Support</Text>
          <View style={[styles.contactGroup, { 
            backgroundColor: colors.cardBackground,
            borderWidth: 1,
            borderColor: colors.border
          }]}>
            {contactOptions.map((option, index) => {
              const Icon = option.icon;
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.contactItem,
                    { borderBottomColor: colors.border },
                    index === contactOptions.length - 1 && styles.lastContactItem,
                  ]}
                  onPress={option.action}
                >
                  <View style={[styles.contactIconContainer, { 
                    backgroundColor: isDark ? colors.backgroundSecondary : '#F0FDF4' 
                  }]}>
                    <Icon size={22} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                  </View>
                  <View style={styles.contactContent}>
                    <Text style={[styles.contactTitle, { color: colors.text }]}>{option.title}</Text>
                    <Text style={[styles.contactValue, { color: colors.textSecondary }]}>{option.value}</Text>
                  </View>
                  <ExternalLink size={18} color={colors.iconSecondary} strokeWidth={1.5} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* App Version */}
        <View style={styles.versionContainer}>
          <Text style={[styles.versionText, { color: colors.textSecondary }]}>
            Sabito Mobile v1.0.0 • Content v{content?.version || '1.0.0'}
          </Text>
          <Text style={[styles.versionSubtext, { color: colors.textSecondary }]}>© 2024 Sabito. All rights reserved.</Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  scrollView: {
    flex: 1,
  },
  iconContainer: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  floatingIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZES.md,
  },
  section: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  topicsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  topicCard: {
    width: '47%',
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  topicIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  topicTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    textAlign: 'center',
    marginBottom: 4,
  },
  topicDescription: {
    fontSize: FONT_SIZES.xs,
    textAlign: 'center',
    lineHeight: 16,
  },
  articlesGroup: {
    marginHorizontal: SPACING.md,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  articleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
  },
  lastArticleItem: {
    borderBottomWidth: 0,
  },
  articleInfo: {
    flex: 1,
  },
  articleTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 4,
  },
  articleCategory: {
    fontSize: FONT_SIZES.xs,
  },
  contactGroup: {
    marginHorizontal: SPACING.md,
    borderRadius: 12,
    overflow: 'hidden',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
  },
  lastContactItem: {
    borderBottomWidth: 0,
  },
  contactIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  contactContent: {
    flex: 1,
  },
  contactTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  contactValue: {
    fontSize: FONT_SIZES.sm,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  versionText: {
    fontSize: FONT_SIZES.sm,
    marginBottom: 4,
  },
  versionSubtext: {
    fontSize: FONT_SIZES.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  errorTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  errorText: {
    fontSize: FONT_SIZES.md,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 8,
  },
  retryButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default HelpSupportScreen;






