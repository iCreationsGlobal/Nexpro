/**
 * Auth adapters for existing Sabito marketer screens (ABS-backed).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loginMarketer,
  registerMarketer,
  getMarketerSession,
  logoutMarketer,
  updateMarketerProfile,
} from './absMarketer';

export const loginUser = async (email: string, password: string) => {
  const data = await loginMarketer({ email, password });
  const user = {
    ...data.marketer,
    id: data.marketer.id,
    userID: data.marketer.id,
  };
  await AsyncStorage.setItem('user', JSON.stringify(user));
  return {
    token: data.token,
    accessToken: data.token,
    user,
  };
};

export const createPassword = async (data: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}) => {
  const result = await registerMarketer({
    name: data.name,
    email: data.email,
    phone: data.phone,
    password: data.password,
  });
  const user = {
    ...result.marketer,
    userID: result.marketer.id,
  };
  await AsyncStorage.setItem('user', JSON.stringify(user));
  return {
    token: result.token,
    accessToken: result.token,
    user,
  };
};

export const getCurrentUser = async () => {
  const data = await getMarketerSession();
  return {
    ...data.marketer,
    userID: data.marketer.id,
  };
};

export const updateProfile = updateMarketerProfile;
export const logout = logoutMarketer;

/** Google sign-in is not supported on ABS marketer auth (email/password only). */
export const googleSignIn = async () => {
  throw new Error('Google sign-in is not available. Use email and password.');
};

/** Legacy Sabito Google signup — not supported on ABS marketer auth. */
export const completeGoogleSignup = async (_data?: unknown) => {
  throw new Error('Google signup is not available. Use email and password.');
};

export default {
  loginUser,
  createPassword,
  getCurrentUser,
  updateProfile,
  logout,
  googleSignIn,
  completeGoogleSignup,
};
