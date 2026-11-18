# 捲動場景與共用動態系統

相關檔案：`dist/assets/js/scroll-scene.js`、`dist/assets/js/scroll-motion.js`、`dist/assets/css/scroll-scene.css`、`dist/assets/js/hero-ink.js`、`dist/data/scenes/*.json`、`tools/render-placeholder-scene.py`、`tools/preview-static.py`。

## 一、場景（scroll-scene.js）

一個章節 = 一份 JSON + 一段 HTML，不需修改引擎。

```html
<section class="scroll-scene" data-scroll-scene="/data/scenes/wiki-01.json" style="--scene-length:420svh">
  <div class="scroll-scene-stage" data-ink-hero data-ink-palette="sumi" data-ink-idle="off">
    <picture>…poster…</picture>
    <div class="scroll-scene-media"></div>
    <canvas class="scroll-scene-ink" data-ink-canvas></canvas>
    <div class="page-title-inner scroll-scene-copy">
      <h1 data-beat="title" data-beat-role="title">…</h1>
      <p data-beat="intro" data-beat-role="body" style="--beat-in:0">…</p>
    </div>
  </div>
</section>
```

- **資料分離**：影格來源、FPS、裁切焦點、文字出入時間（beats）在 JSON；文字在 HTML（SEO、管理後台文案編輯仍可用）；動態外觀在 CSS。
- **進度**：`progress = -section.top / (section.height - viewport)`，只讀取位置，不攔截 wheel／touch。以約 80 ms 臨界阻尼追隨，停止捲動即停在對應影格。
- **beats**：`{ id, from, to, edge }`（0–1 的場景進度）。引擎寫入 `--beat-in`、`--beat-out`，兩者都是進度的純函數，所以反向捲動會精確倒放，不會重複觸發。
- **renderer**：`frames`（WebP 影格序列畫到 canvas，粗到細載入）或 `video`（MP4 currentTime，seek 不重疊）。在 JSON 依桌機／手機設定，測試時可用 `?renderer=video|frames` 覆寫。
- **退回靜態**：`prefers-reduced-motion`、`html[data-motion="reduced"]`、Save-Data／2G、素材錯誤 → `.is-static`：海報 + 依序排列的文字，區塊高度回到自然高度。無 JS 由 `<noscript>` 樣式處理。
- **懶載入與清理**：場景接近視窗（1 個視窗高）才抓 JSON 與素材；離開畫面不繪製；`pagehide`（非 bfcache）時釋放解碼器、影格與事件。
- **日夜**：`data-scene-time="day|dusk|night"`（預覽用 `?time=night`）。這是色彩分級疊層，不是重新打光；真正的夜景需要 Cowork 另外算一版。
- **量測**：`TeaScrollScene.scenes[0].stats` 提供 seek 次數／延遲、與目標影格的落差、首格時間、已載入影格數。

### 新增一個場景
1. Cowork 交付影格（或 MP4）與 `scene-metadata.json`。
2. 新增 `dist/data/scenes/<id>.json`，填入 fps、frames、sources、beats。
3. 在頁面放上上方的 HTML 區塊，並引入 `scroll-scene.css` 與 `scroll-scene.js`。

## 二、共用標題／內文動態（scroll-motion.js）

- 在區域加上 `data-reveal-scope`：其中 `h2` 視為標題，`h3`、`p`、卡片格、FAQ、提示框視為內文；也可直接對單一元素標記 `data-reveal="title|body"`。
- 標題：從視窗底部開始、72% 高度處就位；由 Z 軸後方升起；底線像筆觸一樣展開；離開上緣時往上、往前淡出。
- 內文：較晚開始（94% → 70%），位移較小、不做逐字動畫。
- 數值全由元素位置決定，可正反向；只量測接近視窗的元素（IntersectionObserver），每幀先讀後寫。
- 被 `data-reveal-scope` 涵蓋的元素，`motion.js` 舊的 kinetic／一次性進場會自動略過，避免重複動畫。

## 三、水墨游標（hero-ink.js）

沿用首頁 v2 的液態墨水實作，新增屬性：
- `data-ink-palette="sumi"`：淡墨灰色調（預設仍是原本彩色漸層）。
- `data-ink-idle="off"`：觸控裝置不跑首次觸碰前的漂移迴圈（省電）。
- 觸控或 ≤4 核心裝置粒子上限 460 → 180。
- 標題改為選用；指標座標改為即時量測，sticky 舞台上不會漂移。

## 四、本機預覽

```
python tools/render-placeholder-scene.py   # 產生 PLACEHOLDER 素材（已 gitignore）
python tools/preview-static.py             # http://127.0.0.1:4173/wiki.html
```

## 五、實測結果（2026-11-19，PLACEHOLDER 素材）

環境：Ryzen 7 260 + Radeon 780M（Chrome 使用此內顯）、Chrome 157 headless、`python tools/bench-server.py desktop|mobile`。
素材為程序生成的柔和水墨山景，壓縮率遠高於真實 Blender 算圖；**大小與解碼時間只能作相對比較**，真實素材需重測。

桌機 1422×804：

| 方案 | 大小 | seek 平均／p95 | 移動中落後影格 平均／最大 | 停止後對準 |
|---|---|---|---|---|
| WebP 影格序列 1280w（canvas） | 1.5 MB / 180 檔 | 不需 seek | **0 / 0** | 130–340 ms（含 80 ms 緩動） |
| MP4 全關鍵影格 g1 | 1.7 MB | 3–9 / 6–13 ms | 1–1.9 / 18 | 130–560 ms，反向時出現一次 2 s 卡頓 |
| MP4 每 8 格關鍵影格 g8 | 0.7 MB | 4–9 / 8–35 ms | 1–2.5 / 12 | 130–240 ms |
| MP4 每 30 格關鍵影格 g30 | 0.7 MB | **14–18 / 33–53 ms** | 1–3.8 / 14 | 140–340 ms |

手機直式（headless 最小寬度限制，實際為 488×748@3）：影格序列 0 落後；MP4 g8 seek 3.5–5.3 ms、移動中平均落後 1–2 格，停止後 6–340 ms 對準。

結論與預設：
- 桌機 `frames`：每格精準、不依賴解碼器 seek，記憶體較充裕。
- 手機 `video`（g8）：一個解碼器、記憶體小；180 張真實細節影格在手機上可能佔用數百 MB 解碼記憶體，iOS 有分頁被回收的風險。
- g30 的 seek 延遲明顯較高，不建議；g1 檔案大且出現過長卡頓。

功能驗證（`?bench=revealcheck`，桌機與手機皆通過）：場景在 0→0.95→0 每個檢查點都顯示正確影格（例如 p=0.45 → 第 81 格），beats 正反向一致；標題／內文 reveal 數值與公式誤差 < 0.01。
`?bench=staticcheck` + `--force-prefers-reduced-motion`：`.is-static`、0 個場景素材請求、所有文字可見、墨水停用。

## 六、已知限制

- 第一次滑鼠互動墨水時有一個 60–180 ms 長影格（各 renderer 皆有）。腳本只佔約 10 ms、render 約 8 ms，其餘未被歸因，推測為首次 GPU／合成層初始化；閒置預熱兩種做法都無效，已移除。待真機 Performance 面板確認。
- 未在實體 iPhone／Android 上測試；手機數據來自桌機 GPU 的直式視窗。
- headless 量測刷新率不固定，影格間隔只能看是否掉格，不代表真實 60/120 Hz 體驗。
- 日夜為色彩分級，非重新打光。
