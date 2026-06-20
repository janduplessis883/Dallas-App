import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        accountCreated: resolve(__dirname, 'account-created/index.html'),
        checkInReply: resolve(__dirname, 'check-in-reply/index.html'),
        resetPassword: resolve(__dirname, 'reset-password/index.html'),
      },
    },
  },
});
