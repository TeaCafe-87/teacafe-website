# Cloudflare 後端接線說明

網站維持 Cloudflare Pages 的 `dist/` 靜態輸出與 `functions/` API。社群貼文、留言、讚、分享紀錄及後續可編輯內容放 D1；圖片與影片放 R2。D1 不儲存媒體二進位資料。

## 綁定與遷移

1. 在 Cloudflare Pages 專案設定中，將 D1 綁定變數命名為 `DB`。
2. 將 R2 bucket 綁定變數命名為 `GALLERY_MEDIA`。這個名稱沿用原有相冊設定，但同時儲存論壇媒體。
3. 依序執行 `migrations/0001_community.sql`、`0002_content.sql`、`0003_discussion_seed.sql`，分別套用到正式與預覽環境的 D1。若使用 Wrangler，可執行 `wrangler d1 execute <資料庫名稱> --remote --file=migrations/0001_community.sql`，再依序執行後兩個檔案。
4. 在 Pages 設定中提供 `DISCORD_CLIENT_ID`、`DISCORD_CLIENT_SECRET`、`DISCORD_REDIRECT_URI`、`SESSION_SECRET`，並於 Discord Developer Portal 登記回呼網址。
5. 重新部署 Pages。先開啟 `/api/community/posts?kind=forum`，確認回傳 `configured: true`；再以 Discord 登入測試發文。

設定綁定後，**公開貼文會立即顯示**。若要管理員審核，需在正式開放前加入審核流程及管理端；目前沒有管理員審核介面。建議另行規劃刪文、檢舉與備份流程。

## 資料契約

| 資料 | API | D1 表／來源 | 用途 |
| --- | --- | --- | --- |
| 伺服器線上狀態、玩家數、版本 | `GET /api/server/status` | 外部狀態服務，短暫快取 | 首頁即時資訊 |
| Discord 身分 | `GET /api/auth/me` 與 OAuth 路由 | HMAC 簽章 cookie | 發文、留言、按讚 |
| 相冊／論壇貼文 | `GET/POST /api/community/posts` | `community_posts`、`community_media` | `kind=gallery` 或 `kind=forum`；每頁 20 篇，`next_cursor` 分頁 |
| 媒體 | `GET /api/community/media/:id` | D1 索引、R2 物件 | 圖片、影片串流與 Range 請求 |
| 留言 | `GET/POST /api/community/comments` | `community_comments` | 每篇貼文留言 |
| 讚 | `POST /api/community/likes` | `community_likes` | 使用者每篇最多一個讚 |
| 分享 | `POST /api/community/shares` | `community_shares` | 記錄成功分享或複製連結 |
| 公告 | `GET /api/news` | `news_items` | 網站公告；未連接 D1 時讀 `dist/data/news.json` |
| Wiki 補充條目 | `GET /api/wiki/entries` | `wiki_entries` | Wiki 顯示已發布的補充條目 |
| 通行證摘要 | `GET /api/pass/summary` | `pass_seasons` | 顯示當季名稱、等級、經驗需求 |
| Minecraft 帳號關聯 | 尚無公開 API | `player_links` | 預留 Discord 與 Minecraft UUID 關聯；不能只憑網頁登入建立驗證關係 |

貼文 `POST` 使用 `multipart/form-data`：`kind`、`category`、`title`、`body` 與重複的 `media` 欄位。媒體類型限 JPG、PNG、WebP、GIF、MP4、WebM；**件數不限，合計最多 20 MiB**，前後端均驗證。相冊至少需一個媒體檔。由於 Pages Function 會解析 multipart，請勿將上限調高到接近 Worker 的記憶體上限；較大影片應改用 R2 直傳流程。

論壇的靜態提案位於 `dist/data/forum.json`，只在 D1 尚未連接時顯示；`0003_discussion_seed.sql` 會將同一批提案建立為正式論壇貼文。相冊未連接時顯示一篇標明版型預覽的示範貼文。舊版 `gallery_posts`／`gallery_comments` 若已有正式資料，須另行做資料遷移後再切換新 API。

## 公開內容與安全

上傳的伺服器封存檔只作 Wiki 依據，不會放入網站或 Git 儲存庫。該封存檔包含日誌、使用者資料、資料庫及可能的連線資訊。`wiki_entries` 與 `news_items` 只應放可公開文字；API 僅傳回 `status='published'`。玩家提供的文字以純文字節點呈現，避免 HTML 注入；媒體拒絕 SVG、HTML 等格式。上線前應將 Discord、R2、D1 綁定及正式網域分別在正式與預覽環境核對。
