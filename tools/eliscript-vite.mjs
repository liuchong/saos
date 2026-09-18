// A Vite plugin for Eliscript sources.
//
// The compiler is consumed through its public command line: compile one `.eli`
// file with a source map and hand the result to Vite as an ordinary transform.
// Vite stays the bundler and the development server; nothing here reimplements
// either.
//
// The Eliscript package ships its compiler, runtime, platform, and library
// directories but not its `tools/`, so the adapter that exists in the
// repository is not available to a consumer. This is that adapter written
// against the documented transform contract.

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)

const withoutQuery = id => {
  const index = id.search(/[?#]/)

  return index === -1 ? id : id.slice(0, index)
}

export const eliscript = (options = {}) => {
  const compiler =
    options.compiler ?? path.join(repositoryRoot, "node_modules", ".bin", "eliscript")

  return {
    name: "saos-eliscript",
    enforce: "pre",

    async transform(_source, id) {
      const file = withoutQuery(id)

      if (!file.endsWith(".eli")) {
        return null
      }

      this.addWatchFile(file)

      // A private directory per transform: concurrent transforms must not
      // write over each other's module or map.
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "saos-eli-"))
      const output = path.join(directory, "module.mjs")

      try {
        const result = spawnSync(compiler, ["--output", output, "--source-map", file], {
          encoding: "utf8",
        })

        if (result.status !== 0) {
          throw new Error(
            `eliscript failed for ${path.relative(repositoryRoot, file)}: ${
              result.stderr.trim() || result.stdout.trim()
            }`,
          )
        }

        const map = JSON.parse(fs.readFileSync(`${output}.map`, "utf8"))
        const code = fs
          .readFileSync(output, "utf8")
          .replace(/\n\/\/# sourceMappingURL=.*\n?$/, "\n")

        return { code, map }
      } finally {
        fs.rmSync(directory, { recursive: true, force: true })
      }
    },
  }
}

export default eliscript
