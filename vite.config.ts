import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri expects a fixed dev port and must not have the Rust sources watched by Vite.
const tauriDevHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: tauriDevHost ?? false,
    ...(tauriDevHost ? { hmr: { protocol: 'ws', host: tauriDevHost, port: 1421 } } : {}),
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
});
