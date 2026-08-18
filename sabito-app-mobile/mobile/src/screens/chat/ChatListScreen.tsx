import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, MessageCircle, Plus, User } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserChats } from '../../api/chat';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import AnimatedListItem from '../../components/common/AnimatedListItem';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import socketService from '../../services/socketService';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Chat, User as UserType, Message } from '../../types/api';

type ChatListScreenProps = RootStackScreenProps<'ChatList'>;

const ChatListScreen: React.FC<ChatListScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [user, setUser] = useState<UserType | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Memoize helper functions to prevent recreation on every render
  const getChatNameMemo = useCallback((chat: Chat): string => {
    if (chat.type === 'system') return 'System Notification';
    
    if (chat.type === 'direct' && chat.participants && chat.participants.length > 0) {
      const participant = chat.participants.find(p => p.user?.id !== user?.id);
      const participantEmail = participant?.user?.email || participant?.email;
      
      // Check if it's Sabito Support (two-way support chat)
      if (participantEmail === 'support@sabito.com') {
        return 'Support Team';
      }
      
      const participantName = participant?.user?.name || participant?.name || 'Unknown User';
      const participantAccountType = participant?.user?.accountType || participant?.accountType;
      
      // If participant is a business, append business name
      if (participantAccountType === 'business') {
        const businessName = participant?.user?.business?.businessName || participant?.business?.businessName;
        if (businessName) {
          return `${participantName} - ${businessName}`;
        }
      }
      
      return participantName;
    }
    
    return chat.name || 'Group Chat';
  }, [user?.id]);

  const loadChats = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await getUserChats();
      if (response.success && response.data) {
        setChats(response.data);
      }
    } catch (error: any) {
      // Error handling
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let handleNewMessage: ((message: Message) => void) | null = null;
    let handleMessageUpdate: ((data: any) => void) | null = null;

    const initializeSocket = async (): Promise<void> => {
      if (!isMounted) return;
      
      const loadUserAndChats = async (): Promise<void> => {
        try {
          const userData = await AsyncStorage.getItem('user');
          if (userData) {
            setUser(JSON.parse(userData) as UserType);
          }
          await loadChats();
        } catch (error: any) {
          // Error handling
        }
      };
      
      await loadUserAndChats();
      
      // Connect to socket and listen for real-time updates
      await socketService.connect();
      
      // Listen for new messages to update chat list in real-time
      handleNewMessage = (message: Message): void => {
        if (!isMounted) return;
        console.log('📩 [ChatList] Received message:', message?.id);
        
        // Update the chat list with the new message
        setChats(prevChats => {
          // Show in-app notification if message is not from current user
          if (message.senderId !== user?.id) {
            // Get chat name for notification
            const chat = prevChats.find(c => c.id === message.chatId);
            const chatName = chat ? getChatNameMemo(chat) : 'New Message';
          }
          
          const updatedChats = prevChats.map(chat => {
            if (chat.id === message.chatId) {
              // Add new message to chat's messages array (avoid duplicates)
              const existingIds = new Set(chat.messages?.map(m => m.id) || []);
              if (existingIds.has(message.id)) {
                return chat;
              }
              const updatedMessages = [...(chat.messages || []), message];
              return {
                ...chat,
                messages: updatedMessages,
                updatedAt: message.createdAt || new Date().toISOString(),
              };
            }
            return chat;
          });
          
          // If chat doesn't exist, we'll need to reload chats
          const chatExists = updatedChats.some(chat => chat.id === message.chatId);
          if (!chatExists) {
            // Reload chats to get the new chat
            loadChats();
            return prevChats;
          }
          
          // Sort chats by most recent message
          return updatedChats.sort((a, b) => {
            const aTime = a.messages?.[a.messages.length - 1]?.createdAt || a.updatedAt || '';
            const bTime = b.messages?.[b.messages.length - 1]?.createdAt || b.updatedAt || '';
            return new Date(bTime).getTime() - new Date(aTime).getTime();
          });
        });
      };

      handleMessageUpdate = (data: any): void => {
        if (!isMounted) return;
        
        setChats(prevChats => {
          return prevChats.map(chat => {
            if (chat.id === data.chatId) {
              return {
                ...chat,
                messages: chat.messages?.map(msg => 
                  msg.id === data.messageId ? { ...msg, ...data.updates } : msg
                ) || [],
              };
            }
            return chat;
          });
        });
      };

      // Remove any existing listeners first to prevent duplicates
      socketService.off('new_message');
      socketService.off('message_updated');
      
      // Use the generic 'on' method for proper cleanup tracking
      socketService.on('new_message', handleNewMessage);
      socketService.on('message_updated', handleMessageUpdate);
      
      console.log('🔌 [ChatList] Socket listeners set up');
    };

    initializeSocket();
    
    return () => {
      isMounted = false;
      console.log('🔌 [ChatList] Cleaning up socket listeners');
      // Cleanup socket listeners properly with specific handlers
      if (handleNewMessage) {
        socketService.off('new_message', handleNewMessage);
      }
      if (handleMessageUpdate) {
        socketService.off('message_updated', handleMessageUpdate);
      }
    };
  }, [user?.id, getChatNameMemo, loadChats]);

  const handleRefresh = useCallback((): void => {
    setIsRefreshing(true);
    loadChats();
  }, [loadChats]);

  // Use memoized version
  const getChatName = getChatNameMemo;

  const getChatSubtitle = (chat: Chat): string => {
    if (!chat.messages || chat.messages.length === 0) return 'No messages yet';
    
    const lastMessage = chat.messages[chat.messages.length - 1];
    const prefix = lastMessage.sender.id === user?.id ? 'You: ' : '';
    return prefix + (lastMessage.content || '');
  };

  const getUnreadCount = (chat: Chat): number => {
    if (!chat.messages) return 0;
    return chat.messages.filter(message => 
      message.sender.id !== user?.id && message.status !== 'read'
    ).length;
  };

  const formatTime = (dateString?: string): string => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getInitial = (name?: string): string => {
    return name?.charAt(0)?.toUpperCase() || 'U';
  };

  // Memoize filtered chats to prevent unnecessary recalculations
  const filteredChats = useMemo(() => {
    return chats.filter(chat =>
      getChatNameMemo(chat).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [chats, searchQuery, getChatNameMemo]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading chats...</Text>
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
        <TouchableOpacity 
          style={[styles.newChatButton, { backgroundColor: isDark ? colors.backgroundSecondary : '#F0FDF4' }]}
          onPress={() => navigation.navigate('NewChat')}
        >
          <Plus size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: isDark ? colors.backgroundSecondary : '#F4F4F4' }]}>
          <Search size={20} color={colors.iconSecondary} strokeWidth={1.5} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search conversations..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Chat List - Using FlatList for better performance */}
      <FlatList
        data={filteredChats}
        keyExtractor={(item) => item.id}
        style={styles.chatList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.APP_GREEN]}
          />
        }
        renderItem={({ item: chat, index }) => {
          const unreadCount = getUnreadCount(chat);
          const lastMessage = chat.messages?.[chat.messages.length - 1];
          
          return (
            <AnimatedListItem index={index} delay={50}>
              <TouchableOpacity
              style={[styles.chatItem, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}
              onPress={() => navigation.navigate('ChatConversation', { chatId: chat.id })}
              activeOpacity={0.7}
            >
              {/* Avatar */}
              <View style={styles.avatarContainer}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {getInitial(getChatName(chat))}
                  </Text>
                </View>
              </View>

              {/* Chat Info */}
              <View style={styles.chatInfo}>
                <View style={styles.chatHeader}>
                  <Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>
                    {getChatName(chat)}
                  </Text>
                  {lastMessage && (
                    <Text style={[styles.chatTime, { color: colors.textSecondary }]}>
                      {formatTime(lastMessage.createdAt)}
                    </Text>
                  )}
                </View>
                <View style={styles.chatPreviewRow}>
                  <Text 
                    style={[
                      styles.chatPreview,
                      { color: colors.textSecondary },
                      unreadCount > 0 && [styles.chatPreviewUnread, { color: colors.text }]
                    ]} 
                    numberOfLines={1}
                  >
                    {getChatSubtitle(chat)}
                  </Text>
                  {unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
            </AnimatedListItem>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MessageCircle size={48} color={colors.iconSecondary} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Conversations</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Start a new conversation by tapping the + button above
            </Text>
          </View>
        }
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={10}
        getItemLayout={(data, index) => ({
          length: 72,
          offset: 72 * index,
          index,
        })}
      />
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
    flex: 1,
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: SPACING.sm,
  },
  newChatButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
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
  chatList: {
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
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    minHeight: 72,
  },
  avatarContainer: {
    marginRight: SPACING.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginRight: SPACING.sm,
  },
  chatTime: {
    fontSize: FONT_SIZES.xs,
  },
  chatPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatPreview: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    marginRight: SPACING.sm,
  },
  chatPreviewUnread: {
    fontWeight: FONT_WEIGHTS.semibold,
  },
  unreadBadge: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
});

export default ChatListScreen;





