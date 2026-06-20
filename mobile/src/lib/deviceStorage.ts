import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

function getWebStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export const deviceStorage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') {
      return getWebStorage()?.getItem(key) ?? null;
    }

    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') {
      getWebStorage()?.setItem(key, value);
      return;
    }

    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') {
      getWebStorage()?.removeItem(key);
      return;
    }

    await SecureStore.deleteItemAsync(key);
  },
};
