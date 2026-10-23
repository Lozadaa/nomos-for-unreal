import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist' },
  test: { exclude: ['e2e/**', 'node_modules/**'], environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], globals: true, css: false },
})
