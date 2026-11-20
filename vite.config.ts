import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Req 14 c1, c2: static output with relative asset URLs so the build works from the
// root or any subdirectory of a static host. No SSR, no runtime import.meta.env values.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
