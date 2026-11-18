# Wiki 第一幕「山谷飛行」：Blender → 網站交接

給：茶咖網的 Claude Code（Cloudflare Pages 靜態網站，HTML／CSS／JS＋GSAP ScrollTrigger／`scroll-scene.js`）
來源：Blender 5.3.0 EEVEE，RTX 5060 Laptop，2026-11-19
這份文件只說明素材。我沒有修改網站程式碼，也沒有修改 `dist/data/scenes/wiki-01.json`。

## 1. 場景內容

- 開場鏡頭在湖面上方 2.2 m，往下 40° 看清澈水裡的 11 條錦鯉。
- 鏡頭往上抬到水平，同時加速。
- 接著沿 S 形河道低空飛行，兩側是層疊的喀斯特石峰；水面有倒影和波紋，峰腳有雲霧，天空是紙白色。
- 遠方瀑布一開始被霧氣遮淡，越飛越近越清楚。
- 最後減速、仰角 12°，停在瀑布前約 80 m，留給第二幕往上爬。
- 材質是自訂的水墨著色：山頂偏靛青、山腰偏青綠、山腳偏赭金，背光面沉成墨色，輪廓加深；遠處和低處淡入紙色。沒有投影陰影（說明見第 6 節）。

## 2. 檔案位置

網站素材目錄：`C:\Users\08880\Desktop\claude\teacafe-3d\site\dist\assets\scenes\wiki-01\`（網址 `/assets/scenes/wiki-01/`）

| 檔案 | 用途 | 規格 |
|---|---|---|
| `frames-desktop/0001.webp` … `0300.webp` | 桌機 `frames` renderer | 1600×900、WebP q82、300 張連續編號；共 13.2 MB，每張 16–58 KB |
| `mobile-g8.mp4` | 手機 `video` renderer | 720×1280、H.264 High、30 fps、300 格、10.0 秒；剛好每 8 格一個關鍵影格；無 B 影格、無音訊、moov 在檔頭（faststart）；3.76 MB |
| `poster-desktop.webp` | 桌機海報／靜態退回 | 1600×900，第 1 格 |
| `poster-mobile.webp` | 手機海報／靜態退回 | 720×1280，第 1 格 |
| `poster-desktop-end.webp`、`poster-mobile-end.webp` | 選用：結尾畫面，可給 reduced-motion 或下一幕銜接 | 第 300 格 |
| `scene-metadata.json` | FPS、格數、事件時間點、建議文字範圍、攝影機資訊 | 時間點都是從 Blender 實際動畫量測的 |
| `camera_path.json` | 每一格的攝影機位置和旋轉（Blender 世界座標） | 300 筆 |
| `camera_analysis.json` | 每一格的 pitch／yaw、瀑布與錦鯉是否在畫面內 | 300 筆 |
| `HANDOFF.md` | 本文件 | |

Blender 專案（不需要放上網站）：`C:\Users\08880\Desktop\claude\teacafe-3d\wiki-01\`

- `scene.blend`：完整場景。`FlightCam` 是橫式攝影機；`FlightCamPortrait` 是直式攝影機，和橫式共用同一條動畫。
- `build_scene.py`：從零重建整個場景。
- `deliver.py`：交付用的渲染腳本。
- `render_all.bat`：雙擊後依序產出桌機影格、手機 PNG 影格和手機 MP4。
- `out/`：渲染原始輸出和每格耗時紀錄（`log_*.json`）。

⚠ `site/.gitignore` 目前忽略整個 `dist/assets/scenes/wiki-01/`，這是給 placeholder 用的設定。正式素材要上 Cloudflare Pages 之前，請把這一行移除或改寫，否則不會被提交、也不會被部署。

⚠ 目錄裡舊的 placeholder 檔案（`desktop-g1.mp4`、`desktop-g8.mp4`、`desktop-g30.mp4`、`mobile-g1.mp4`、`poster-desktop.png`、`frames-mobile/`）都還在，不是這次交付的內容。我的權限不能刪除檔案，請確認後自行清除。

## 3. 對應到 `dist/data/scenes/wiki-01.json`

請 Claude Code 自行更新以下內容（我沒有改這個檔案）：

```json
"fps": 30,
"frames": 300,
"placeholder": false,
"sources": {
  "desktop": { "frames": "/assets/scenes/wiki-01/frames-desktop/{0000}.webp", "poster": "/assets/scenes/wiki-01/poster-desktop.webp", "focus": [0.5, 0.45] },
  "mobile":  { "video":  "/assets/scenes/wiki-01/mobile-g8.mp4",              "poster": "/assets/scenes/wiki-01/poster-mobile.webp",  "focus": [0.5, 0.45] }
}
```

### beats（建議值，可依文案長度調整）

| beat | 影格 | progress | 理由 |
|---|---|---|---|
| title | 1–40 | 0.000–0.130 | 鏡頭還在俯看水面，畫面是均勻的青綠水色；石峰約第 45 格才出現 |
| cue（捲動提示） | 1–40 | 0.000–0.130 | 鏡頭往下看，放在下方中央 |
| intro | 70–170 | 0.231–0.565 | 巡航段，地平線固定在畫面高度約 52%；文字放下方 35% 的水面倒影區。石峰幾乎頂到畫面上緣，天空不適合放字 |
| note | 180–255 | 0.599–0.849 | 放左側 35%（偏淡的霧中石峰）或下方 30% 水面；瀑布在 x ≈ 0.45–0.6，右側石峰最暗 |
| 不放文字 | 256–300 | 0.853–1.000 | 瀑布佔滿畫面，留給轉場 |

換算公式：`progress = (frame - 1) / 299`，`frame = 1 + round(progress * 299)`。

## 4. 實際量測的時間點

| 事件 | 影格 | 量測方式 |
|---|---|---|
| 錦鯉在畫面內 | 1–23 | 魚的位置投影到攝影機畫面內 |
| 鏡頭抬起 | 24–60 | pitch 從 −23° 到 +0.75°，第 50 格超過 −5° |
| 瀑布第一次進入畫面 | 桌機第 33 格、手機第 60 格 | 瀑布頂端進入畫面範圍；初期很淡 |
| 巡航 | 60–255 | pitch 固定 +2°，速度約 19–25 m/s |
| 接近瀑布並仰角 | 255–300 | 減速、pitch 升到 +12° |
| 結束姿勢 | 300 | 位置 (−0.342, 168, 9.2)，旋轉 (1.78024, 0, 0.24963) rad |

## 5. 正反向捲動注意事項

- **每一格都可以單獨重算**：攝影機每格都有線性關鍵影格；水波、霧、瀑布用影格編號驅動；魚、船、鳥每格都有關鍵影格。沒有物理模擬，也沒有隨機粒子，所以第 N 格永遠是同一張畫面，倒著播放也一樣。
- **桌機（WebP 序列＋canvas）**：每格精準，不需要解碼器跳轉。300 張的總大小見交付清單；建議沿用目前「先載粗格、再補細格」的載入方式。
- **手機（MP4 g8）**：跳到任一格時，最多要從前面 7 格開始解碼，延遲應該和你們在 placeholder 測到的 g8 相近。真實素材的細節比 placeholder 多，請用真實檔案重測一次。
- **捲動方向**：鏡頭是一路往前飛，不是來回運動，所以反向捲動就是倒退飛行，沒有循環接縫要處理。

## 6. 裁切建議

- **桌機 16:9**：主體在水平中央，瀑布在第 200 格之後落在 x ≈ 0.45–0.5。比 16:9 更寬的螢幕可以上下裁切，焦點設 `[0.5, 0.45]`；比較窄（4:3）的螢幕可以左右裁切，兩側石峰被裁掉沒關係。
- **手機 9:16**：用的是獨立直式攝影機算出來的，不是把橫式拉伸或裁切。上方多了天空，下方多了水面倒影。焦點建議 `[0.5, 0.45]`；比 9:16 更長的螢幕可以上下各裁約 5%。
- 不要用手機 MP4 去填桌機版面，解析度不夠。

## 7. 影片格式與編碼

- **桌機**：WebP 是 Blender 直接輸出的，品質 82，色彩為 sRGB（Standard view transform）。
- **手機**：Blender 先輸出 300 張無損 PNG（`out/frames-mobile-png/`，277 MB，不放上網站），再用 ffmpeg 編碼：

  ```
  ffmpeg -framerate 30 -i out/frames-mobile-png/%04d.png -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p \
         -g 8 -keyint_min 8 -sc_threshold 0 -bf 0 -profile:v high -movflags +faststart -an mobile-g8.mp4
  ```

  - `-sc_threshold 0`：關掉偵測到畫面劇變時自動插入的關鍵影格。
  - 已用 ffprobe 驗證：300 格、10.000 秒、`has_b_frames=0`、關鍵影格最大間隔 8、moov 在檔頭、沒有音軌。
- **為什麼不用 Blender 內建的影片輸出**：它會在畫面劇變時自動插入關鍵影格，間隔變成不規則的 8／6／4，而且 moov 放在檔尾、不支援 faststart。那支檔案保留為 `out/mobile-g8_blender.mp4`，僅供比對。
- **重新編碼**：網站要調整 CRF 或關鍵影格間隔，直接用上面的指令重新編碼即可，不需要重新渲染。

## 8. 已知問題與限制

- **畫面品質**：這是第一版原型。山體表面偏「蠟質」，皴法塊面不明顯；松樹是簡化的模型，近看像剪紙；錦鯉是簡單的幾何體。
- **沒有投影陰影**：EEVEE 的陰影在這個場景會讓每格要算 30–60 秒，還曾讓顯示卡當掉，所以關閉了。山體明暗由材質自己計算。
- **沒有墨線**：Blender 的描邊功能（Freestyle）每格多 30–60 秒、線條又幾乎看不見，所以沒用；輪廓靠材質的邊緣加深。
- **瀑布太早出現**：第 33 格就進入畫面（很淡），沒有被河灣擋住、轉彎才出現的效果。
- **沒有日夜版本**：只有白天。網站的 `data-scene-time` 是色彩疊層，不是重新打光。
- **音效**：無。
- **只在一台機器上算過**：RTX 5060 Laptop、Windows 11、Blender 5.3.0。

## 9. 重新渲染

1. 用 Blender 5.3 開啟 `scene.blend` 修改；或修改 `build_scene.py` 後在 Blender 執行它來重建整個場景（攝影機路徑也會重新產生）。
2. 關掉 Blender 視窗裡「Rendered」模式的預覽，避免和背景渲染搶顯示卡。
3. 雙擊 `render_all.bat`，產出：
   - `out/frames-desktop/####.webp`
   - `out/frames-mobile-png/####.png`
   - `out/mobile-g8.mp4`
   - 每格耗時紀錄 `out/log_*.json`
4. `render_all.bat` 產出的手機 MP4 是 Blender 內建編碼（關鍵影格不規則）。請用第 7 節的 ffmpeg 指令從 `out/frames-mobile-png/` 重新編碼成正式的 `mobile-g8.mp4`；Windows 需要另外安裝 ffmpeg。
5. 把輸出複製到 `site/dist/assets/scenes/wiki-01/`。海報是 `frames-desktop/0001.webp`（第 300 格當結尾海報），手機海報從 `frames-mobile-png/0001.png` 轉成 WebP。
6. 如果改了攝影機，`camera_path.json` 由 `build_scene.py` 產生；`camera_analysis.json` 和第 4 節的時間點需要重新量測。
