/**
 * Socket.IO Service
 * Handles real-time communication using WebSocket
 */

import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/env';

interface Message {
  id?: string;
  chatId?: string;
  senderId?: string;
  content?: string;
  type?: string;
  read?: boolean;
  createdAt?: string;
  [key: string]: any;
}

interface TypingData {
  chatId: string;
  userId: string;
  isTyping: boolean;
  [key: string]: any;
}

interface OnlineStatusData {
  userId: string;
  isOnline: boolean;
  [key: string]: any;
}

interface NotificationData {
  id?: string;
  type?: string;
  title?: string;
  message?: string;
  userId?: string;
  createdAt?: string;
  [key: string]: any;
}

type EventCallback = (data: any) => void;

class SocketService {
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private messageListeners: EventCallback[] = [];
  private eventListeners: Map<string, EventCallback[]> = new Map();

  /**
   * Initialize socket connection
   */
  async connect(): Promise<void> {
    try {
      if (this.socket && this.isConnected) {
        console.log('✅ Socket already connected');
        return;
      }

      const accessToken = await AsyncStorage.getItem('accessToken');
      if (!accessToken) {
        console.log('⚠️ No access token, cannot connect to socket');
        return;
      }

      // Get base URL and ensure it's properly formatted for Socket.IO
      let baseURL = API_CONFIG.baseURL;
      
      // Socket.IO automatically handles http -> ws and https -> wss
      // But we need to ensure the URL doesn't have trailing slashes
      baseURL = baseURL.replace(/\/+$/, '');
      
      console.log('🔌 Connecting to socket server:', baseURL);
      
      this.socket = io(baseURL, {
        transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
        upgrade: true, // Allow upgrading from polling to websocket
        rememberUpgrade: true, // Remember the transport choice
        auth: {
          token: accessToken,
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity, // Keep trying to reconnect in production
        timeout: 20000, // Connection timeout
        forceNew: false, // Reuse existing connection if available
      });

      this.setupEventListeners();
      console.log('🔌 Socket connection initiated');
    } catch (error: any) {
      console.error('❌ Socket connection error:', error);
      // Don't throw - allow app to continue without socket
    }
  }

  /**
   * Setup default socket event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log('✅ Socket connected:', this.socket?.id);
    });

    this.socket.on('disconnect', (reason: string) => {
      this.isConnected = false;
      console.log('❌ Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('❌ Socket connection error:', error.message);
      // In production, log but don't spam console
      if (__DEV__) {
        console.error('Socket error details:', error);
      }
    });

    this.socket.on('error', (error: Error) => {
      console.error('❌ Socket error:', error);
    });

    // Handle reconnection
    this.socket.on('reconnect', (attemptNumber: number) => {
      this.isConnected = true;
      console.log('✅ Socket reconnected after', attemptNumber, 'attempts');
    });

    this.socket.on('reconnect_error', (error: Error) => {
      console.error('❌ Socket reconnection error:', error.message);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ Socket reconnection failed');
    });
    
    // DEBUG: Log ALL incoming events to see what the server sends
    this.socket.onAny((eventName: string, ...args: any[]) => {
      console.log(`📨 [Socket] Event received: "${eventName}"`, JSON.stringify(args).substring(0, 200));
    });
  }

  /**
   * Disconnect socket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.messageListeners = [];
      this.eventListeners.clear();
      console.log('🔌 Socket disconnected');
    }
  }

  /**
   * Check if socket is connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Join a chat room
   */
  joinChat(chatId: string): void {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot join chat. Connected:', this.isConnected, 'Socket:', !!this.socket);
      return;
    }

    this.socket.emit('join_chat', { chatId });
    console.log(`📥 [Socket] Joined chat room: ${chatId}, Socket ID: ${this.socket.id}`);
  }

  /**
   * Leave a chat room
   */
  leaveChat(chatId: string): void {
    if (!this.socket || !this.isConnected) {
      return;
    }

    this.socket.emit('leave_chat', { chatId });
    console.log(`📤 Left chat: ${chatId}`);
  }

  /**
   * Send a message
   */
  sendMessage(chatId: string, content: string, data: Record<string, any> = {}): boolean {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot send message');
      return false;
    }

    this.socket.emit('send_message', {
      chatId,
      content,
      ...data,
    });
    console.log(`📨 Message sent to chat: ${chatId}`);
    return true;
  }

  /**
   * Listen for new messages
   * @deprecated Use on('new_message', callback) instead for better cleanup
   */
  onNewMessage(callback: (message: Message) => void): void {
    if (!this.socket) {
      console.warn('⚠️ Cannot listen to new_message, socket not initialized');
      return;
    }

    const handler = (message: Message) => {
      console.log('📩 New message received:', message?.id);
      callback(message);
    };

    this.socket.on('new_message', handler);
    
    // Store listener for cleanup
    if (!this.eventListeners.has('new_message')) {
      this.eventListeners.set('new_message', []);
    }
    this.eventListeners.get('new_message')!.push(handler);
  }

  /**
   * Listen for message updates (read status, etc.)
   */
  onMessageUpdate(callback: (data: any) => void): void {
    if (!this.socket) {
      console.warn('⚠️ Cannot listen to message_updated, socket not initialized');
      return;
    }

    const handler = (data: any) => {
      console.log('📝 Message updated:', data);
      callback(data);
    };

    this.socket.on('message_updated', handler);
    
    // Store listener for cleanup
    if (!this.eventListeners.has('message_updated')) {
      this.eventListeners.set('message_updated', []);
    }
    this.eventListeners.get('message_updated')!.push(handler);
  }

  /**
   * Listen for typing indicator
   */
  onUserTyping(callback: (data: TypingData) => void): void {
    if (!this.socket) {
      console.warn('⚠️ Cannot listen to user_typing, socket not initialized');
      return;
    }

    const handler = (data: TypingData) => {
      callback(data);
    };

    this.socket.on('user_typing', handler);
    
    // Store listener for cleanup
    if (!this.eventListeners.has('user_typing')) {
      this.eventListeners.set('user_typing', []);
    }
    this.eventListeners.get('user_typing')!.push(handler);
  }

  /**
   * Send typing indicator
   */
  sendTypingStatus(chatId: string, isTyping: boolean): void {
    if (!this.socket || !this.isConnected) return;

    this.socket.emit('typing', { chatId, isTyping });
  }

  /**
   * Listen for user online status
   */
  onUserOnlineStatus(callback: (data: OnlineStatusData) => void): void {
    if (!this.socket) return;

    this.socket.on('user_online_status', (data: OnlineStatusData) => {
      callback(data);
    });
  }

  /**
   * Listen for system notifications
   */
  onSystemNotification(callback: (notification: NotificationData) => void): void {
    if (!this.socket) {
      console.warn('⚠️ Cannot listen to system_notification, socket not initialized');
      return;
    }

    const handler = (notification: NotificationData) => {
      console.log('🔔 System notification received:', notification);
      callback(notification);
    };

    this.socket.on('system_notification', handler);
    
    // Store listener for cleanup
    if (!this.eventListeners.has('system_notification')) {
      this.eventListeners.set('system_notification', []);
    }
    this.eventListeners.get('system_notification')!.push(handler);
  }

  /**
   * Generic event listener
   */
  on(event: string, callback: EventCallback): void {
    if (!this.socket) {
      console.warn(`⚠️ Cannot listen to ${event}, socket not initialized`);
      return;
    }

    this.socket.on(event, callback);
    
    // Store listener for cleanup
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
    
    console.log(`👂 [Socket] Listener registered for event: "${event}", total listeners: ${this.eventListeners.get(event)!.length}`);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback?: EventCallback): void {
    if (!this.socket) return;

    if (callback) {
      this.socket.off(event, callback);
      
      // Remove from stored listeners
      if (this.eventListeners.has(event)) {
        const listeners = this.eventListeners.get(event)!;
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
        console.log(`🔇 [Socket] Listener removed for event: "${event}", remaining: ${listeners.length}`);
      }
    } else {
      this.socket.off(event);
      const count = this.eventListeners.get(event)?.length || 0;
      this.eventListeners.delete(event);
      console.log(`🔇 [Socket] ALL listeners removed for event: "${event}" (was ${count})`);
    }
  }

  /**
   * Emit a custom event
   */
  emit(event: string, data: any): boolean {
    if (!this.socket || !this.isConnected) {
      console.warn(`⚠️ Cannot emit ${event}, socket not connected`);
      return false;
    }

    this.socket.emit(event, data);
    return true;
  }

  /**
   * Get socket instance (for advanced use cases)
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}

// Export singleton instance
const socketService = new SocketService();
export default socketService;






