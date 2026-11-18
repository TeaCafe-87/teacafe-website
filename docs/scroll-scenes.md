# 捲動場景與共用動態系統

相關檔案：`dist/assets/js/scroll-scene.js`、`dist/assets/js/scroll-motion.js`、`dist/assets/css/scroll-scene.css`、`dist/assets/js/hero-ink.js`、`dist/data/scenes/*.json`、`dist/assets/scenes/<id>/`（素材）、`docs/scenes/<id>/`（Cowork 交接文件，不部署）、`tools/preview-static.py`、`tools/bench-server.py`。

## 一、場景（scroll-scene.js）

一個章節 = 一份 JSON + 一段 HTML，不需修改引擎。

```html
<section class="scroll-scene" data-scroll-scene="/data/scenes/wiki-01.json" style="--scene-length:560svh">
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
- **renderer**：`frames`（WebP 影格序列畫到 canvas，粗到細載入）或 `video`（MP4 currentTime，seek 不重疊）。在 JSON 依桌機／手機設定，測試時可用 `?renderer=video|frames` 覆寫；某個版本沒有提供該格式時，自動改用另一種。
- **影格編號**：檔案從 `0001` 開始。索引 `i = round(p × (frames − 1))` 對應檔案 `i + 1`＝Blender 第 `i + 1` 格；MP4 跳到 `i / fps` 秒。
- **影格快取**：影格以 `<img>` 解碼一次，常駐多少張解碼後影像交給瀏覽器的影像快取決定（實測見第五節）。
- **退回靜態**：`prefers-reduced-motion`、`html[data-motion="reduced"]`、Save-Data／2G、`navigator.deviceMemory ≤ 1`、素材錯誤 → `.is-static`：海報 + 依序排列的文字，區塊高度回到自然高度。無 JS 由 `<noscript>` 樣式處理。
- **懶載入與清理**：場景接近視窗（1 個視窗高）才抓 JSON 與素材；離開畫面不繪製；`pagehide`（非 bfcache）時釋放解碼器、影格與事件。
- **日夜**：`data-scene-time="day|dusk|night"`（預覽用 `?time=night`）。這是色彩分級疊層，不是重新打光；真正的夜景需要 Cowork 另外算一版。
- **量測**：`TeaScrollScene.scenes[0].stats` 提供 seek 次數／延遲、與目標影格的落差、首格時間、已載入影格數。

### 新增一個場景
1. Cowork 交付影格（或 MP4）到 `dist/assets/scenes/<id>/`，交接文件與 metadata 放 `docs/scenes/<id>/`（內含本機路徑，不要放在 `dist/` 公開）。
2. 新增 `dist/data/scenes/<id>.json`，依 metadata 填入 fps、frames、sources（含 `size`、`focus`）、beats。
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
python tools/preview-static.py                     # http://127.0.0.1:4173/wiki.html（?time=night、?renderer=video）
python tools/bench-server.py desktop frames        # 效能（桌機 1440×900）
python tools/bench-server.py mobile video-g8       # 效能（手機直式）
python tools/bench-server.py desktop revealcheck   # 功能：影格與文字正反向
```


## 五、實測結果：正式 wiki-01 素材（2026-11-19）

環境：Ryzen 7 260 + Radeon 780M（Chrome 使用內顯）、Chrome 157 **headless**、本機伺服器（無網路延遲）。
**全部是模擬測試，沒有實機手機數據。**「手機」是直式視窗（headless 最窄 488×748，DPR 3），仍是桌機 CPU/GPU。

素材：桌機 300 張 WebP 1600×900，共 12.6 MB（16–58 KB／張）；手機 `mobile-g8.mp4` 3.6 MB；海報 16–18 KB。

桌機 1422×804，`frames`（三次執行）：

| 項目 | 結果 |
|---|---|
| 第一格出現 | 38–93 ms（JSON 載入後） |
| 300 張全部載入＋解碼 | 3.5–4.4 s（本機；正式網路會更久，粗到細載入讓任意位置都有鄰近影格） |
| 每張 fetch＋decode | 平均 69–85 ms、p95 85–103 ms（6 個並行） |
| 慢速／反向 6 s 掃描 | 0 格落後；p95 影格間隔 6–12 ms；0 個 >34 ms |
| 快速 0.8 s 掃過全片 | 0 格落後；停止後 270–370 ms 對準（含 80 ms 緩動） |
| 滾輪段落式 | 0 格落後 |

手機直式，`video`（mobile-g8.mp4）：seek 平均 4–7 ms、p95 10–14 ms；慢速時落後 1 格，快速掃過平均 3 格、最多 9 格；停止後 190–320 ms 對準；0 個 >34 ms。

記憶體（整個 Chrome 各程序的 private memory 尖峰）：沒有場景的基準 480–620 MB；有場景時 700–1270 MB，**同一份程式重跑就會相差數百 MB**，所以只能說場景在這台機器上大約增加 0.2–0.7 GB。300 張全部解碼常駐約需 1.7 GB，實測遠低於此，代表 Chrome 會自行釋放解碼後的影格。

影格快取方案比較（桌機、正式素材）：

| 方案 | 解碼 | 快速掃描落後 | 記憶體 |
|---|---|---|---|
| `<img>` 全部保留、交給瀏覽器快取（**採用**） | 不重複解碼 | 0 格 | 雜訊範圍內最低或相同 |
| ImageBitmap 16 格視窗＋`close()` | 300 格掃一次要解碼約 1,300 次 | 5–10 格 | 803–1,274 MB，波動大 |
| ImageBitmap 加 `resizeWidth` | 48 ms／張（不縮放為 11–22 ms），慢速掃描出現 25 個 >34 ms 影格 | 17–19 格 | 未改善 |
| `<img>` 視窗（超出即釋放） | 30–34 ms／張 | 14–16 格 | 854–986 MB |

功能驗證（桌機與手機皆通過）：p = 0／0.05／0.2／0.4／0.7／0.95／1 往下再往上，每點都顯示正確影格（p=1 → 索引 299 → `0300.webp`），文字只在 metadata 建議範圍出現；標題／內文 reveal 誤差 < 0.01。Reduced motion：靜態海報、0 個場景素材請求、全部文字可見、墨水停用。

## 六、已知限制

- 沒有實體 iPhone／Android 測試；Safari（macOS／iOS）完全未測。iOS 需要 `muted`＋`playsinline`（已設定）並可能在第一次觸碰後才解碼第一格（已有 `unlockOnGesture`）。
- 記憶體只有整個瀏覽器的粗略數字；memory-infra 追蹤檔沒有成功寫出，無法單獨量出解碼影像快取。
- 第一次滑鼠移動時墨水仍有一個約 100 ms 的長影格（腳本約 10 ms，其餘未歸因）。
- 正式網路下 13 MB 影格需要時間載入；載入中顯示最接近的已載入影格，低速網路會看到較跳的畫面，Save-Data／2G 直接用海報。
- 日夜為色彩分級，非重新打光；Cowork 只交付白天版本。
