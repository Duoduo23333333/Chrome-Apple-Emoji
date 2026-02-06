# Chrome Apple Emoji

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-Extension-orange.svg)](https://www.google.com/chrome/)

[English](README.md) | **[简体中文](README.zh-CN.md)** | [繁體中文](README.zh-TW.md)

---

在 Windows 浏览器中体验原生 Apple 风格 Emoji。修复 GDI/MacType 模式下 Chromium 的彩色 Emoji 渲染问题。

## 功能特性

- **无损复制粘贴** — Emoji 虽替换为图片，但复制粘贴时保留原始 Unicode 字符
- **GDI/MacType 兼容** — 修复关闭 DirectWrite 后彩色 Emoji 无法显示的问题
- **性能优先** — TreeWalker API + requestAnimationFrame 调度，无限滚动零卡顿
- **优雅降级** — 图片缺失时自动回退为原生字符

## 安装方法

本扩展需要以「开发者模式」加载（因需访问本地图片资源）。

1. 克隆或下载本仓库
2. 打开 Chrome/Edge，访问 `chrome://extensions/`
3. 开启右上角的 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择 `Chrome-Apple-Emoji` 文件夹

## 细节

| 组件       | 实现方式                                 |
| ---------- | ---------------------------------------- |
| DOM 遍历   | `TreeWalker` API（原生高效、低内存占用） |
| 任务调度   | `requestAnimationFrame` 批处理           |
| Emoji 匹配 | 符合 RGI 标准的正则表达式                |
| 渲染优化   | CSS `transform: translateZ(0)`           |
| 容错机制   | 自动重试 `fe0f` 变体后回退文本           |

## 致谢

- Emoji 素材来源：[samuelngs/apple-emoji-linux](https://github.com/samuelngs/apple-emoji-linux)

## 许可证

[MIT](LICENSE)
