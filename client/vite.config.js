import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // satellite.js@7 blocks deep imports via `exports`, but we intentionally
      // import the JS-only dist modules to avoid pulling in the WASM runtime.
      'satellite.js/dist/propagation.js': path.resolve(
        __dirname,
        'node_modules/satellite.js/dist/propagation.js'
      ),
      'satellite.js/dist/io.js': path.resolve(
        __dirname,
        'node_modules/satellite.js/dist/io.js'
      ),
      'satellite.js/dist/transforms.js': path.resolve(
        __dirname,
        'node_modules/satellite.js/dist/transforms.js'
      ),
    },
  },
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
  // 3. Always open browser on dev
  server: {
    open: true,
  },
})