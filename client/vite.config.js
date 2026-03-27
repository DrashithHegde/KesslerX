import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 1. Tell the dependency optimizer to allow modern JS
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  // 2. Tell the final build process to allow modern JS
  build: {
    target: "esnext",
  },
})