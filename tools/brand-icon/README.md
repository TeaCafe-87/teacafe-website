# 網站圖示（F 版：主峰＋四字印＋暖燈小屋）

主峰與遠山取自 journey 背景的圖層（`tools/journey-video-v2` 產生的 `work/layers/*.png`，裁切範圍 x4 座標 2960,420–4320,1780，存成 `L_<layer>.png`）。
印章與字體使用 Ma Shan Zheng（SIL OFL，取自 npm `@fontsource/ma-shan-zheng`，以 fontTools 轉成單字 TTF）。

- `gen.py`：共用工具（紙色、印章、霧、圓角）
- `gen2.py` / `gen3.py`：構圖（`concept_f` 為採用版）
- `export.py`：輸出 `dist/image/brand/` 的整套尺寸
- `teacafe-icon-master.png`：1024px 原圖

腳本內的路徑是當時工作目錄的絕對路徑，重新產生前要先改成自己的路徑。
