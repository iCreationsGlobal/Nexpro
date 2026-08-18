import apiClient from '../services/apiClient';
import type { ApiResponse, Chat, Message } from '../types/api';

interface ChatData {
  type: 'direct' | 'group' | 'system';
  participantIds: string[];
  [key: string]: any;
}

interface MessageData {
  content: string;
  type?: 'text' | 'image' | 'file';
  [key: string]: any;
}

// Get all user chats
export const getUserChats = async (): Promise<ApiResponse<Chat[]>> => {
  try {
    const response = await apiClient.get<ApiResponse<Chat[]>>('/api/chat/chats');
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

// Get messages for a specific chat
export const getChatMessages = async (
  chatId: string, 
  page: number = 1, 
  limit: number = 50
): Promise<ApiResponse<Message[]>> => {
  try {
    const response = await apiClient.get<ApiResponse<Message[]>>(
      `/api/chat/chats/${chatId}/messages?page=${page}&limit=${limit}`
    );
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

// Create a new chat
export const createChat = async (chatData: ChatData): Promise<ApiResponse<Chat>> => {
  try {
    const response = await apiClient.post<ApiResponse<Chat>>('/api/chat/chats', chatData);
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

// Send a message
export const sendMessage = async (
  chatId: string, 
  messageData: MessageData
): Promise<ApiResponse<Message>> => {
  try {
    const response = await apiClient.post<ApiResponse<Message>>(
      `/api/chat/chats/${chatId}/messages`,
      messageData
    );
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

// Mark messages as read
export const markMessagesAsRead = async (chatId: string): Promise<ApiResponse> => {
  try {
    const response = await apiClient.patch<ApiResponse>(
      `/api/chat/chats/${chatId}/mark-read`,
      {}
    );
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

interface Contact {
  id: string;
  name: string;
  email?: string;
  profileImage?: string;
  accountType: 'marketer' | 'business' | 'admin';
  [key: string]: any;
}

// Get contacts (marketers/businesses user can chat with)
export const getContacts = async (): Promise<ApiResponse<Contact[]>> => {
  try {
    const response = await apiClient.get<ApiResponse<Contact[]>>('/api/chat/contacts');
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

// Create system chat
export const createSystemChat = async (): Promise<ApiResponse<Chat>> => {
  try {
    const response = await apiClient.post<ApiResponse<Chat>>(
      '/api/system-notifications/chat',
      {}
    );
    return response.data;
  } catch (error: any) {
    throw error;
  }
};






