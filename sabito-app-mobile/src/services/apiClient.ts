import { DeviceEventEmitter } from 'react-native';
import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, TOKEN_KEY } from '../config/env';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await AsyncStorage.multiRemove([TOKEN_KEY, 'user']);
      DeviceEventEmitter.emit('sabito:logout');
    }
    return Promise.reject(error);
  }
);

export const setAuthToken = async (token: string | null) => {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else {
    await AsyncStorage.multiRemove([TOKEN_KEY, 'user']);
    DeviceEventEmitter.emit('sabito:logout');
  }
};

export const getAuthToken = async () => AsyncStorage.getItem(TOKEN_KEY);

export default apiClient;
