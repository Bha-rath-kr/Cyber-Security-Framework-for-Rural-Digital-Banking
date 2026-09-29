import Constants from 'expo-constants';
import { Platform } from 'react-native';

function getApiUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl.replace(/\/+$/, '');

  if (Platform.OS === 'web') {
    return 'http://localhost:5000/api';
  }

  const devServerHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && devServerHost) {
    return `http://${devServerHost}:5000/api`;
  }

  const configuredUrl = Constants.expoConfig?.extra?.apiUrl;
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }

  return 'http://localhost:5000/api';
}

const API_URL = getApiUrl();

export const api_url = API_URL.replace(/\/+$/, '');

console.log(`[GramBank Config] Active API URL: ${api_url}`);