import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento o Vite (5173) repassa a API pro backend (3000); em produção o Express serve o dist.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/capas': 'http://localhost:3000',
    },
  },
});
