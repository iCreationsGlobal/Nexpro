import React, { useState, useEffect, useRef } from 'react';
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
import { Send, CheckCircle, CheckCheck } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getChatMessages, markMessagesAsRead, getUserChats } from '../../api/chat';
import socketService from '../../services/socketService';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Chat, User as UserType, Message } from '../../types/api';

type ChatConversationScreenProps = RootStackScreenProps<'ChatConversation'>;

const ChatConversationScreen: React.FC<ChatConversationScreenProps> = ({ navigation, route }) => {
  const { chatId } = route.params;
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [user, setUser] = useState<UserType | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load chat from chats list
  useEffect(() => {
    const loadChat = async (): Promise<void> => {
      try {
        const response = await getUserChats();
        if (response.success && response.data) {
          const foundChat = response.data.find(c => c.id === chatId);
          if (foundChat) {
            setChat(foundChat);
          } else {
            // Chat not found, go back
            navigation.goBack();
            return;
          }
        }
      } catch (error: any) {
        navigation.goBack();
      }
    };
    loadChat();
  }, [chatId]);

  // Validate chat data
  useEffect(() => {
    if (!chat || !chat.id) {
      if (chat === null) return; // Still loading
      navigation.goBack();
      return;
    }
  }, [chat]);

  useEffect(() => {
    if (!chat) return;
    
    loadUserAndMessages();
    
    // Message handler - defined here so we can properly remove it
    const handleNewMessage = (message: Message): void => {
      console.log('📩 [ChatConversation] Received message:', message.id, 'for chat:', message.chatId);
      if (message.chatId === chat.id) {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === message.id)) {
            return prev;
          }
          return [...prev, message];
        });
        
        // Mark as read if not from current user
        if (message.senderId !== user?.id) {
          markMessagesAsRead(chat.id).catch(() => {});
        }
        
        // Scroll to bottom
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    };
    
    // Typing handler
    const handleTyping = (data: any): void => {
      if (data.chatId === chat.id && data.userId !== user?.id) {
        setIsTyping(data.isTyping);
      }
    };
    
    // Connect to socket and join chat room
    const setupSocket = async (): Promise<void> => {
      await socketService.connect();
      socketService.joinChat(chat.id);
      
      // Remove any existing listeners first to prevent duplicates
      socketService.off('new_message');
      socketService.off('user_typing');
      
      // Listen for new messages using the generic 'on' method
      socketService.on('new_message', handleNewMessage);
      socketService.on('user_typing', handleTyping);
      
      console.log('🔌 [ChatConversation] Socket listeners set up for chat:', chat.id);
    };
    
    setupSocket();

    return () => {
      console.log('🔌 [ChatConversation] Cleaning up socket listeners for chat:', chat?.id);
      if (chat) {
        // Leave chat room and cleanup with specific handlers
        socketService.leaveChat(chat.id);
        socketService.off('new_message', handleNewMessage);
        socketService.off('user_typing', handleTyping);
      }
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [chat?.id, user?.id]);

  const loadUserAndMessages = async (): Promise<void> => {
    if (!chat) return;
    
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        setUser(JSON.parse(userData) as UserType);
      }
      await loadMessages();
    } catch (error: any) {
      // Error handling
    }
  };

  const loadMessages = async (): Promise<void> => {
    if (!chat) return;
    
    try {
      // Load messages for ALL chat types (including system)
      const response = await getChatMessages(chat.id);
      
      if (response.success && response.data) {
        setMessages(response.data);
        // Mark as read
        try {
          await markMessagesAsRead(chat.id);
        } catch (readError: any) {
          // Error handling
        }
      }
    } catch (error: any) {
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (): Promise<void> => {
    if (!newMessage.trim() || !chat) return;

    const messageContent = newMessage.trim();
    setNewMessage('');

    try {
      setIsSending(true);
      
      // Send via WebSocket
      const sent = socketService.sendMessage(chat.id, messageContent);
      
      if (!sent) {
        // Fallback to API if socket not connected
        showDialog({
          title: 'Connection Issue',
          message: 'Unable to send message. Please check your connection.',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
        setNewMessage(messageContent); // Restore message
      } else {
        // Stop typing indicator
        socketService.sendTypingStatus(chat.id, false);
        
        // Scroll to bottom
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error: any) {
      setNewMessage(messageContent); // Restore message on error
      showDialog({
        title: 'Error',
        message: 'Failed to send message',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsSending(false);
    }
  };

  // Handle typing indicator
  const handleTextChange = (text: string): void => {
    if (!chat) return;
    
    setNewMessage(text);
    
    // Send typing indicator
    if (text.trim()) {
      socketService.sendTypingStatus(chat.id, true);
      
      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Stop typing after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        socketService.sendTypingStatus(chat.id, false);
      }, 2000);
    } else {
      socketService.sendTypingStatus(chat.id, false);
    }
  };

  const getChatName = (): string => {
    if (!chat) return '';
    
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
  };

  const getChatSubtitle = (): string => {
    if (!chat) return '';
    
    if (chat.type === 'system') return 'Automated platform updates';
    
    if (chat.type === 'direct' && chat.participants && chat.participants.length > 0) {
      const participant = chat.participants.find(p => p.user?.id !== user?.id);
      const participantEmail = participant?.user?.email || participant?.email;
      
      // Check if it's Sabito Support
      if (participantEmail === 'support@sabito.com') {
        return 'Get help from our team';
      }
      
      const accountType = participant?.user?.accountType || participant?.accountType || '';
      return accountType.charAt(0).toUpperCase() + accountType.slice(1);
    }
    
    return `${chat.participants?.length || 0} participants`;
  };

  // Check if chat input should be disabled (one-way communication)
  const isReadOnlyChat = (): boolean => {
    if (!chat) return true;
    
    // System chats are read-only (platform notifications from Sabito)
    if (chat.type === 'system') return true;
    
    // Check if it's a chat with system@sabito.com (one-way notifications)
    if (chat.type === 'direct' && chat.participants && chat.participants.length > 0) {
      const participant = chat.participants.find(p => p.user?.id !== user?.id);
      const participantEmail = participant?.user?.email || participant?.email;
      if (participantEmail === 'system@sabito.com') return true;
    }
    
    return false;
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getInitial = (): string => {
    const name = getChatName();
    return name?.charAt(0)?.toUpperCase() || 'U';
  };

  const renderMessageStatus = (message: Message): React.ReactElement | null => {
    if (message.sender.id !== user?.id) return null;

    if (message.status === 'read') {
      return <CheckCheck size={16} color="#4FC3F7" strokeWidth={2} />;
    } else if (message.status === 'delivered') {
      return <CheckCheck size={16} color={COLORS.GRAY} strokeWidth={2} />;
    } else {
      return <CheckCircle size={16} color={COLORS.GRAY} strokeWidth={2} />;
    }
  };

  const groupMessagesByDate = (messages: Message[]): Record<string, Message[]> => {
    const groups: Record<string, Message[]> = {};
    
    messages.forEach(message => {
      const date = new Date(message.createdAt);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      let dateKey: string;
      if (date.toDateString() === today.toDateString()) {
        dateKey = 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateKey = 'Yesterday';
      } else {
        dateKey = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      }
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(message);
    });
    
    return groups;
  };

  const messageGroups = groupMessagesByDate(messages);

  if (!chat || isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading messages...</Text>
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
        
        <View style={[styles.avatarContainer, { marginLeft: SPACING.sm }]}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{getInitial()}</Text>
          </View>
        </View>

        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>{getChatName()}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>{getChatSubtitle()}</Text>
        </View>

        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Messages */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={COLORS.APP_GREEN} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading messages...</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={[styles.messagesContainer, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
          >
            {Object.entries(messageGroups).map(([date, msgs]) => (
              <View key={date}>
                {/* Date Separator */}
                <View style={[styles.dateSeparator, { 
                  backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
                  borderWidth: 1,
                  borderColor: colors.border
                }]}>
                  <Text style={[styles.dateSeparatorText, { color: colors.textSecondary }]}>{date}</Text>
                </View>

                {/* Messages */}
                {msgs.map((message) => {
                  const isOwn = message.sender.id === user?.id;
                  
                  return (
                    <View
                      key={message.id}
                      style={[
                        styles.messageBubbleContainer,
                        isOwn ? styles.ownMessageContainer : styles.otherMessageContainer,
                      ]}
                    >
                      <View style={[
                        styles.messageBubble,
                        isOwn ? styles.ownMessage : [styles.otherMessage, { backgroundColor: colors.cardBackground }],
                      ]}>
                        <Text style={[
                          styles.messageText,
                          isOwn ? styles.ownMessageText : [styles.otherMessageText, { color: colors.text }],
                        ]}>
                          {message.content}
                        </Text>
                        <View style={styles.messageFooter}>
                          <Text style={[
                            styles.messageTime,
                            isOwn ? styles.ownMessageTime : [styles.otherMessageTime, { color: colors.textSecondary }],
                          ]}>
                            {formatTime(message.createdAt)}
                          </Text>
                          {isOwn && renderMessageStatus(message)}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        )}

        {/* Input Area - Only show for two-way chats */}
        {!isReadOnlyChat() ? (
          <View style={[styles.inputContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            <View style={[styles.inputWrapper, { backgroundColor: isDark ? colors.backgroundSecondary : '#F4F4F4' }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Type a message..."
                placeholderTextColor={colors.textSecondary}
                value={newMessage}
                onChangeText={handleTextChange}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!newMessage.trim() || isSending) && styles.sendButtonDisabled,
                ]}
                onPress={handleSendMessage}
                disabled={!newMessage.trim() || isSending}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color={COLORS.WHITE} />
                ) : (
                  <Send size={20} color={COLORS.WHITE} strokeWidth={2} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.readOnlyNotice, { 
            backgroundColor: isDark ? colors.backgroundSecondary : '#FEF3C7',
            borderTopColor: colors.border 
          }]}>
            <Text style={[styles.readOnlyText, { color: isDark ? colors.textSecondary : '#92400E' }]}>
              This is a one-way notification channel. You cannot reply to these messages.
            </Text>
          </View>
        )}
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: SPACING.sm,
  },
  avatarContainer: {
    marginRight: SPACING.sm,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    textTransform: 'capitalize',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZES.sm,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    alignSelf: 'center',
  },
  dateSeparatorText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  messageBubbleContainer: {
    marginVertical: 2,
  },
  ownMessageContainer: {
    alignItems: 'flex-end',
  },
  otherMessageContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  ownMessage: {
    backgroundColor: COLORS.APP_GREEN,
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: FONT_SIZES.md,
    lineHeight: 20,
  },
  ownMessageText: {
    color: COLORS.WHITE,
  },
  otherMessageText: {
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  messageTime: {
    fontSize: FONT_SIZES.xs,
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  otherMessageTime: {
  },
  inputContainer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: SPACING.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 24,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    maxHeight: 100,
    marginRight: SPACING.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.GRAY,
    opacity: 0.5,
  },
  readOnlyNotice: {
    padding: SPACING.md,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  readOnlyText: {
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default ChatConversationScreen;





