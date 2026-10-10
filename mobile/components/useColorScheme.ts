import { useColorScheme as useNativeColorScheme } from 'react-native';

/** Normalize native unspecified appearance to the light palette. */
export function useColorScheme(): 'light' | 'dark' {
  return useNativeColorScheme() === 'dark' ? 'dark' : 'light';
}
