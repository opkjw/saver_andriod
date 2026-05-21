import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.opkjw.savermatrix',
  appName: '야구기록',
  webDir: 'www',
  server: {
    androidScheme: 'https',   // Service Worker 동작을 위해 https scheme 사용
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // 릴리즈 시 false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#1B3A6B',
      showSpinner: false,
    },
  },
};

export default config;
