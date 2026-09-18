export default {
  title: "黑貓博客",
  description: "刘冲的个人博客。",
  siteUrl: "https://blakat.cc",
  language: "zh-CN",
  author: {
    name: "刘冲",
    summary: "写代码，也写一点关于代码和生活的东西。",
    avatar: "/images/profile-pic.png",
    avatarAlt: "刘冲",
    link: {
      label: "You should fork him on Gaythub",
      href: "https://github.com/liuchong",
    },
  },
  comments: {
    provider: "giscus",
    repo: "liuchong/saos",
    repoId: "MDEwOlJlcG9zaXRvcnk4MzEyNjIyMA==",
    category: "Giscus comments",
    categoryId: "DIC_kwDOBPRnzM4CgszK",
    mapping: "pathname",
    strict: true,
    reactions: true,
    inputPosition: "top",
    theme: "light",
    language: "zh-CN",
  },
  footer: {
    links: [{ label: "SAOS", href: "https://github.com/liuchong/saos" }],
  },
  rss: {
    title: "黑貓博客 RSS Feed",
  },
  manifest: {
    shortName: "bkb",
    icons: [
      {
        src: "/images/profile-pic.png",
        sizes: "1200x1200",
        type: "image/png",
      },
    ],
  },
}
