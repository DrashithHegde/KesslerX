import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const devApiTarget = env.VITE_DEV_API_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "satellite.js/dist/propagation.js": path.resolve(
          __dirname,
          "node_modules/satellite.js/dist/propagation.js"
        ),
        "satellite.js/dist/io.js": path.resolve(
          __dirname,
          "node_modules/satellite.js/dist/io.js"
        ),
        "satellite.js/dist/transforms.js": path.resolve(
          __dirname,
          "node_modules/satellite.js/dist/transforms.js"
        ),
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        target: "esnext",
      },
    },
    build: {
      target: "esnext",
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
        },
      },
    },
    server: {
      open: "/",
      proxy: {
        "/api": {
          target: devApiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
