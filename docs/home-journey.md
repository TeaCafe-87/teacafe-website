# 首頁：水墨山水捲動旅程

> **2026-11 更新**：首頁改用 v2 四幕影片（見 `docs/journey-video-v2.md`），本文件下方的 v1 影片（`journey.mp4`）現在是規則、公告、Wiki、論壇、相冊、感謝支持、職業指南與月映茶行的固定背景。
>
> - **影片選擇**：寬高比小於 3:4 用直式，否則用橫式；台灣時間 18:00–06:00 用夜晚版，設定「首頁山水」可改為固定白天／夜晚（`localStorage` 的 `teacafe-theme`）。
> - **內容與留白對齊**：`home-journey.js` 以內容為錨點換算捲動進度。每個 `[data-p="a,b"]` 元素：頂端進入視窗底部時影片在進度 a，底端離開視窗頂部時在 b。第二～四幕的文字（`.act`）因此一定在該幕的留白停留段經過，文字多長都一樣；`.journey-gap` 負責幕與幕之間的運鏡。
> - **游標效果**：`ink-fluid.js` 是 Art-Of-Ink `project_5.pde`（PixelFlow 流體）的 WebGL2 移植。墨水來源是影片加上 `journey-live.js` 的動態層，所以瀑布、飛鳥、小舟也會被推散，平靜後以 project_5 的比例（約 1%／格）慢慢回到原畫。只有被攪動時才渲染，靜止 4 秒後交回原本的影片層。沒有 WebGL2 或開啟「減少動態效果」時不啟用。

相關檔案：`dist/index.html`、`dist/assets/js/home-journey.js`、`dist/assets/css/home-journey.css`、`dist/assets/video/journey.mp4`（連同 `journey-start.webp`、`journey-end.webp` 海報）、`tools/journey-video/`（影片產生器）、`tests/home-journey.mjs`。

設計參考：[Art-Of-Ink](https://github.com/clouder118/Art-Of-Ink) 的水墨流體概念——首頁以一幅山水為背景，游標推動墨水（`dist/assets/js/ink-fluid.js`），捲動則推動鏡頭進入畫中。

## 一、背景影片（鏡頭推入畫中）

### 產生方式
影片不是現成素材，而是由 `tools/journey-video/` 以程式繪製、完全確定性（固定亂數種子）產生：

1. `paint.py` 把山水畫拆成**分層**繪製：前景岩石與松樹、近景山丘＋湖面＋小舟、左右中景山、主峰、兩層遠山、三條霧帶、紙色天空。每層都是帶 alpha 的大圖（視窗四周留 30% 邊距、2 倍取樣）。
2. `render.py` 用一台虛擬攝影機向畫面深處推進：每層依深度 `d` 以 `s = d / (d - cam)` 對投影中心縮放，**近的層放大、掠過觀者的速度比遠山快**（真實視差，不是放大一張平面圖）。鏡頭接近某層前該層先溶解、霧帶在穿越時增厚，所以山形穩定、層的離場被霧遮住。
3. 輸出 24 秒、30fps；以 1920×1080 繪製、縮至 1600×900 編碼，`keyint=4` 讓瀏覽器能在任意兩個方向快速精準 seek（scroll-scrub 的關鍵），無聲、無文字，約 5 MB。

### 重新產生
```
cd tools/journey-video
python3 render.py preview                                  # 先看關鍵影格（/tmp/journey_preview）
python3 render.py encode ../../dist/assets/video/journey.mp4
python3 render.py poster ../../dist/assets/video/journey   # 起點／終點海報
```
需要 Python3 + numpy + Pillow + ffmpeg。改構圖請調 `paint.py`（各層的 `vx()/vy()` 視窗座標、`build_all()` 的深度與淡出窗），改運鏡請調 `render.py` 的 `CAM_END`、`cam_at()`。

## 二、捲動驅動播放（home-journey.js）

- `.journey`（`[data-journey]`）包住六個全螢幕場景；進度 = 捲過 journey 的比例，`video.currentTime = 進度 × 片長`。往下捲是入山、往上捲是倒帶、停住就停格。影片永遠是 `pause()` 狀態、只做 seek，所以不受自動播放政策影響。
- rAF 以 0.24 的係數追趕目標時間，且解碼器還在 seeking 時不排入新 seek，快速滑動不會卡頓。
- 背景 `.journey-backdrop` 是 `position: fixed`；旅程結束後 `.archive`（紙底的公告／相冊／FAQ）以 z-index 蓋過，整個捲離視窗時加 `journey-done` 直接 `visibility: hidden` 省合成成本。
- 後備：`prefers-reduced-motion`（或 `html[data-motion="reduced"]`）、影片載入失敗、metadata 不可用 → `journey-still`，只顯示 `journey-start.webp` 靜態畫，內容照常閱讀。海報 `<img>` 永遠墊在影片下面，影片 `loadedmetadata` 前是透明的，所以第一屏不會閃白。

## 三、場景與文字編排（home-journey.css）

- 六個場景如手卷章節：開卷（Hero）、卷一山門（即時狀態）、卷二湖心（介紹）、卷三山居（特色）、卷四行旅（玩法）、卷五入住（三步驟）、卷六雲深（結尾 CTA）。章節名是直書 `.scene-mark`。
- 文案放在畫面的留白處（天空、湖面、霧帶），`.scene-copy::before` 用紙色放射漸層當「霧墊」保持可讀性；大標題用 Noto Serif TC，正文 Noto Sans TC。
- 首頁的 `html body.ink-home .home-page-main h2/h3` 基底字體（home-sections.css 第 8–9 行）已改為宋體；要覆寫場景字級時注意這條的權重。
- 伺服器狀態、公告、相冊、精選時刻、FAQ 全部沿用既有的 `[data-server-*]`／`loadNews()`／community API 掛鉤，只換版面不換資料流。`styles.css` 對 `.server-uptime` 釘了像素字體 `!important`，山門的覆寫在 home-journey.css。
- 「茶咖暖居」紅印章（`.ink-seal`／`.cta-seal`）是整頁唯一的強色，對應畫家的落款印。
- 注意 `teacafe-cinematic.css` 用 `!important` 與 `--tea-nav-backdrop` 釘住 topbar 外觀（760px 以下另外硬寫深色底）；首頁的紙色 topbar 靠重新定義變數＋更高權重蓋回來。
- 舊首頁的卡片牆（`.feature-grid`、`.step-list` 等）樣式仍留在 home-sections.css 給其他地方用；旅程場景的清單**刻意不用那些 class**（用 `.scene-list`、`.journey-steps`、`.j-chip`），避免被套回卡片外觀。
