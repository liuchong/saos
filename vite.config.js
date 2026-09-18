import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { eliscript } from "./tools/eliscript-vite.mjs"

export default defineConfig({
  // Eliscript sources are compiled before Vite analyses their imports. The
  // React plugin keeps handling the `.jsx` sources until the port removes
  // them.
  plugins: [
    eliscript(),
    // The client entry is an Eliscript module, so the React plugin has to be
    // told to look at it. It adds the development refresh boundary; the
    // production build does not depend on it.
    react({ include: /\.(?:[jt]sx?|eli)$/ }),
  ],
  publicDir: false,
  build: {
    manifest: true,
  },
})
