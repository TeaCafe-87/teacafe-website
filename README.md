<div align="center">

# ☕ TeaCafe Website

### A cozy place to play, connect, and create.

TeaCafe Minecraft Server 的官方網站專案。

提供伺服器資訊、最新消息、玩家服務，以及未來 TeaCafe 各項 Web 功能的統一入口。

## 目前網站架構

- `dist/`：Cloudflare Pages 靜態頁面與前端程式；Pages 專案輸出目錄設為 `dist`。
- `functions/`：Discord 登入、伺服器狀態與社群 API。
- `migrations/`：Cloudflare D1 資料表。
- `docs/backend.md`：D1、R2 綁定、資料契約與接線流程。
- `docs/plugin-source-map.md`：Wiki 條目與插件資料的對照。

相冊與論壇使用相同的貼文格式，每篇最多可附 30 個圖片或影片，合計上限 20 MiB，並支援按讚、留言及分享。資料寫入需要 Pages 綁定 `DB`（D1）與 `GALLERY_MEDIA`（R2），以及 Discord OAuth 環境變數；在綁定之前畫面會顯示清楚的空狀態。

背景音樂使用 `dist/audio/` 中的七首 MP3，於網站設定中可開關、調整音量及切換曲目。瀏覽器需要先收到一次點擊或按鍵，才會開始播放音樂。首頁目前使用輕微動畫背景；若未來有正式影片素材，再加入影片來源。推送或提出 PR 時，`.github/workflows/check.yml` 會執行 JavaScript 語法與整合測試。

<br>

![Status](https://img.shields.io/badge/Status-In%20Development-yellow?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Minecraft](https://img.shields.io/badge/Minecraft-Server-62B47A?style=for-the-badge)

</div>

---

## ☕ About TeaCafe

**TeaCafe** 是一個 Minecraft 伺服器與玩家社群。

我們希望建立一個舒適、完整且具有自己特色的遊戲環境，
讓玩家不只是進入伺服器遊玩，也能透過網站取得 TeaCafe 的各種資訊與服務。

`teacafe-website` 將作為 TeaCafe 的官方 Web 平台。

---

## 🌐 Website

TeaCafe Website 預計提供：

- 🏠 **首頁**
  - TeaCafe 介紹
  - 重要資訊
  - 伺服器入口

- 📰 **最新消息**
  - 更新公告
  - 活動資訊
  - 維護通知

- 🟢 **Server Status**
  - 伺服器在線狀態
  - 玩家人數
  - 即時伺服器資訊

- 📖 **Wiki & Guides**
  - 遊戲指南
  - 系統介紹
  - 玩家教學

- 👤 **Player Services**
  - 玩家資料
  - 帳號系統
  - Minecraft 帳號整合

- 🛒 **TeaCafe Store**
  - 玩家商品
  - 特殊內容
  - 伺服器相關服務

- 🛠️ **Admin Services**
  - 網站管理
  - 玩家管理
  - TeaCafe 內部服務
