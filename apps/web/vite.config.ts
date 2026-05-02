import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@tabnotes/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@tabnotes/ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
});
