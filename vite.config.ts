import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from the repository sub-path.
export default defineConfig({
  base: '/audio-annotator/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
