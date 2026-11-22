# Wiki 三幕背景素材交接（wiki-01 / wiki-02 / wiki-03，v2-2026-11-19）

給茶咖網 Claude Code。三個資料夾的 HANDOFF.md 內容相同，各場景的數字在各自的 `scene-metadata.json`。

## 一句話

一段連續的鏡頭，切成三個場景，每個場景 300 格（30 fps，10 秒）：

| 場景 | Blender 影格 | 畫面 |
| --- | --- | --- |
| `wiki-01` 山谷飛行 | 1–300 | 湖面起飛，沿 S 形河道穿過山谷，停在瀑布前 |
| `wiki-02` 雲上石塔 | 301–600 | 沿瀑布旁爬升、越過崖頂、雲海與石塔、看見吊橋與洞口 |
| `wiki-03` 吊橋入洞 | 601–900 | 走上吊橋、穿過洞口、窄道打開成燈火石窟、面向繼續延伸的彎道 |

**銜接**：每個場景的最後一格與下一場景的第 1 格是同一個攝影機位置、角度和焦距（camera_path.json 數值相同）。實測影像差異：01→02 平均 0.9/255、02→03 平均 0.7/255（分開渲染加 WebP 壓縮造成，肉眼看不出）。

## 檔案位置

公開素材（`dist/assets/scenes/<id>/`）：

```
frames-desktop/0001.webp … 0300.webp   1600×900，WebP q82，FlightCam
mobile-g8.mp4                          720×1280，H.264 High，yuv420p，每 8 格一個關鍵影格，無 B 幀，無音訊，+faststart
poster-desktop.webp / poster-desktop-end.webp   第 1 格 / 第 300 格
poster-mobile.webp  / poster-mobile-end.webp
masks-desktop/0001.webp …   （wiki-01、wiki-02）800×450 無損 WebP
masks-mobile/0001.webp …    （wiki-01、wiki-02）360×640 無損 WebP
```

交接文件（`docs/scenes/<id>/`，不部署）：`scene-metadata.json`、`camera_path.json`、`camera_analysis.json`、`masks_coverage.json`（有遮罩的場景）、`HANDOFF.md`。

## 這一版和 v1 的差別（wiki-01 需要網站端更新的地方）

1. **沒有錦鯉**：v1 的第 1–23 格烘焙了錦鯉，這版完全沒有（小船、飛鳥也拿掉）。`wiki-01.json` 裡的 `patches`（指向 `frames-desktop-nokoi`）與 `mobile-g8-nokoi.mp4`、`poster-*-nokoi.webp` 已經不需要，請改回指向 `frames-desktop/`、`mobile-g8.mp4`、`poster-desktop.webp`、`poster-mobile.webp`。舊的 nokoi 檔案我沒有刪（沒有刪除權限，也留給你決定）。v1 全部素材備份在 Cowork 專案 `wiki-01\archive_v1_site\`。
2. **瀑布、湖面、霧的紋理改成靜止**（你在 scroll-scenes.md 第七節第 2 點提到的問題）：材質不再由 `frame` 驅動，往上捲時烘焙的水紋不會倒流。流動感請完全由即時層提供。
3. **水面／瀑布遮罩**（第七節第 3、4 點）：`masks-*` 每格一張，R = 這一格裡看得到的湖面與河面，G = 看得到的瀑布幕面。前方的岩石、樹、橋會擋掉（黑色）；霧與雲不算遮擋。座標與影格相同（遮罩是影格的一半大小，同一個攝影機、同樣的裁切前畫面）。wiki-02 的遮罩只有前段有內容（瀑布約到第 25 格〔手機到第 44 格〕）（瀑布與水面在鏡頭爬升後離開畫面），每格的覆蓋比例在 `masks_coverage.json`：`[檔案編號, 水面比例, 瀑布比例]`。
4. 第一幕山腳的樹重新分布過（較少、成群、有留白），山形、河道、瀑布位置、攝影機路徑都沒變；`wiki-01.camera.json` 可沿用，但建議用新的 `camera_path.json` 重新產生一次（數值應一致）。

## 攝影機

- 兩台攝影機共用同一條動畫：`FlightCam`（桌機，28 mm，36 mm 水平感光元件）與 `FlightCamPortrait`（手機，28 mm，36 mm **垂直**感光元件）。手機版是獨立渲染的直式畫面，不是裁切或拉伸。
- `camera_path.json`：每格 `frame`（場景內 1–300）、`blender_frame`、`location`（公尺，Z 向上）、`rotation_euler`（XYZ，弧度）。
- `camera_analysis.json`：每格的 pitch／yaw，以及下列世界座標點在桌機與手機畫面上的位置（0–1，左上為原點，CSS cover 裁切之前）、是否在畫面內、是否被岩石擋住：`waterfall_top`、`waterfall_base`、`bridge_start`、`bridge_mid`、`bridge_end`、`cave_mouth`；wiki-03 另有每格看得到的燈籠清單 `lanterns_visible: [燈籠編號, x, y]`，燈籠世界座標在 `lanterns_world`。可直接用來把燈火閃爍、塵埃、文字錨點貼到正確位置。
- `scene-metadata.json` 的 `events` 是由上面的資料算出的實際影格範圍（例如吊橋、洞口第一次出現），`slow_windows` 是鏡頭速度低於該場景中位數 45% 的影格範圍，最適合放文字。

## 各場景重點

**wiki-01**：與 v1 相同的鏡頭。開頭 40° 俯視湖面（現在是空的水面，等即時層的魚群），之後抬頭巡航，最後在瀑布前約 80 m 處抬頭 12° 停下。

**wiki-02**：
- 第 1 格 = wiki-01 第 300 格。沿瀑布右側爬升，鏡頭一路往上看瀑布。
- 爬過崖頂後鏡頭轉平，看到雲海（從 Blender 第 300 格後才淡入，不影響 wiki-01）。這段上方有大片留白是刻意的，適合放標題。
- 之後繞向左側，石塔一座座出現，最後停在吊橋側面，橋的盡頭就是洞口。吊橋周圍的雲刻意清空，讓吊橋成為焦點。

**wiki-03**：
- 第 1 格 = wiki-02 第 300 格。鏡頭轉上吊橋，沿橋面走向洞口。鏡頭在橋中段、洞口和石窟中央各有輕微減速，但都沒有低於本場景中位速度的 45%，所以 `slow_windows` 只列出頭尾；放文字可參考 `camera_analysis.json` 的畫面位置。
- 穿過橋頭木門與洞口後，先是窄道，接著打開成高約 20 m 的石窟：鐘乳石、踏腳石小徑、四個石龕（其中兩個放石碑）、一對石燈籠、壁上的紙燈籠。
- 最後一格停在石窟出口，面向一條有燈籠引路、往右轉彎的通道。**這不是 Wiki 的結束畫面**，之後的「藏書石窟」場景會從這個彎道接續；完整條目索引、搜尋等內容請用 HTML 疊在這段。
- 鏡頭進入洞口的 Blender 影格記錄在 `scene-metadata.json → events.camera_enters_cave`。從這一格前後，洞內的霧從「紙色遠景霧」切換成「深墨色洞內霧」（材質由影格驅動，與鏡頭位置綁定，正反向捲動一致）。
- 洞內沒有任何烘焙的動態：燈籠是靜態的發光燈具，閃爍、微塵、燈光呼吸請交給即時層。

## 分工（不變）

- **Blender**：山水、山體、石塔、吊橋、石窟、燈具與基礎光照、攝影機、預渲染素材。
- **網站**：魚群、瀑布流動、水霧與湖面微動、燈火閃爍、水墨游標流體、標題與內文、Wiki 搜尋／分類／索引、Scroll-driven 動畫、效能。

## 重算

Cowork 專案資料夾 `C:\Users\08880\Desktop\claude\teacafe-3d\wiki-01\`：

- `build_scene.py`：第一幕世界（`build_wiki_ext.py` 會先執行它）。
- `build_wiki_ext.py`：第二、三幕的雲海、石塔、吊橋、石窟與完整 900 格攝影機，存成 `wiki_full.blend`。以背景執行：`blender -b --factory-startup -P build_wiki_ext.py`（約 25 秒）。
- `deliver_wiki.py`：`desktop|mobile <id>`、`masks <id> desktop|mobile`、`analyze`。
- `postprocess_wiki.py`：驗證影格、編碼 MP4、海報、遮罩轉 WebP、寫 metadata，並複製到網站資料夾。
- `render_wiki.bat`：依序跑完以上渲染。

## 已知限制

- wiki-02 第 90 格附近（Blender 第 390 格）鏡頭爬過崖頂時，第一幕懸崖的深藍色頂部會出現約一秒。
- wiki-03 第 150 格穿過橋頭木門時，畫面底部可看到洞口前石平台的青綠色表面。
- 雲海是半透明卡片，遮罩與 `occluded` 判斷都忽略雲與霧。
- 手機版沒有在實機上測試過播放效能；檔案規格與 v1 相同。
