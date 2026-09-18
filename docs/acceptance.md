# Acceptance Record

What the Eliscript engine swap is accepted on, and what it is not.

- Scope: the generator, the Action packaging chain, and the minimal React
  wrapper. The swap was developed on branch `eliscript` at version `0.0.1` and
  released as `1.0.0`; the engine dependency stays pinned at `0.0.1`.
- Source identity: the commit that carries this file. Every number below was
  produced from that source, on macOS arm64, with Node 26 and Chromium 153.
- The release is a version bump and a tag, not a claim that a runner has
  executed the Action. See "Not Done".

## Reproduce

```sh
npm ci
npm run engine        # compile the engine
npm test              # the acceptance suite
node tools/baseline.mjs
```

## Verified

| What                           | How                                                                                                                  | Result                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The published Action contract  | `tests/action-contract.test.mjs` reads `action.yml` and drives the Action entry with the environment a workflow sets | Five inputs with their names and defaults, two outputs with their mappings, and the failure path: a broken post exits non-zero and writes no output                    |
| The Action entry is the engine | The same test runs the compiled entry, then the packaged single-file entry, and compares the two output trees        | Identical trees                                                                                                                                                        |
| Path rules                     | `tests/paths.test.mjs` against the compiled module                                                                   | Base paths normalize, apply, and strip the same way the removed JavaScript module did                                                                                  |
| Rendering                      | `tests/rendering.test.mjs` over `tests/fixtures/corpus`, against recorded documents                                  | 12 documents reproduced; 16 feature markers present; the draft is absent; the 404 alias equals `404/index.html`                                                        |
| The built site                 | `tests/site.test.mjs` in Chromium over `examples/basic`                                                              | Every page returns 200, hydrates (the injected page data is readable), logs no console error or warning, and every internal link resolves                              |
| The wrapper                    | `tests/ui-probe.test.mjs`                                                                                            | A subscribed update re-renders 1 component where the equivalent root-state update re-renders 41, with no hydration mismatch                                            |
| Size and speed                 | `node tools/baseline.mjs`                                                                                            | The engine emits the same page sizes as the recorded JavaScript baseline: 3,328 / 3,370 / 3,262 / 2,122 bytes, a 12,210 B stylesheet, and a 145 kB class client bundle |

### Measured Differences From The Previous Engine

Recorded rather than smoothed over, because both are properties a reader would
notice.

| Quantity                                    | JavaScript engine (`4e906c0`) | Eliscript engine              | Cause                                                                                                                                                                                                                         |
| ------------------------------------------- | ----------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client bundle                               | 145,335 B raw / 46,912 B gzip | 199,950 B raw / 61,239 B gzip | The wrapper and the site modules link the Eliscript core runtime modules into the client                                                                                                                                      |
| Build time, same workspace and same machine | 66 ms                         | ~306 ms                       | Almost all of it is the Vite client build: the adapter compiles each `.eli` file in its own child process, so 22 modules mean 22 process starts. Model, rendering, page writing, feed, and manifest together take about 16 ms |

Both are honest comparisons: the harness loads the engine in-process, which is
how the earlier number was taken.

The build cost has a known fix that is not in this stage: compile the client
entry as part of the engine build and let Vite bundle the compiled module,
which removes the per-file compilation from the production path. It is a
follow-up rather than a freeze-time change, because it moves the CSS the client
entry imports into the compiled tree and that needs its own verification.

### The parity record

While the JavaScript engine still existed, `tools/parity.mjs` compared the two
engines on every run: models with zero differences, five diagnostic cases
agreeing item by item, and artifacts where every file except the client bundle
matched. For `examples/basic` that was 20 of 26 files byte-identical, 5
documents equal after content-hash normalization, and the client bundle as the
one file each engine is entitled to produce for itself.

That tool is deleted, because a finished engine does not compare itself to the
one it replaced. The numbers above are its last recorded run on this source.

## Not Done

- **The release is unsigned by CI.** `v1.0.0` was tagged and released by hand
  from a verified local build. No workflow produced it, and no Marketplace
  listing change was made through the release UI.
- **Nothing was published to npm.** The package is `private`, so a release
  here is a Git tag and a GitHub Release rather than a registry publication.
- **No real runner here.** The Action's runtime contract is exercised by
  running the entry point a runner would run, with the environment a workflow
  would set. A run on GitHub's runners is a separate observation and is
  recorded where it happens, not here.
- **Development mode is configured, not verified.** The `.eli` refresh boundary
  and the client entry's development branch exist and no test starts a
  development server.
- **One platform.** macOS arm64. Nothing was verified on Linux, and the Action
  runs on `ubuntu-latest`.
- **No visual comparison.** The documents are byte-identical to the ones the
  previous engine produced, and the stylesheet is byte-identical, so a
  screenshot comparison would test the browser rather than the port. It is not
  claimed.
- **The asset decision is open.** The Action still installs its dependency
  closure and builds the client at run time. Whether it should instead ship
  prebuilt assets is a product decision recorded in the roadmap.

## After The Release

`v1.0.0` was tagged and released, and then observed rather than assumed:

- The repository's own workflow caught the version mismatch (`22` in CI
  against the engine's `24`) and a missing browser for the browser tests. Both
  are fixed; the suite is green on `ubuntu-latest`, including the browser tests
  and a build through the local Action.
- The `site` branch was pointed at `v1.0.0` and a real GitHub Actions run
  built and deployed the blog. The deployed document matches a local build of
  the same content, down to the client chunk's content hash.
- That run also showed what the release could not do: a workflow that passes
  `content`, `config`, or `public` was ignored, because a keyword used as a
  value is not its name. The site did not exercise it, because the site uses
  the defaults; the repository's own workflow does, and the runner found it in
  a minute.
- The tag was replaced rather than a version added: `v1.0.0` now points at the
  commit that carries the fix and the generator meta tag, and the release notes
  were rewritten with it. Deploying again from that tag put the marker on the
  live site, which is how the replacement was confirmed.

### What The Release Observation Added

Everything below was found by running the release rather than reading it.

| Finding                                                                                       | Where it came from                                                | State                                                                             |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| CI ran Node 22 while the engine needs 24                                                      | The repository's own workflow, first run                          | Fixed: one version in the workflow, the Action default, the README, and `engines` |
| The browser tests hung on the runner: `playwright-core` drives a browser it does not download | The same run                                                      | Fixed: the workflow installs Chromium before the tests                            |
| The Action ignored `content`, `config`, and `public`                                          | The same run: it built from `content/blog` and failed with ENOENT | Fixed, with a contract test that runs the Action in that exact shape              |
| The configuration merge never recognised `footer: false`, `rss: false`, or `manifest: false`  | Found while fixing the above; the same cause                      | Fixed                                                                             |
| The `Seo` component never rendered the children it was given                                  | Found while adding the generator tag                              | Fixed                                                                             |
| A tag is not a description: nothing in the output said which engine built it                  | The owner asked how to tell                                       | Every page now carries a generator meta tag                                       |

The cause of the third and fourth is one language fact: a keyword used as a
value is an interned keyword object rather than its name, so a property read
with a keyword in the key position finds nothing. Keys that travel as values
are strings.

## Known Gaps In The Engine

- A macro layer is not possible: Eliscript macros are compilation-unit local,
  so `engine/ui/element.eli` is a function rather than the hiccup macro the
  brief asked for.
- An external project cannot import the Eliscript standard library, so the
  store implements its own reference instead of using the portable `Atom`.
- The packaged bundle keeps `vite` external, because Vite depends on
  platform-native binaries that cannot be inlined into one file.
