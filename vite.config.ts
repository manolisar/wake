/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' (relative) so the built bundle runs unchanged both from a
// GitHub Pages project subpath AND when opened directly from a corporate
// network share / static file host. See CLAUDE.md §2.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
