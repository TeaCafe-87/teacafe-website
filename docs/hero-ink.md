# 首頁：液態墨水 Hero 與內容區塊

相關檔案：`dist/index.html`、`dist/assets/js/hero-ink.js`、`dist/assets/css/home-ink.css`、`dist/assets/js/home-sections.js`、`dist/assets/css/home-sections.css`、`tests/hero-ink.mjs`、`tests/home-sections.mjs`。

## 一、Hero 的墨水效果

### 運作方式
1. 白底、置中的 DOM 標題 `h1[data-ink-title]`（黑色、900 粗體，可選取、可被螢幕閱讀器讀取）。
2. 游標驅動一顆帶彈簧慣性的「墨頭」，沿路徑生成粒子：依速度拉伸成橢圓、受兩層旋度流場影響而捲曲、偶爾甩出獨立小液滴，並隨時間縮小消散。
3. 粒子先畫進低解析度遮罩（依面積自動選 1/2–1/4），再做 metaball 閾值（`EDGE_LO`/`EDGE_HI`），得到有機不規則、不模糊的墨水邊緣。
4. 主畫布：放大遮罩 → `source-in` 填入**頁面錨定**的漸層（深藍→紫→粉紅→橘，座標只取決於 Hero 尺寸，與游標無關）→ `source-atop` 只在墨水範圍內以白色重繪標題字形。字形位置逐字取自 DOM（`Range.getClientRects`），所以黑白字形完全重合、字緣銳利。
5. 圖層順序：黑色標題(1) < 畫布(2) < 小標／按鈕等所有 UI(3)；畫布 `pointer-events: none`。

### 行為與效能
- 只在 Hero 可見、分頁在前景、且有粒子或游標在 Hero 內時才執行迴圈。捲動離開 Hero 後迴圈完全停止（實測 0 影格），回到 Hero 自動恢復。
- 上限約 60 fps、最多 460 顆粒子，每幀只處理變動矩形。
- `prefers-reduced-motion: reduce`（或 `html[data-motion="reduced"]`）：完全停用，不綁事件、不畫圖，標題維持純黑字。
- 觸控裝置沒有游標：首次觸碰前有一道緩慢漂移的墨流，之後跟隨手指；點按會濺出一圈液滴。
- 畫布 DPR 上限 2，總像素超過 500 萬時自動降低。

### 調整
- **跟隨速度**：`STIFFNESS` / `DAMPING`。穩態延遲約等於 `游標速度 × DAMPING / STIFFNESS`，目前是 1000 / 49。彈簧以 `SPRING_STEP`（1/120 秒）子步進，即使掉影格也不會發散。
- **墨水大小**：`inkSize()`，取畫面較短邊的 7.5%（34–104px），所以手機與桌機比例一致。
- 顏色：`STOPS`。邊緣軟硬：`EDGE_LO` / `EDGE_HI`。流動強度：`flow * 320`。存留時間：`spawn()` 的 `life`。拖曳密度：`step()` 裡的 `n`。

## 二、Hero 以下的內容區塊

`home-sections.css` 與 `home-sections.js` 負責：即時狀態列、伺服器介紹、特色、三步加入、玩法一覽、最新公告、玩家相冊、常見問題與結尾 CTA。文案取自專案既有的 `rules.html` 與 `wiki.html`，沒有新增虛構內容。

- **伺服器狀態**沿用 `app.js` 既有的 `[data-server-*]` 掛鉤與 `/api/server/status`。
- **公告**沿用 `app.js` 的 `loadNews()`。首頁加上 `data-news-limit="3"` 只顯示最新三則；公告頁不設此屬性，仍顯示全部。同時補上「目前還沒有公告」的空狀態。
- **相冊預覽**呼叫 `/api/community/posts?kind=gallery`，只接受 `/api/community/media/` 開頭的同源圖片，所有文字以 `textContent` 寫入。未設定、沒有貼文、讀取失敗各有對應狀態，不會顯示假資料。
- **進場動畫**：`[data-reveal]` 由 IntersectionObserver 加上 `.is-in`；`prefers-reduced-motion` 或 `html[data-motion="reduced"]` 時全部直接顯示。

### 兩個樣式陷阱（修改時注意）
- `styles.css` 已把 `.section-head` 定義為 flex 橫排，首頁必須以 `display: block` 覆寫，否則標題與說明會並排。
- `polish.css` 的 `html[data-text-size] :is(… .section-head h2)` 選擇器權重較高，首頁標題字級因此寫成 `html body.ink-home …` 才能生效。

## 三、已取代的舊首頁元件

舊的首頁影片場景（`home-scene.js`、`home-motion.css`、`dist/assets/video/*.mp4`、`dist/image/index.png`）與對應測試、工具已於 2026-11 移除，部署體積縮小約 24 MB。
