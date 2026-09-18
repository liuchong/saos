import { defineConfig } from "vite"

import { eliscript } from "../../../tools/eliscript-vite.mjs"

export default defineConfig({
  plugins: [eliscript()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
})
