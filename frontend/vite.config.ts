import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig} from 'vite';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const apiTarget = process.env.VITE_API_URL || 'http://localhost:5000';

if (process.env.VERCEL === '1') {
  if (!process.env.VITE_API_URL) throw new Error('VITE_API_URL must point to the API for this Vercel environment.');
  const expectedRef = process.env.VITE_SUPABASE_EXPECTED_PROJECT_REF || '';
  const frontendSupabaseUrl = process.env.VITE_SUPABASE_URL || '';
  let actualRef = '';
  try { actualRef = new URL(frontendSupabaseUrl).hostname.split('.')[0]; } catch {}
  if (!/^[a-z0-9]{20}$/.test(expectedRef) || actualRef !== expectedRef) {
    throw new Error('VITE_SUPABASE_URL must match VITE_SUPABASE_EXPECTED_PROJECT_REF for this Vercel environment.');
  }
  if (process.env.VERCEL_ENV === 'preview' && process.env.VITE_DEPLOYMENT_TIER !== 'staging') {
    throw new Error('Vercel Preview deployments must use VITE_DEPLOYMENT_TIER=staging and staging API/Supabase projects.');
  }
  if (process.env.VERCEL_ENV === 'production' && process.env.VITE_DEPLOYMENT_TIER !== 'production') {
    throw new Error('Vercel Production deployments must use VITE_DEPLOYMENT_TIER=production.');
  }
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': configDir,
      },
    },
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: apiTarget,
          ws: true,
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
