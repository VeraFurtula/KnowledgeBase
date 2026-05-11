import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { kbEfrontE2eTriggerPlugin } from "./vite-plugin-kb-efront-e2e-trigger";

/**
 * Browser → same-origin `/ollama/v1/...` → Ollama at 127.0.0.1:11434 (avoids CORS during `npm run dev`).
 * Set `VITE_LLM_BASE_URL=/ollama/v1` in `.env.local`. For production, proxy `/ollama` on your host or use a backend.
 */
export default defineConfig({
  plugins: [react(), kbEfrontE2eTriggerPlugin()],
  server: {
    proxy: {
      "/ollama": {
        target: "http://127.0.0.1:11434",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, ""),
      },
      "/api/rag": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rag/, ""),
      },
    },
  },
});
