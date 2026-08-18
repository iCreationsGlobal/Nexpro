import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, User } from 'lucide-react-native';
import { getContacts, createChat } from '../../api/chat';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import type { RootStackScreenProps } from '../../types/navigation';

type NewChatScreenProps = RootStackScreenProps<'NewChat'>;

interface Contact {
  id: string;
  name: string;
  email: string;
  accountType?: 'marketer' | 'business' | 'admin';
  business?: {
    businessName: string;
  };
}

interface Chat {
  id: string;
  type: string;
  participants?: any[];
}

const NewChatScreen: React.FC<NewChatScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await getContacts();
      
      if (response.success && response.data) {
        // Filter out system users from contacts
        const filteredContacts = ((response.data || []) as Contact[]).filter(contact => 
          contact.email !== 'system@sabito.com' &&
          contact.email !== 'support@sabito.com'
        );
        setContacts(filteredContacts);
      }
    } catch (error: any) {
      // Error handling
    } finally {
      setIsLoading(false);
    }
  };

  const handleContactPress = async (contact: Contact): Promise<void> => {
    try {
      setIsCreating(true);
      
      // Create chat with this contact
      const response = await createChat({
        type: 'direct',
        participantIds: [contact.id],
      });

      if (response.success && response.data) {
        // Navigate to the new or existing chat
        navigation.replace('ChatConversation', { chatId: response.data.id });
      }
    } catch (error: any) {
      // If error mentions chat already exists, try to find and open it
      if (error.response?.data?.message?.includes('already exists') || 
          error.response?.data?.existingChat) {
        const existingChat = error.response?.data?.existingChat as Chat;
        if (existingChat) {
          navigation.replace('ChatConversation', { chatId: existingChat.id });
        }
      }
    } finally {
      setIsCreating(false);
    }
  };

  const getInitial = (name?: string): string => {
    return name?.charAt(0)?.toUpperCase() || 'U';
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter(contact =>
      contact.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [contacts, searchQuery]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Chat</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: isDark ? colors.backgroundSecondary : '#F4F4F4' }]}>
          <Search size={20} color={colors.iconSecondary} strokeWidth={1.5} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search contacts..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Contacts List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading contacts...</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView 
            style={styles.contactsList} 
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
          {filteredContacts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <User size={48} color={colors.iconSecondary} strokeWidth={1.5} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Contacts</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Your contacts will appear here once you connect with marketers or businesses
              </Text>
            </View>
          ) : (
            filteredContacts.map((contact) => {
              // Format display name for business users
              let displayName = contact.name;
              if (contact.accountType === 'business' && contact.business?.businessName) {
                displayName = `${contact.name} - ${contact.business.businessName}`;
              }
              
              return (
                <TouchableOpacity
                  key={contact.id}
                  style={[styles.contactItem, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}
                  onPress={() => handleContactPress(contact)}
                  disabled={isCreating}
                  activeOpacity={0.7}
                >
                  <View style={styles.contactAvatar}>
                    <Text style={styles.contactAvatarText}>
                      {getInitial(contact.name)}
                    </Text>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>
                      {displayName}
                    </Text>
                    <Text style={[styles.contactType, { color: colors.textSecondary }]}>
                      {contact.accountType === 'business' ? 'Business' : 
                       contact.accountType === 'marketer' ? 'Marketer' : 
                       contact.accountType || 'User'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      )}

      {isCreating && (
        <View style={[styles.creatingOverlay, { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)' }]}>
          <ActivityIndicator size="small" color={COLORS.APP_GREEN} />
          <Text style={[styles.creatingText, { color: colors.textSecondary }]}>Creating chat...</Text>
        </View>
      )}
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
    borderBottomWidth: 1,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: SPACING.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZES.md,
  },
  contactsList: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl * 3,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    minHeight: 72,
  },
  contactAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  contactAvatarText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  contactType: {
    fontSize: FONT_SIZES.sm,
  },
  creatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatingText: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZES.sm,
  },
});

export default NewChatScreen;





