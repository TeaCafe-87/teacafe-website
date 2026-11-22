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

## 五、分段導覽與快速導覽（journey-nav.js / scene-journey.js）

**共用分段滾動（journey-nav.js）**：首頁原本的滾輪、觸控、方向鍵、Page Up／Down、Space、Home／End 分段與 Topbar 收合，抽成 `TeaJourneyNav({ stops, page?, paused?, heroY?, pinTopbar? })`。首頁（home-journey.js）與場景頁都呼叫它，動畫曲線、時長、慣性判斷、Topbar 行為完全同一份。
- 一次明確的滾動意圖＝滑到下一個停靠點；滑行途中再滾，會延續到下一站，不會停在半路。觸控板的遞減慣性不算新的意圖，一次滑動不會跳過好幾站。
- 停靠點只是捲動位置，影格與文字 beats 本來就由捲動位置決定，所以滑行過程中鏡頭與文字完全同步。
- 文字欄位、`<dialog>`、`paused()` 為真時（例如開著閱覽介面）不攔截，維持原生捲動。減少動態效果：滑行改為瞬間跳到該站（首頁）；場景頁直接不攔截。
- Topbar：頁面頂端顯示；開始往下探索後收合；往上滾短暫顯示約 2.6 秒；滑鼠移到畫面最上緣、鍵盤焦點進入、`更多` 選單或設定／登入對話框開著、`pinTopbar()` 為真時都保持顯示。手機（粗指標）沿用既有 CSS，一直顯示。

**場景停靠點（scene-journey.js）**：每一幕在 HTML 宣告 `data-scene-stops="0.4,0.73"`（該幕進度），加上頁首與頁尾就是全部停靠點。七大頁面之後的場景只需要寫這個屬性。
- Wiki：開場 → 0.4 山谷介紹 → 0.73 新手資訊 → 第二幕 0.53 雲海分類 → 0.96 吊橋遠景（無文字）→ 第三幕 0.7 藏書閣入口 → Footer。
- 頁面自己記住捲動位置（`history.scrollRestoration = 'manual'`，存在各歷史紀錄的 state），避免瀏覽器的還原和「關閉閱覽介面回到原位」互相打架。重新整理會回到原本的場景位置。

**飛行（`TeaSceneJourney.fly`）**：`fly({ from: { scene, p }, to: { scene, p }, duration, veilAtEnd })`。
- 鏡頭還在起點很前面（超過 1.6 個畫面）：水墨遮罩淡入 → 跳到起點 → 等該格影格可畫（`Scene.readyAt`，最多 3 秒，超時就放棄飛行、直接開介面）→ 遮罩淡出、開始飛。已經接近或超過起點：從目前位置接著飛，時間按剩餘距離縮短。
- 飛行中路徑上的場景保持完整影格組（`Scene.keepFull`），結束後照常釋放。
- Esc 可中止。減少動態效果、靜態場景時直接回傳 false，由呼叫端立即開介面。
- 引擎另外修正：畫影格時永遠不逆著移動方向退回（取「畫面上那格」與「目標格」之間最新已載入的一格）。之前快速移動時會先畫到目標之後的粗略格、再退回較近的格，造成可見的回補。

**Wiki 的用法**：「搜尋」「目錄」「進入藏書閣」、第二幕分類、`/`、Ctrl/⌘ K 都走同一段：從第二幕進度 0.7 飛到第三幕最後一格（`wiki-03.json` 的 `library` beat 結束點 `to: 1`），約 4.6 秒；在藏書閣入口按「進入藏書閣」則只剩 0.7→1 這一段，約 1.9 秒（往洞內深入）。最後以深墨遮罩接到閱覽介面。已在閱覽介面內時只切換畫面，不重播。

## 六、Wiki：探索模式與閱覽模式

**探索模式**只放必要文字；**閱覽模式**（藏書閣）負責查資料。

### 探索模式的版面規則
- 不用卡片、外框、直立裝飾線。層級靠字級與字重；可讀性靠柔和光暈與舞台底部的紙色淡化。
- 開場：主標題「玩法百科」，直書書法，放在湖面右側三分之一，墨色、不加白色光暈；筆刷揭示由上往下。不顯示視覺麵包屑（`h1`、`<title>`、description 照舊）。下方「向下捲動」與一條往下畫的細線。

| 區塊 | 文字 | 位置（依影格構圖） |
|---|---|---|
| wiki-01 | 玩法百科（1–40） | 右側直書，湖面 |
| wiki-01 | 簡介（70–170） | 左下，湖面與倒影 |
| wiki-01 | 新手提示（180–255） | 右下，瀑布右側的湖面 |
| wiki-02 | 六大分類（100–214） | 上方天空；3×2 編輯式清單（手機單欄） |
| wiki-03 | 藏書閣＋進入藏書閣（174–300） | 正中，燈火石窟中央，淺色字 |

- 拿掉「吊橋的另一頭」「吊橋入洞」與暫定文案；吊橋與進洞的 3D 片段保留，只是不再停下來讀字。第三幕捲動長度 540 → 380svh。
- 文字仍在 HTML，管理後台可編輯（`site-copy-core.js` 的 `.scroll-scene-copy :is(h2, p, [data-copy])`）。要加一句說明：在該 beat 的元素裡加 `<p>`，不必改 JS 或 JSON。

### 閱覽模式（wiki-reader.js / wiki-reader.css）
- **同一份內容**：閱覽介面就是頁面原本的 `.content-layout`。沒有 JS 時照舊在場景下方直接閱讀。
- **三種畫面，一次一種**：分類（該分類的條目清單＋分類備註）／條目（只顯示該條目，底部有上一條、回到分類、下一條）／搜尋結果。不再把整個分類的條目接成一長頁。
- **分類瀏覽與搜尋篩選分開**：左側「百科分類」是瀏覽；搜尋結果上方的「篩選結果」只在結果跨兩個以上分類時出現，每個分類標出筆數，另有「重設篩選」「清除搜尋」。頂部不再有一排看起來像分類、其實只篩選搜尋的按鈕。
- **搜尋**：`<form role="search">`，放大鏡是 submit 按鈕，點擊與 Enter 是同一個 submit。輸入時即時更新；空白送出顯示提示、不報錯；無結果時說明並提供清除。結果可用 ↓ ↑ Enter 操作。仍讀取當下 DOM（管理後台文案、/api/wiki 即時條目、總覽卡關鍵字都搜得到）。
- **網址與歷史**：`#分類`、`#條目` 可分享、可直接開啟；閱覽中導覽只更新網址；瀏覽器上一頁＝關閉並回到進入前的場景位置，下一頁＝重新打開；重新整理會留在同一個條目，關閉後仍回到原場景位置。手動輸入 `#id` 時直接切換，不會關閉再打開。
- **鍵盤與焦點**：開啟時其他區塊 `inert`、焦點移到標題／搜尋欄；Esc 先關圖片、再清除搜尋、再關閉。app.js 原本「任何 Esc 都打開設定」的行為，在頁面自己的 modal 面板開著或飛行中時不再觸發（原本會在關閉閱覽介面時同時跳出設定）。
- 開著時：場景即時層與流體暫停、Topbar 固定顯示、浮動入口隱藏。浮動入口在 Footer 進入畫面時也會讓開，並避開手機安全區域。

### 條目圖片
在條目內任何段落之間放：
```html
<figure class="wiki-figure">
  <img src="/image/wiki/teleport-menu.webp" alt="傳送選單畫面" width="1280" height="720">
  <figcaption>按 Shift+F 開啟的傳送選單</figcaption>
</figure>

<div class="wiki-gallery">            <!-- 多張圖：縮圖排成格狀，點開看完整比例 -->
  <figure class="wiki-figure"><img src="…" alt="…" width="…" height="…" data-full="大圖.webp"><figcaption>…</figcaption></figure>
  …
</div>
```
- 自動加上 `loading="lazy"`、`decoding="async"`；寫上 `width`／`height` 可避免版面跳動。永遠保持原始比例（`height: auto`）；圖集縮圖用 4:3 裁切，放大檢視顯示完整圖。
- 點擊或 Enter 用原生 `<dialog>` 放大，有說明文字、上一張／下一張（方向鍵）、Esc 關閉。`data-full` 可指定較大的檔案。
- 檔案載入失敗時隱藏圖片，改顯示「圖片暫時無法載入：」加上 alt 文字，不會留下空白框。
- 圖說會被搜尋到。沒有正式圖片的條目不需要放任何東西。

## 七、水墨流體與錦鯉
- 流體是首頁同一份 ink-fluid.js、同一組參數。場景頁另外處理：鏡頭在移動時流體不接受攪動，並在開始移動時 `reset()`，丟掉已攪動的墨跡，從當下畫面重新開始。之前攪動過的區域會在捲動時停留舊影格，看起來像大片模糊或扭曲。文字層在流體之上，不受影響。
- 錦鯉（scene-live.js）重畫：鈍圓頭、胸鰭後最寬、細尾柄的外形；身體整條隨行進波擺動、轉彎時彎曲；半透明分叉尾鰭與圓形胸鰭；紅白／烏鯉的斑紋裁切在身體內；背線增加立體感；依深度混入水色並降低不透明度；湖底一層很淡的影子。數量、位置、游動邏輯與素材不變。

## 八、本機預覽與測試

```
python tools/preview-static.py                     # http://127.0.0.1:4173/wiki.html（/api/* 不可用）
node tools/cdp-scenes.mjs desktop                  # 三幕串接：定點截圖、交界、整段掃描（bench-shots/chain-*）
node tools/cdp-scenes.mjs mobile
MODE=perf node tools/cdp-scenes.mjs desktop        # 每幕單獨掃描（即時層開／關）
MODE=motion node tools/cdp-scenes.mjs desktop      # 停止捲動時的動態（兩張相隔 0.5 s 的截圖）
MODE=reader node tools/cdp-scenes.mjs desktop      # 分段滾動、Topbar、快速導覽、閱覽／搜尋／條目／圖片／歷史：37 項端對端（手機改 mobile）
MODE=reduced node tools/cdp-scenes.mjs desktop     # 減少動態效果：靜態場景、原生捲動、立即開啟
python tools/bench-server.py desktop frames revealcheck livecheck inkprobe
python tools/bench-server.py mobile video-g8 revealcheck
BENCH_FLAGS=--force-prefers-reduced-motion python tools/bench-server.py desktop staticcheck
```

## 九、實測結果（2026-11-22，v2 三幕素材）

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

**第三輪（2026-11-24，分段滾動＋快速導覽後，同一台機器，約 100 Hz）**

| 情境 | 結果 |
|---|---|
| 每幕單獨，即時層開（MODE=perf） | wiki-01 2 / 1865、wiki-02 3 / 1861、wiki-03 0 / 1954 格超過 20 ms（p95 6–12 ms） |
| 三幕連續 桌機 18 s 往下／往上 | 2 / 2657、2 / 2700 超過 20 ms，往回跳 0 |
| 三幕連續 桌機 4 s 快速往下 | 6 / 458，往回跳 0（上一輪 24 格；影格選擇改為不逆向） |
| 三幕連續 手機 | 0 超過 20 ms，往回跳 0 |
| 交界 1→2、2→3 前後 3 px | 最上層影格 299 → 0，正確 |
| 開場按「搜尋」的快速導覽 | 桌機 5.3 s、手機 5.2 s；遮罩蓋住跳接；路徑上影格 0 次倒退；平均落後約 8 格（引擎 80 ms 平滑） |
| 「進入藏書閣」 | 約 1.9 s 深入洞內後開啟 |
| JS heap（飛行後） | 約 4 MB（影格解碼記憶體不在 JS heap，見上一輪的量測方式） |

## 十、需要 Cowork 處理／確認

1. **已知問題，建議重算**：wiki-02 第 90 格附近崖頂深藍色閃過約一秒；wiki-03 第 146–154 格畫面底部看得到洞口前石平台。網站端沒有遮蓋（不想用粗糙效果掩飾），這兩段目前也沒有放文字。
2. **wiki-03 遮罩（選用）**：若要讓洞內微塵、燈光被柱子正確遮擋，需要一張「可見空氣」或深度遮罩；目前微塵只在可見燈籠周圍 1.5 m 內。
3. **錦鯉若要再精緻**：網站端已重畫程序化外形（見第七節）；若要寫實質感，仍需透明背景的錦鯉動畫精靈或俯視材質。

## 十一、已知限制

- 沒有實體 iPhone／Android、沒有 Safari 測試。
- 桌機開啟即時層後，每幕約有 2–5% 的影格漏一次刷新（舊版單幕 <1%）；邊捲邊載入下一幕時約 8%。
- 錦鯉是程序化外形（已改良）；水面折射只用輕微晃動近似。
- 快速導覽的時長固定（約 4.6 s），網路很慢時以「等起點影格最多 3 秒、否則直接開介面」降級；途中尚未載入的影格會停在最近一格，不會倒退。
- `/api/*`（登入、Discord、伺服器狀態）在純靜態伺服器不可用；需要 Cloudflare Pages 本機環境（wrangler）才能驗證。
