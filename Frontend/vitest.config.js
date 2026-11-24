/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import storefrontPackage from '../storefront/package.json'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['node_modules', 'dist', 'build'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
        '**/*.d.ts',
        '**/*.test.{js,jsx,ts,tsx}',
        '**/index.js',
      ],
    },
  },
  resolve: {
    // Storefront pages are tested here; resolve their packages from Frontend (CI does not install storefront).
    dedupe: Object.keys(storefrontPackage.dependencies),
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
