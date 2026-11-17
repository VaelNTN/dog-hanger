import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.doghanger.game',
  appName: 'Dog Hanger',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    backgroundColor: '#0f172a',
  },
};

export default config;
