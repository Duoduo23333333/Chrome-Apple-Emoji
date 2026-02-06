# Chrome Apple Emoji

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-Extension-orange.svg)](https://www.google.com/chrome/)

**[English](README.md)** | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)

---

Native Apple emoji experience on Windows browsers. Fixes GDI/MacType emoji rendering issues in Chromium.

## Features

- **Zero-Compromise Copy/Paste** — Emoji replaced with images, but copy/paste preserves original Unicode characters
- **GDI/MacType Compatible** — Fixes colored emoji not displaying when DirectWrite is disabled
- **Performance First** — TreeWalker API + requestAnimationFrame scheduling for smooth infinite scroll
- **Graceful Fallback** — Missing images automatically revert to native text

## Installation

This extension requires loading as an unpacked extension (local image resources).

1. Clone or download this repository
2. Open Chrome/Edge and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `Chrome-Apple-Emoji` folder

## Details

| Component      | Implementation                        |
| -------------- | ------------------------------------- |
| DOM Traversal  | `TreeWalker` API (native, low memory) |
| Scheduling     | `requestAnimationFrame` batching      |
| Emoji Matching | RGI-compliant regex                   |
| Rendering      | CSS `transform: translateZ(0)`        |
| Fallback       | Auto-retry with `fe0f` variants       |

## Credits

- Emoji assets from [samuelngs/apple-emoji-linux](https://github.com/samuelngs/apple-emoji-linux)

## License

[MIT](LICENSE)
