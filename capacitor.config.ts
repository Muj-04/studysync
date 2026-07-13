import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.studysync.app',
  appName: 'StudySync',
  webDir: 'out',
  server: {
    url: 'http://10.0.2.2:3000',
    cleartext: true,
    androidScheme: 'https',
  },
  android: {
    overrideUserAgent: 'StudySync/1.0 Android',
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
