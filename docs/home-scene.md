# 首頁水面背景

使用原本 dist/image/index.png Minecraft 場景，三組向外傳播的週期波形讓整張畫面如水面般晃動。這是程序式影像變形影片，沒有壓暗原圖。

桌機 1920×1080、手機 720×1280，8 秒、30 FPS，約 12 MiB / 7.2 MiB。H.264、無音軌、faststart，每 8 幀關鍵幀。週期波形接回第一幀；反射邊緣取樣避免黑邊。

已移除金線、茶杯、MORE 漣漪、書卷、落花幕、TEACAFE 遮罩與舊鏡頭動畫。

背景固定全屏，首頁區塊與頁尾透明，卡片使用局部淺色玻璃質感。整頁捲動對應影片一個週期，上滑倒放、停下即停止。內容停留後淡出與滑入，手機長內容可完整捲動。不攔截 wheel 或 touch。

方向變更時切換影片來源並同步進度。單次 seek 完成後才處理新的定位。Save-Data 和 prefers-reduced-motion 停用影片下載；載入或錯誤時回退原圖。

重建：安裝 pillow numpy opencv-python-headless imageio-ffmpeg，執行 python tools/render-home-scene.py。
預覽：node tools/preview-home.mjs，瀏覽 http://127.0.0.1:4173 。API 仍需 Cloudflare 環境。
測試：node tests/home-scene.mjs。涵蓋反向定位、未完成 seek、閒置停止、直式來源、減少動態與失敗回退。實體 iOS／Android 解碼效能仍需上線確認。
