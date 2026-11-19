# 捲動場景與共用動態系統

相關檔案：`dist/assets/js/scroll-scene.js`、`dist/assets/js/scroll-motion.js`、`dist/assets/css/scroll-scene.css`、`dist/assets/js/scene-live.js`、`dist/assets/js/ink-fluid.js`、`dist/data/scenes/*.json`、`dist/assets/scenes/<id>/`（素材）、`docs/scenes/<id>/`（Cowork 交接文件，不部署）、`tools/preview-static.py`、`tools/bench-server.py`。

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

- **資料分離**：影格來源、FPS、裁切焦點、文字出入時間（beats）在 JSON；文字在 HTML（SEO、管理後台文案編輯仍可用）；動態外觀在 CSS。
- **進度**：`progress = -section.top / (section.height - viewport)`，只讀取位置，不攔截 wheel／touch。以約 80 ms 臨界阻尼追隨，停止捲動即停在對應影格。
- **beats**：`{ id, from, to, edge }`（0–1 的場景進度）。引擎寫入 `--beat-in`、`--beat-out`，兩者都是進度的純函數，所以反向捲動會精確倒放，不會重複觸發。
- **renderer**：`frames`（WebP 影格序列畫到 canvas，粗到細載入）或 `video`（MP4 currentTime，seek 不重疊）。在 JSON 依桌機／手機設定，測試時可用 `?renderer=video|frames` 覆寫；某個版本沒有提供該格式時，自動改用另一種。
- **影格編號**：檔案從 `0001` 開始。索引 `i = round(p × (frames − 1))` 對應檔案 `i + 1`＝Blender 第 `i + 1` 格；MP4 跳到 `i / fps` 秒。
- **影格快取**：影格以 `<img>` 解碼一次，常駐多少張解碼後影像交給瀏覽器的影像快取決定（實測見第五節）。
- **退回靜態**：`prefers-reduced-motion`、`html[data-motion="reduced"]`、Save-Data／2G、`navigator.deviceMemory ≤ 1`、素材錯誤 → `.is-static`：海報 + 依序排列的文字，區塊高度回到自然高度。無 JS 由 `<noscript>` 樣式處理。
- **懶載入與清理**：場景接近視窗（1 個視窗高）才抓 JSON 與素材；離開畫面不繪製；`pagehide`（非 bfcache）時釋放解碼器、影格與事件。
- **只有白天**：日夜輪替只屬於首頁影片（home-journey.js 讀 `teacafe-theme`）。場景頁永遠是白天素材，不套假夜色濾鏡，也不改寫使用者的日夜偏好。
- **量測**：`TeaScrollScene.scenes[0].stats` 提供 seek 次數／延遲、與目標影格的落差、首格時間、已載入影格數。

### 新增一個場景
1. Cowork 交付影格（或 MP4）到 `dist/assets/scenes/<id>/`，交接文件與 metadata 放 `docs/scenes/<id>/`（內含本機路徑，不要放在 `dist/` 公開）。
2. 新增 `dist/data/scenes/<id>.json`，依 metadata 填入 fps、frames、sources（含 `size`、`focus`）、beats。
3. 在頁面放上上方的 HTML 區塊，並引入 `scroll-scene.css` 與 `scroll-scene.js`。

## 二、共用標題／內文動態（scroll-motion.js）

- 在區域加上 `data-reveal-scope`：其中 `h2` 視為標題，`h3`、`p`、卡片格、FAQ、提示框視為內文；也可直接對單一元素標記 `data-reveal="title|body"`。
- 標題：沿用 motion.css 的 kinetic 語言（由左往右的筆刷 clip 揭示＋64px 平移，`--tc-ease`），但由捲動位置驅動，往上捲會精確倒放；底線同步展開；離開上緣時輕微上移淡出。
- 內文：較晚開始（94% → 70%），位移較小、不做逐字動畫。
- 數值全由元素位置決定，可正反向；只量測接近視窗的元素（IntersectionObserver），每幀先讀後寫。
- 被 `data-reveal-scope` 涵蓋的元素，`motion.js` 舊的 kinetic／一次性進場會自動略過，避免重複動畫。

## 三、即時世界層（scene-live.js）

和首頁 journey-live.js 同一個原則：預算圖只負責「鏡頭」，會自己動的東西畫在即時層。
- **兩種時間**：Scroll Time（畫面上的影格 → Blender 攝影機）決定投影；World Time（`performance.now()`）推動魚、水、霧。停止捲動只有鏡頭停；往上捲水不會倒流、魚不會倒游。
- **投影**：`/data/scenes/<id>.camera.json`（Cowork camera_path.json 精簡版：每格位置＋XYZ euler、28mm／36mm、河道與瀑布幾何），與 Blender 相同的投影，再套與影格相同的 cover／focus 裁切。已用 camera_analysis.json 的瀑布量測值驗證（底緣誤差 < 0.005）。
- **錦鯉**：12 條，世界座標中的 3D 外形（身體、尾、胸鰭）逐點投影；各自漫遊、慢轉向、保持距離、留在池內；鏡頭抬起後自然離開畫面（第 70 格後隱藏）。
- **瀑布**：水絲沿 build_scene.py 的瀑布幕面由上往下流；底部水霧與泡沫光暈。只畫在「這張影格裡是瀑布白」的像素上（以影格本身做遮罩），前方的山與霧自然擋住。鏡頭移動中由烘焙瀑布負責動態，停下約 150 ms 後即時水絲淡入（遮罩以 createImageBitmap 非同步產生）。
- **水面與霧**：河面細碎反光、低空霧帶緩慢漂移，皆在世界座標中。
- **圖層**：桌機直接畫進影格 canvas（影格→世界）；手機畫在 video 上方的獨立 canvas。原因見第六節。
- **魚的重影**：Cowork 的影格 1–23 烘焙了錦鯉。現在用 `patches` 把第 1–60 格換成**測試用**無魚重算（`tools/scenes/render_wiki01_nokoi.py`，只隱藏 Koi_*，其餘設定同 deliver.py），手機用 `mobile-g8-nokoi.mp4`，海報也換成無魚版。正式版請 Cowork 交付（見第七節）。

## 四、水墨流體游標（ink-fluid.js）

首頁同一份 WebGL2 流體（stable fluids：平流、渦度、壓力投影，把畫面當墨水再注入）。
- 擴充：`video` 參數也可以是已經是完整畫面的 `<canvas>`（影格序列），以 1:1 取樣；首頁的 `<video>` 路徑不變（tests/ink-fluid.mjs 通過）。
- `destroy()` 會呼叫 `WEBGL_lose_context` 立即釋放 GPU 資源；重新掛載時換新的 canvas。
- 只在 `(hover: hover) and (pointer: fine)` 啟用；觸控捲動會一直攪動，手機改用靜態（降級）。
- canvas `pointer-events: none`，不擋任何點擊；離開場景（舞台捲出）就停止接受攪動。

## 五、本機預覽

```
python tools/preview-static.py                     # http://127.0.0.1:4173/wiki.html（/api/* 不可用）
python tools/bench-server.py desktop frames        # 效能（桌機 1440×900）
python tools/bench-server.py mobile video-g8       # 效能（手機直式）
python tools/bench-server.py desktop revealcheck   # 功能：影格與文字正反向
python tools/bench-server.py desktop livecheck     # 即時層：停止捲動時魚持續移動
python tools/bench-server.py desktop livecapture-0.97   # 存下 24 張合成畫面（bench-shots/）
```

## 六、實測結果（2026-11-19，正式 wiki-01 + 即時層 + 流體）

環境：Ryzen 7 260 + Radeon 780M、Chrome 157 **headless**（本機伺服器，無網路延遲）。**全部是模擬，沒有實機手機**；「手機」是 488×748@3 的直式視窗，仍是桌機 GPU，也沒有觸控。

| 情境 | 影格間隔 平均 / p95 | 落後影格 | 其他 |
|---|---|---|---|
| 桌機慢速 6 s 下／上 | 14.1 / 14.3 ms | 0 | 300 張 2.6 s 載完，首格 35 ms |
| 桌機快速 0.8 s 下／上 | 14.1 / 14.3 ms | 0 | 停止後 380 ms 內對準 |
| 桌機滑鼠攪動流體＋捲動 | 14.1 / 14.4 ms | 0 | 流體第一次互動最長 14.8 ms（舊 hero-ink 有 60–180 ms 長影格） |
| 手機 MP4 慢速／快速 | 14.0–14.2 / 14.2 ms | 1–4 | seek 平均 5 ms、p95 8 ms |

（這台 headless Chrome 以約 71 Hz 刷新，14.1 ms 即每格都準時。）
- 停止捲動 2 秒，12 條錦鯉各移動 0.3–0.8 m，影格保持不變（livecheck）。
- 往上捲時瀑布水絲依 World Time 繼續向下（livecapture 證明時間單向）。
- Reduced motion：靜態海報、0 個場景素材請求、即時層與流體都不啟動。

**修掉的效能問題**（合併後才出現）：最初每次捲動到新影格都同步重建瀑布遮罩（把整張影格畫進可讀 canvas 再 getImageData，約 10 ms），桌機掃描時 1/3 影格超過 20 ms。以 A/B（舊版 worktree 逐一換檔）定位後，改為：非同步遮罩、鏡頭移動中不建遮罩、每幀只重繪一次、即時層直接畫進影格 canvas。結果回到合併前的水準。

## 七、需要 Cowork 補充的素材（正式品質）

1. **無錦鯉的背景影格**（桌機 1–60 WebP、手機 1–60 PNG／重新編碼 MP4），取代目前的測試重算。
2. **瀑布貼圖改為與影格無關的靜態紋理**（或另出一版「瀑布無流動」影格）：目前 Waterfall 材質由 `frame/45` 驅動，往上捲時烘焙的水紋會往上跑；即時水絲已能提供停止時的流動。
3. **瀑布遮罩／深度**（選用）：每格的瀑布 alpha 或深度圖可取代「以亮度判斷」的遮罩，霧特別濃時更準。
4. **水面遮罩**（選用）：讓水面反光只落在水上（目前以河道中線±72% 半寬近似）。
5. 錦鯉若要更精緻：可交付透明背景的錦鯉動畫精靈或正交俯視的錦鯉材質，網站端換掉目前的程序化外形即可。

## 八、已知限制

- 沒有實體 iPhone／Android、沒有 Safari 測試。
- 錦鯉是程序化的簡化外形（比照 Blender 的低面數錦鯉），不是高品質手繪；水面折射只用輕微晃動近似。
- 瀑布遮罩以亮度＋低彩度判斷，濃霧處可能有少量水絲出現在霧上。
- `/api/*`（登入、Discord、伺服器狀態）在純靜態伺服器不可用；需要 Cloudflare Pages 本機環境（wrangler）才能驗證。
