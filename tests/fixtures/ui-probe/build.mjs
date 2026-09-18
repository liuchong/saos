// Builds the probe: a client bundle, a server bundle, and one document that
// already contains the server markup the client will hydrate.

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { build } from "vite"

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.join(here, "dist", "client")
const serverDir = path.join(here, "dist", "server")

await build({
  root: here,
  configFile: path.join(here, "vite.config.mjs"),
  logLevel: "silent",
})

await build({
  root: here,
  configFile: path.join(here, "vite.config.mjs"),
  logLevel: "silent",
  build: {
    ssr: path.join(here, "src", "server.eli"),
    outDir: serverDir,
    emptyOutDir: true,
  },
})

const server = await import(
  pathToFileURL(path.join(serverDir, "server.js")).href
)
// The client build rewrites the entry script to its hashed asset, so the
// document to fill in is the one Vite emitted, not the source template.
const built = await fs.readFile(path.join(clientDir, "index.html"), "utf8")
const document = built
  .replace("<!--store-->", server.store_markup())
  .replace("<!--naive-->", server.naive_markup())

await fs.writeFile(path.join(clientDir, "index.html"), document)

console.log("probe built")
