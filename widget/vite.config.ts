import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      name: 'VinaCaptcha',
      fileName: () => 'vina-captcha.js',
      formats: ['iife'],
    },
    target: 'es2015',
    minify: true,
  },
});
