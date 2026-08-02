import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const racine = (f: string) => fileURLToPath(new URL(f, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        accueil: racine("index.html"),
        confidentialite: racine("confidentialite.html"),
      },
    },
  },
});
