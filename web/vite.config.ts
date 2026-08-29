import { sites } from '@openai/sites-vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/cheap-product-looker/' : '/',
  plugins: [react(), sites()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4174' },
  },
}));
