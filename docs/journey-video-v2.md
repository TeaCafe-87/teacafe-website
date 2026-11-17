# 背景旅程影片 v2（Art-Of-Ink 山水）

以 [Art-Of-Ink](https://github.com/clouder118/Art-Of-Ink) 的 `ink_painting3.png` 為底，做成四幕、跟著捲動播放的背景影片。

預覽頁：`/journey-preview.html`（noindex，只用來看效果與量測內容位置）。

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `dist/assets/video/journey-desktop.mp4` | 橫式 1600×900，24 秒，約 5 MB，無聲無字 |
| `dist/assets/video/journey-portrait.mp4` | 直式 810×1440（手機），約 3 MB |
| `dist/assets/video/journey-*.camera.json` | 每一格的鏡頭參數、遮擋格、瀑布可見度、留白時段 |
| `dist/assets/video/journey-*-start.jpg` | 第一格海報（影片載入前先顯示） |
| `dist/assets/video/journey-live.json`、`journey-sprites.png` | 動態疊層的素材：飛鳥、小舟、瀑布與溪流路徑 |
| `dist/assets/video/journey-grain.png` | 紙紋材質（靜態，疊在影片上） |
| `dist/assets/js/journey-live.js` | 動態疊層：瀑布水絲、潭霧、溪面反光、小舟、飛鳥 |
| `tools/journey-video-v2/` | 產生器原始碼 |

## 四幕與內容位置（捲動進度 p = 0～1）

| 段落 | p 範圍 | 畫面 | 留白（放內容）|
| --- | --- | --- | --- |
| 第一幕・全景 | 0.00–0.05 | 原圖完整呈現，小舟與飛鳥開始移動 | 無（首頁 Hero） |
| 轉場 | 0.05–0.31 | 沿水道推進，左近山與主峰往兩側分開，瀑布出現 | — |
| 第二幕・穿山見瀑 | **0.31–0.41** | 遠方左側高峰與瀑布 | 桌機右半／手機下半（0.255 起淡入，0.47 淡出完） |
| 轉場 | 0.41–0.58 | 順著溪往右，回到主峰山腳 | — |
| 第三幕・順流過橋 | **0.58–0.67** | 主峰山腳的拱橋 | 桌機左半／手機下半（0.515 起淡入，0.735 淡出完） |
| 轉場 | 0.67–0.88 | 沿主峰上升，穿過雲層 | — |
| 第四幕・登頂雲海 | **0.88–1.00** | 山尖在雲海上，遠方可見瀑布山，飛鳥經過 | 桌機右半／手機下半（0.81 起淡入） |

每幕停留段的鏡頭只會極慢地推進，所以文字放在那段期間最穩。精確的淡入淡出時間在 `camera.json` 的 `wash` 欄位，與影片裡烘進去的留白一致。

## 為什麼往上捲水不會倒流

影片裡**只有鏡頭運動**，畫中所有東西都是靜止的。會自己動的東西（瀑布水絲、潭霧、溪面反光、小舟、飛鳥）由 `journey-live.js` 在影片上方的 canvas 依真實時間繪製，永遠往前動。

對齊方式：渲染器把每格的鏡頭（`cxw, cyw, Zc, zoom`）輸出到 `camera.json`，疊層用同一個投影公式算出位置；`requestVideoFrameCallback` 回報畫面上實際顯示的是哪一格，所以快速捲動時也會跟著解碼後的畫面。`camera.json` 另外帶有每格的低解析遮擋格（主峰、雲擋在飛鳥前面時飛鳥會被藏起來）與瀑布可見度。

```html
<div class="stage">
  <img src="/assets/video/journey-desktop-start.jpg" alt="">
  <video muted playsinline preload="auto" src="/assets/video/journey-desktop.mp4"></video>
  <canvas></canvas>
  <div class="grain"></div>   <!-- background: url(journey-grain.png); mix-blend-mode: overlay; opacity: .55 -->
</div>
<script src="/assets/js/journey-live.js"></script>
<script>
  TeaJourneyLive.attach(video, canvas, {
    camera: '/assets/video/journey-desktop.camera.json',
    live: '/assets/video/journey-live.json',
    sprites: '/assets/video/journey-sprites.png',
  });
</script>
```

- video、canvas 必須疊在同一個位置、同樣的 `object-fit: cover`；疊層會讀取 video 的 `object-position` 自動對齊。
- 寬高比小於 3:4（直立手機）用 `journey-portrait.*`，其餘用 `journey-desktop.*`。
- 影片永遠只做 seek、不 play（捲動驅動的方式同 `home-journey.js`）。
- `prefers-reduced-motion` 時疊層停在靜止狀態，但仍跟著鏡頭位置。

## 重新產生

需要 Python 3、numpy、Pillow、opencv-python-headless、scipy、onnx、onnxruntime、ffmpeg。

```
cd tools/journey-video-v2 && mkdir -p work   # 把 Art-Of-Ink 的 ink_painting3.png 複製為 src.png
curl -LO https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth
python3 esrgan_onnx.py RealESRGAN_x4plus_anime_6B.pth src.png work/src_x4.png   # 原圖 4 倍超解析（不需 PyTorch）
python3 ink_alpha.py                # 墨色強度圖 work/ink_alpha.npy
python3 build_layers.py             # 拆成 6 層 + 取出小舟/飛鳥
python3 additions.py                # 補畫瀑布、溪流、雲海
python3 render.py preview desktop 0 0.31 0.6 0.9   # 先看關鍵影格
python3 render.py encode desktop  ../../dist/assets/video/journey-desktop.mp4
python3 render.py encode portrait ../../dist/assets/video/journey-portrait.mp4
```

- **拆層**（`build_layers.py`）：遠山、中景、主峰、左近山、右近山、水面 6 層。每層一個大致範圍，範圍內從「墨色強度第一次超過門檻」的地方往下歸屬該層，自動描出稜線；較遠的層會在較近的層底下補畫一小段，分開時不會露縫。霧（比紙白的部分）保持真實透明度，所以層與層分開時邊緣幾乎看不見；停在原位時合成結果與原圖相同。
- **鏡頭**（`render.py`）：`KEYS` 是各格的關鍵幀（進度、前進距離、縮放、要對準的點與它在畫面上的位置），`WASH` 是留白時段。越靠近的層放大越多、移動越快；遠山會隨距離變近而墨色變濃（空氣透視）。
