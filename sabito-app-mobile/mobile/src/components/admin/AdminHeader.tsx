import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MessageCircle, User, ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import apiClient from '../../services/apiClient';

interface Conversation {
  unreadCount?: number;
}

interface ConversationsResponse {
  data?: Conversation[];
}

interface AdminHeaderProps {
  title?: string;
  showBack?: boolean;
  onBackPress?: () => void;
}

const AdminHeader: React.FC<AdminHeaderProps> = ({ 
  title = 'Admin Panel', 
  showBack = false,
  onBackPress 
}) => {
  const navigation = useNavigation();
  const { theme, effectiveTheme, isDark } = useTheme();
  const { colors } = getTheme(effectiveTheme || theme);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Fetch unread message count
  useEffect(() => {
    fetchUnreadCount();
    // Poll every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchUnreadCount = async (): Promise<void> => {
    try {
      // Use correct endpoint: /api/chat/chats (not /api/chat/conversations)
      const response = await apiClient.get<ConversationsResponse>('/api/chat/chats');
      if (response.data?.data) {
        const unread = response.data.data.reduce(
          (count: number, conv: Conversation) => count + (conv.unreadCount || 0),
          0
        );
        setUnreadCount(unread);
      }
    } catch (error: any) {
      // Only log if it's not a 404 (endpoint might not exist for admin)
      if (error?.response?.status !== 404) {
        console.error('Error fetching unread count:', error);
      }
    }
  };

  const handleChatPress = (): void => {
    (navigation as any).navigate('ChatList');
  };

  const handleProfilePress = (): void => {
    (navigation as any).navigate('AdminSettings');
  };

  const handleBack = (): void => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      
      {/* Back Button or Title */}
      {showBack ? (
        <View style={styles.backContainer}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.cardBackground }]}
            onPress={handleBack}
          >
            <ArrowLeft size={24} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Sabito Admin
          </Text>
        </View>
      )}

      {/* Action Icons */}
      <View style={styles.actionsContainer}>
        {!showBack && (
          <>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.cardBackground }]}
              onPress={handleChatPress}
            >
              <MessageCircle size={22} color={colors.text} strokeWidth={2} />
              {unreadCount > 0 && (
                <View style={[styles.badge, { backgroundColor: COLORS.ERROR }]}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.cardBackground }]}
              onPress={handleProfilePress}
            >
              <User size={22} color={colors.text} strokeWidth={2} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 0) + 10,
    paddingBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    zIndex: 10,
  },
  backContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: COLORS.WHITE,
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default AdminHeader;





