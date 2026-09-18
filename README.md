# SAOS

**Sites Are Open Source.**

> 网站可以简单，但一定要骚。

SAOS is a source-first blog generator packaged as a GitHub Action. Its
generator is written in [Eliscript](https://github.com/liuchong/eliscript) and
compiled by the Action; it builds Markdown and MDX from your repository,
renders React on the server, and produces a static site ready for GitHub Pages.

It is deliberately not a sealed blog product. Reference the Action when the
defaults fit; fork the repository and edit the renderer, components, CSS, or
build pipeline when they do not. The source is the product.

## Use It

Keep content and configuration in a `site` branch, then add
`.github/workflows/publish.yml`:

```yaml
name: Publish site

on:
  push:
    branches: [site]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: liuchong/saos@v1.0.0
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

The workflow consumes `content/blog`, `saos.config.mjs`, and `static` by
default.

## Write

Each post can be a Markdown or MDX file. A folder with `index.md` keeps local
images and downloads beside the article:

```text
content/blog/
  hello/
    index.md
    diagram.png
```

```markdown
---
title: Hello, source
date: 2026-08-27
description: The first post.
---

The rest is Markdown.
```

Direct files such as `content/blog/hello.mdx` are supported too. Set
`draft: true` in frontmatter to omit a post from production builds.

## Configure

`saos.config.mjs` exports a plain object:

```js
export default {
  title: "My Blog",
  description: "Notes from the source.",
  siteUrl: "https://example.com",
  language: "en",
  author: {
    name: "Ada",
    summary: "writes programs and prose.",
    avatar: "/images/avatar.png",
    link: { label: "GitHub", href: "https://github.com/ada" },
  },
  comments: {
    provider: "giscus",
    repo: "ada/blog",
    repoId: "...",
    category: "Comments",
    categoryId: "...",
  },
  footer: {
    links: [{ label: "My source", href: "https://github.com/ada/blog" }],
  },
}
```

| Key                                           | Meaning                                                                                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`, `description`, `siteUrl`, `language` | Site identity, the URL the feed links to, and the document language                                                                                                              |
| `basePath`                                    | URL prefix, for a project page rather than a domain root                                                                                                                         |
| `author`                                      | `name`, `summary`, `avatar`, `avatarAlt`, `link`                                                                                                                                 |
| `comments`                                    | Giscus settings: `provider`, `repo`, `repoId`, `category`, `categoryId`, and the optional `mapping`, `strict`, `reactions`, `emitMetadata`, `inputPosition`, `theme`, `language` |
| `footer`                                      | `label` and `href`, or `links` for several credits, or `false` for none                                                                                                          |
| `rss`                                         | `title` for the feed, or `false` for no feed                                                                                                                                     |
| `manifest`                                    | `shortName`, `backgroundColor`, `display`, `icons`, or `false` for no web manifest                                                                                               |

Giscus comments are optional. When configured, SAOS maps each page pathname to
its discussion and keeps the comment thread attached to the article.

Every page carries `<meta name="generator" content="SAOS (Eliscript engine)">`,
so a built site says which engine produced it.

## Action Inputs

| Input          | Default             | Purpose                                |
| -------------- | ------------------- | -------------------------------------- |
| `content`      | `content/blog`      | Markdown and MDX directory             |
| `config`       | `saos.config.mjs`   | Site configuration module              |
| `public`       | `static`            | Static files copied to the output root |
| `output`       | `dist`              | Generated site directory               |
| `base`         | config value or `/` | URL prefix for Project Pages           |
| `node-version` | `24`                | Node.js version used by the Action     |

The Action outputs `output-path` and `post-count`.

## Develop The Source

```bash
npm ci
npm run engine   # compile the Eliscript engine
npm test
npm run build    # build the example site
npm run dev      # development server
```

The generator is written in [Eliscript](https://github.com/liuchong/eliscript)
and lives in `engine/`; `npm run engine` compiles it to `dist/engine/`. To work
against another content repository, point the compiled entry at its checkout:

```bash
node dist/engine/builder/main.mjs --workspace ../my-site
node dist/engine/builder/main.mjs --workspace ../my-site --output dist
```

The build recursively discovers Markdown and MDX, renders React on the server,
hydrates the generated pages in the browser, copies article-local assets, and
writes RSS and a web manifest. Nothing prevents replacing any part of that
pipeline; all implementation source ships with the Action.

`npm run package` compiles the Action into a single file under `dist/action/`
with a manifest of the digest of every engine source, which is what a consumer
of a fork can verify against.

## Layout

| Path             | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `engine/`        | The generator: builder, renderer, site components, and the Action entry |
| `engine/ui/`     | The minimal element and store layer over React                          |
| `tests/`         | Contract, rendering, and browser tests                                  |
| `docs/`          | The engine-swap roadmap and the acceptance record                       |
| `examples/basic` | A workspace to build and test against                                   |

## License

[0PL](https://license.pub/0pl/) ([full text](LICENSE))
