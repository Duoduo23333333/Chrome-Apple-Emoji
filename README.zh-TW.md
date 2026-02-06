# Chrome Apple Emoji

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-Extension-orange.svg)](https://www.google.com/chrome/)

[English](README.md) | [简体中文](README.zh-CN.md) | **[繁體中文](README.zh-TW.md)**

---

在 Windows 瀏覽器中體驗原生 Apple 風格 Emoji。修復 GDI/MacType 模式下 Chromium 的彩色 Emoji 渲染問題。

## 功能特性

- **無損複製貼上** — Emoji 雖替換為圖片，但複製貼上時保留原始 Unicode 字元
- **GDI/MacType 相容** — 修復關閉 DirectWrite 後彩色 Emoji 無法顯示的問題
- **效能優先** — TreeWalker API + requestAnimationFrame 調度，無限滾動零卡頓
- **優雅降級** — 圖片缺失時自動回退為原生字元

## 安裝方法

本擴充功能需要以「開發者模式」載入（因需存取本機圖片資源）。

1. 克隆或下載本倉庫
2. 開啟 Chrome/Edge，前往 `chrome://extensions/`
3. 開啟右上角的 **開發者模式**
4. 點擊 **載入未封裝項目**
5. 選擇 `Chrome-Apple-Emoji` 資料夾

## 細節

| 元件       | 實作方式                                   |
| ---------- | ------------------------------------------ |
| DOM 遍歷   | `TreeWalker` API（原生高效、低記憶體佔用） |
| 任務調度   | `requestAnimationFrame` 批次處理           |
| Emoji 配對 | 符合 RGI 標準的正規表達式                  |
| 渲染最佳化 | CSS `transform: translateZ(0)`             |
| 容錯機制   | 自動重試 `fe0f` 變體後回退文字             |

## 致謝

- Emoji 素材來源：[samuelngs/apple-emoji-linux](https://github.com/samuelngs/apple-emoji-linux)

## 授權條款

[MIT](LICENSE)
