import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' so Electron can load dist/index.html from disk
export default defineConfig({ base: './', plugins: [react(), tailwindcss()] })
