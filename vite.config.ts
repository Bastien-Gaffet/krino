import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const racine = (f: string) => fileURLToPath(new URL(f, import.meta.url));

// https://vite.dev/config/
export default defineConfig(async () => ({

  // Deux pages : `index.html` (desktop, Tauri) et `mobile.html` (pré-tri mobile).
  build: {
    rollupOptions: {
      input: {
        desktop: racine("index.html"),
        mobile: racine("mobile.html"),
      },
    },
  },

  // Prévisualisation sur un vrai téléphone via un tunnel public : le serveur doit
  // écouter sur toutes les interfaces et accepter l'hôte du tunnel.
  preview: {
    host: true,
    port: 4173,
    allowedHosts: [".trycloudflare.com"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
