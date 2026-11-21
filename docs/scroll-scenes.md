# 捲動場景與共用動態系統

相關檔案：`dist/assets/js/scroll-scene.js`、`dist/assets/js/scroll-motion.js`、`dist/assets/css/scroll-scene.css`、`dist/assets/js/scene-live.js`、`dist/assets/js/ink-fluid.js`、`dist/data/scenes/*.json`、`dist/assets/scenes/<id>/`（素材）、`docs/scenes/<id>/`（Cowork 交接文件，不部署）、`tools/scenes/build_scene_data.py`、`tools/preview-static.py`、`tools/bench-server.py`、`tools/cdp-scenes.mjs`。

## 一、場景（scroll-scene.js）

一個章節 = 一份 JSON + 一段 HTML，不需修改引擎。

```html
<section class="scroll-scene" data-scroll-scene="/data/scenes/wiki-01.json" style="--scene-length:560svh">
  <div class="scroll-scene-stage">
    <picture>…poster…</picture>
    <div class="scroll-scene-media"></div>
    <canvas class="scroll-scene-live" data-scene-world></canvas>
    <canvas class="scroll-scene-fluid" data-scene-fluid></canvas>
    <div class="page-title-inner scroll-scene-copy">
      <h1 data-beat="title" data-beat-role="title">…</h1>
      <p data-beat="intro" data-beat-role="body" style="--beat-in:0">…</p>
    </div>
  </div>
</section>
```

- **資料分離**：影格來源、FPS、裁切焦點、遮罩、文字出入時間（beats）在 JSON；文字在 HTML（SEO、管理後台文案編輯仍可用）；動態外觀在 CSS。
- **進度**：`progress = -section.top / (section.height - viewport)`，只讀取位置，不攔截 wheel／touch。以約 80 ms 臨界阻尼追隨，停止捲動即停在對應影格。
- **beats**：`{ id, from, to, edge }`（0–1 的場景進度）。引擎寫入 `--beat-in`、`--beat-out`，兩者都是進度的純函數，所以反向捲動會精確倒放。`data-beat-place="top"` 把該段文字放到畫面上方（例：wiki-02 雲海上方的留白）。
- **renderer**：`frames`（WebP 影格序列畫到 canvas）或 `video`（MP4 currentTime，seek 不重疊）。在 JSON 依桌機／手機設定，可用 `?renderer=video|frames` 覆寫。
- **影格編號**：每個場景的檔案從 `0001` 開始。索引 `i = round(p × (frames − 1))` 對應檔案 `i + 1`；MP4 跳到 `i / fps` 秒。
- **退回靜態**：`prefers-reduced-motion`、`html[data-motion="reduced"]`、Save-Data／2G、`navigator.deviceMemory ≤ 1`、素材錯誤 → `.is-static`：海報 + 依序排列的文字，區塊回到自然高度、不重疊。尚未啟動的後段場景在開機時就標成靜態，頁面不會跳動。無 JS 由 `<noscript>` 樣式處理。
- **只有白天**：日夜輪替只屬於首頁影片。場景頁永遠是白天素材，不套假夜色濾鏡，也不改寫使用者的日夜偏好。

### 多場景串接（wiki-01 → 02 → 03）

Cowork 的三幕是一段連續鏡頭：前一幕第 300 格＝下一幕第 1 格（camera_path.json 數值相同，已驗證）。
- **無縫交接**：後一個區塊以 `margin-top: -100lvh` 與前一個重疊一個舞台高，所以前一個舞台「解除固定」的那一刻，後一個剛好「開始固定」。引擎在固定中的區塊加上 `data-scene-pinned`，CSS 讓它疊在上面。交界兩邊畫的是同一張圖，就算旗標比合成器捲動晚一幀也看不出來。實測：交界前後 3 px，最上層分別是第 299 格與第 0 格；整段 900 格掃描沒有任何一步往回跳。
- **一次只有一幕是完整的**：固定中的場景（active）載入全部 300 格，從目前位置附近開始（先每 4 格，再補齊）。其他場景只保留粗略組（第 1、最後一格、每 32 格，約 11 張，包含交界那一格）。離開固定 1.5 秒後才釋放，停在交界附近不會反覆重載。原因：兩幕各 300 張解碼影格超出 Chrome 的影像解碼快取，畫面上那一幕會在繪製時重新解碼（桌機 p95 10 → 20 ms）。
- **遠處休眠**：區塊離視窗超過 1.5 個畫面高就釋放 renderer、影格、解碼器、即時層與流體（海報保留）；1 個畫面內才啟動（JSON、素材），中間有遲滯。手機一次最多 2–3 個 `<video>`。

### 新增一個場景
1. Cowork 交付影格／MP4／遮罩到 `dist/assets/scenes/<id>/`，交接文件放 `docs/scenes/<id>/`（內含本機路徑，不要放在 `dist/`）。
2. `python tools/scenes/build_scene_data.py <id>` 由 camera_path.json、masks_coverage.json、camera_analysis.json 產生 `dist/data/scenes/<id>.camera.json`。
3. 新增 `dist/data/scenes/<id>.json`（fps、frames、sources、beats、live、camera）。
4. 在頁面放 HTML 區塊；接續上一幕時直接放在前一個 `</section>` 後面。

## 二、共用標題／內文動態（scroll-motion.js）

- 在區域加上 `data-reveal-scope`：其中 `h2` 視為標題，`h3`、`p`、卡片格、FAQ、提示框視為內文；也可標記 `data-reveal="title|body"`。
- 標題：沿用 motion.css 的 kinetic 語言（由左往右的筆刷 clip 揭示＋64px 平移，`--tc-ease`），由捲動位置驅動，可精確倒放；底線同步展開。
- 內文：較晚開始、位移較小、不做逐字動畫。
- 場景內的搜尋框 `<form data-scene-search="#wiki-search">`：送出時把字串交給頁面原有的 Wiki 搜尋欄（觸發它既有的過濾）並捲到該欄位。

## 三、即時世界層（scene-live.js）

預算圖只負責「鏡頭」，會自己動的東西畫在即時層。v2 素材的瀑布、湖面、霧紋理都是靜止的，流動感全部來自這一層。
- **兩種時間**：Scroll Time（畫面上的影格 → Blender 攝影機）決定投影；World Time（`performance.now()`）推動魚、水、霧、燈火。停止捲動只有鏡頭停；往上捲水不會倒流。
- **投影**：`<id>.camera.json`（每格位置＋XYZ euler、28mm／36mm），與 Blender 相同的投影，再套與影格相同的 cover／focus 裁切。重新產生的 wiki-01 與舊版最大差 0.0005（舊版四捨五入），瀑布投影與 camera_analysis.json 一致。
- **遮罩（Cowork masks-*）**：R＝看得到的湖面／河面，G＝看得到的瀑布幕面。只載入畫面上那一格的遮罩（一次一張、捲動中最多約每秒 9 張、停下立刻補上），以 createImageBitmap 在主執行緒外縮小，只讀回很小的點陣。`masks_coverage` 為 0 的格完全不載。
  - 水面層（反光＋錦鯉）乘上 R：岸、石、樹前的魚與反光被擋住。
  - 瀑布水絲乘上 G × 影格亮度（G 含兩側淡出的邊）；亮度只在鏡頭停下時讀取，捲動中只用 G。
- **錦鯉**：只在 wiki-01 開頭俯視湖面（第 1–70 格）。12 條 3D 外形各自漫遊、轉向、保持距離。
- **瀑布**：亮的水絲與藍灰的間隙一起沿幕面往下流，加上底部水霧與泡沫光暈。wiki-01 後段與 wiki-02 前段（桌機約 1–30 格）。
- **燈火（wiki-03）**：用 `lanterns_visible`（每格看得到哪幾盞）與 `lanterns_world` 投影；光暈慢呼吸＋快速閃爍＋偶爾暗一下；進洞後（第 130–170 格漸強）燈旁有微塵往上飄。
- **霧**：沿河道的低空霧帶，wiki-01 全段、wiki-02 前 40 格。
- **各幕開關**：manifest `live`：`koi`、`water`、`waterfall`、`mist {frames}`、`lanterns {glowM, dark}`。
- **圖層**：桌機直接畫進影格 canvas（影格→世界）；手機畫在 video 上方的獨立 canvas（第二張全畫面 canvas 疊在變動的 canvas 上，桌機每幀多約 6 ms）。

修掉一個舊錯誤：水絲的淡入淡出寫成 `sin(π·min(1,…))`，在幕面中段為 0，所以之前水絲只在頂端與底部出現。改為 `sin(π/2·…)` 後，停止捲動 0.5 秒，瀑布區域約 3% 的像素有可見變化（之前約 0%）。

## 四、水墨流體游標（ink-fluid.js）

首頁同一份 WebGL2 流體。可吃 `<video>` 或完整畫面的 `<canvas>`；`destroy()` 立即釋放 GPU。只在 `(hover: hover) and (pointer: fine)` 啟用，每個場景各自掛載，只有固定中的舞台接受攪動。

## 五、Wiki 三幕內容

| 區塊 | 長度 | 文字（HTML） |
|---|---|---|
| wiki-01 山谷飛行 | 560svh | 標題（1–40 格）、簡介（70–170）、新手提示（180–255） |
| wiki-02 雲上石塔 | 520svh | 六大分類入口（100–214，畫面上方留白）、吊橋提示（238–296） |
| wiki-03 吊橋入洞 | 540svh | 搜尋框（14–124，橋上）、條目索引（180–294，燈火石窟，淺色字） |

wiki-03 進洞（第 162 格）前後，紙色淡化層退掉、文字改為深底淺字（`data-scene-tone="cave"`，由 `--scene-progress` 計算）。wiki-03 結束後接 Wiki 主要內容；之後的「藏書石窟」場景可直接接在 wiki-03 後面。
標題字型子集（teacafe-shufa.woff2）已重建，納入「六個分類，從這裡出發」「條目索引」（`tools/build-title-font.py` 會收錄 `h2.scene-heading`）。

## 六、本機預覽與測試

```
python tools/preview-static.py                     # http://127.0.0.1:4173/wiki.html（/api/* 不可用）
node tools/cdp-scenes.mjs desktop                  # 三幕串接：定點截圖、交界、整段掃描（bench-shots/chain-*）
node tools/cdp-scenes.mjs mobile
MODE=perf node tools/cdp-scenes.mjs desktop        # 每幕單獨掃描（即時層開／關）
MODE=motion node tools/cdp-scenes.mjs desktop      # 停止捲動時的動態（兩張相隔 0.5 s 的截圖）
python tools/bench-server.py desktop frames revealcheck livecheck inkprobe
python tools/bench-server.py mobile video-g8 revealcheck
BENCH_FLAGS=--force-prefers-reduced-motion python tools/bench-server.py desktop staticcheck
```

## 七、實測結果（2026-11-22，v2 三幕素材）

環境：Ryzen 7 260 + Radeon 780M、Chrome headless（本機伺服器，無網路延遲），這次約 100 Hz 刷新（10 ms＝每格準時，20 ms＝漏一格）。**全部是模擬，沒有實機手機與 Safari**；「手機」是 390×844@3 的直式視窗，仍是桌機 GPU。

**每幕單獨，影格全部載入後，6 s 往下＋6 s 往上（cdp-scenes MODE=perf，多次執行的範圍）**

| 場景 | 即時層 | 平均 / p95 | 超過 20 ms |
|---|---|---|---|
| 舊版 74e4187（只有 wiki-01） | 開 | 9.9 / 10.4 ms | 3 / 1205 |
| wiki-01 | 開 | 10.5–10.7 / 19.3–19.8 ms | 28–30 / ~1130（2.5%） |
| wiki-01 | 關 | 10.0–10.1 / 10.4–10.5 ms | 7 / ~1195 |
| wiki-02 | 開 | 10.5–11.1 / 16.2–20.1 ms | 21–56 / ~1110（2–5%） |
| wiki-02 | 關 | 10.2–10.4 / 10.6–16.2 ms | 12–26 |
| wiki-03 | 開 | 10.3–10.5 / 11.1–18.1 ms | 20–34 / ~1150（2–3%） |
| wiki-03 | 關 | 10.0–10.3 / 10.6–11.0 ms | 5–15 |

**三幕連續（cdp-scenes，含邊捲邊載入下一幕）**

| 情境 | 平均 / p95 | 超過 20 ms | 往回跳 | 最大一步 |
|---|---|---|---|---|
| 桌機 18 s 往下 900 格 | 11.7 / 20.2 ms | 120 / 1544（7.8%） | 0 | 6 格 |
| 桌機 18 s 往上 | 11.4 / 20.1 ms | 105 / 1582 | 0 | 5 格 |
| 桌機 4 s 快速往下 | 14.2 / 29.6 ms | 55 / 281 | 24 格 | 32 格 |
| 手機 18 s 往下／往上 | 9.9 / 10.2–10.3 ms | 0–2 | 0 | 3–5 格 |
| 手機 4 s 快速往下 | 9.9 / 10.4 ms | 1 | 0 | 18 格 |

- 桌機快速掃過時，下一幕還只有粗略組，畫面會先顯示最近的粗略格再補上正確格，所以有往回 24 格的一步；正常速度捲動沒有。
- 交界：四個方向（1→2、2→3 各前後 3 px）最上層的影格都正確，固定旗標正確交換。
- 文字 beats：三幕各定點正反向都是預期的段落（wiki-01 另有 revealcheck 數值比對，桌機與手機皆通過）。
- 停止捲動：錦鯉 2 秒移動 0.2–0.9 m、影格不變（livecheck）；瀑布 0.5 秒內約 3% 像素變化；燈火有閃爍（變化小，屬刻意的微弱效果）。
- 手機 MP4（bench-server video-g8）：seek 平均 5.9 ms、p95 10.4 ms。
- 流體第一次互動最長 13.8 ms。
- Reduced motion：三幕全部靜態、不重疊、0 個影格／遮罩／MP4 請求。

**修掉的效能問題**：最初串上三幕後，wiki-01 即使關掉即時層也有 78 個慢格（舊版 3 個）。以舊版 worktree 逐一換檔定位：素材、引擎、CSS 都不是原因；拿掉第二、三幕的 DOM 就恢復 → 是鄰幕在背景載入、解碼 300 張影格擠掉了畫面上那一幕的解碼快取。改成「一次只有固定中的那幕完整、其他只留粗略組」後恢復到 7 個。即時層的瀑布另外改為：亮度只在鏡頭停下時讀取、讀回用的 canvas 結果複製到 GPU canvas 再每幀繪製。

**素材量與載入**：三幕合計約 101 MB（桌機影格 50.2 MB、手機 MP4 11.4 MB、桌機遮罩 23.6 MB、手機遮罩 16.1 MB），但一位訪客只會下載其中一種版本：桌機約 50 MB 影格＋依需要的遮罩（整段走一遍實測約 9 MB），手機約 11.4 MB MP4＋約 6.7 MB 遮罩。每幕都是接近視窗才抓、粗到細。
- 注意：釋放後再回來會重新請求影格。本機是 HTTP 快取；Cloudflare Pages 預設要重新驗證（304），每張多一次往返。建議之後替場景素材加版本參數（例如 `{0000}.webp?v=v2-2026-11-19`）並在 `_headers` 給 `/assets/scenes/*` 長效快取（本次沒有改部署設定）。

## 八、需要 Cowork 處理／確認

1. **已知問題，建議重算**：wiki-02 第 90 格附近崖頂深藍色閃過約一秒；wiki-03 第 146–154 格畫面底部看得到洞口前石平台。網站端沒有遮蓋（不想用粗糙效果掩飾），這兩段目前也沒有放文字。
2. **wiki-03 遮罩（選用）**：若要讓洞內微塵、燈光被柱子正確遮擋，需要一張「可見空氣」或深度遮罩；目前微塵只在可見燈籠周圍 1.5 m 內。
3. **錦鯉若要更精緻**：可交付透明背景的錦鯉動畫精靈或俯視材質；網站端目前是程序化的簡化外形。

## 九、已知限制

- 沒有實體 iPhone／Android、沒有 Safari 測試。
- 桌機開啟即時層後，每幕約有 2–5% 的影格漏一次刷新（舊版單幕 <1%）；邊捲邊載入下一幕時約 8%。
- 錦鯉是程序化外形；水面折射只用輕微晃動近似。
- `/api/*`（登入、Discord、伺服器狀態）在純靜態伺服器不可用；需要 Cloudflare Pages 本機環境（wrangler）才能驗證。
