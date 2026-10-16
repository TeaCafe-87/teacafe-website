# Cloudflare 後端接線說明

網站維持 Cloudflare Pages 的 `dist/` 靜態輸出與 `functions/` API。社群貼文、留言、讚、分享紀錄及後續可編輯內容放 D1；圖片與影片放 R2。D1 不儲存媒體二進位資料。

## 綁定與遷移

1. 在 Cloudflare Pages 專案設定中，將 D1 綁定變數命名為 `DB`。
2. 將 R2 bucket 綁定變數命名為 `GALLERY_MEDIA`。這個名稱沿用原有相冊設定，但同時儲存論壇媒體。
3. 已有資料庫（包含先前的示範討論文）：在 Cloudflare D1 Studio 的 Query 頁面執行 `migrations/0004_admin.sql`。它只隱藏八篇官方示範討論文，保留玩家貼文，並建立 `site_members`。新資料庫依序執行 `0001_community.sql`、`0002_content.sql`、`0004_admin.sql`；不必執行舊的 `0003_discussion_seed.sql`。
4. 在 Pages 設定中提供 `DISCORD_CLIENT_ID`、`DISCORD_CLIENT_SECRET`、`DISCORD_REDIRECT_URI`、`SESSION_SECRET`，並於 Discord Developer Portal 登記回呼網址。
5. 重新部署 Pages。先開啟 `/api/community/posts?kind=forum`，確認回傳 `configured: true`；再以 Discord 登入測試投稿，管理員到 `/admin` 審核。

玩家新貼文進入 `pending`，只有管理員核准後才會公開。兩位首批管理員的 Discord ID 已加入伺服器端白名單；日後可用 Pages 環境變數 `OFFICIAL_DISCORD_IDS`（多個 ID 以逗號分隔）增加管理員。官方貼文在 `/admin` 發布，分類為「官方公告」，直接公開。請將管理頁視為私人後台，勿分享成員資料截圖。

## 資料契約

| 資料 | API | D1 表／來源 | 用途 |
| --- | --- | --- | --- |
| 伺服器線上狀態、玩家數、版本 | `GET /api/server/status` | 外部狀態服務，短暫快取 | 首頁即時資訊 |
| Discord 身分 | `GET /api/auth/me` 與 OAuth 路由 | HMAC 簽章 cookie | 發文、留言、按讚 |
| 網站成員 | `GET /api/admin/members`、`GET /api/admin/posts` | `site_members`、`player_links`、`community_posts` | 管理員查看 Discord 身分、登入時間、Minecraft 名稱與文章 |
| 相冊／論壇貼文 | `GET/POST /api/community/posts` | `community_posts`、`community_media` | `kind=gallery` 或 `kind=forum`；每頁 20 篇，`next_cursor` 分頁 |
| 審核 | `GET/POST /api/community/moderation` | `community_posts.status` | 管理員查看待審投稿、核准或退回 |
| 媒體 | `GET /api/community/media/:id` | D1 索引、R2 物件 | 圖片、影片串流與 Range 請求 |
| 留言 | `GET/POST /api/community/comments` | `community_comments` | 每篇貼文留言 |
| 讚 | `POST /api/community/likes` | `community_likes` | 使用者每篇最多一個讚 |
| 分享 | `POST /api/community/shares` | `community_shares` | 記錄成功分享或複製連結 |
| 公告 | `GET /api/news` | `news_items` | 網站公告；未連接 D1 時讀 `dist/data/news.json` |
| Wiki 補充條目 | `GET /api/wiki/entries` | `wiki_entries` | Wiki 顯示已發布的補充條目 |
| 通行證摘要 | `GET /api/pass/summary` | `pass_seasons` | 顯示當季名稱、等級、經驗需求 |
| Minecraft 帳號關聯 | 尚無公開 API | `player_links` | 預留 Discord 與 Minecraft UUID 關聯；不能只憑網頁登入建立驗證關係 |

貼文 `POST` 使用 `multipart/form-data`：`kind`、`category`、`title`、`body` 與重複的 `media` 欄位。媒體類型限 JPG、PNG、WebP、GIF、MP4、WebM；**件數不限，合計最多 20 MiB**，前後端均驗證。相冊至少需一個媒體檔。由於 Pages Function 會解析 multipart，請勿將上限調高到接近 Worker 的記憶體上限；較大影片應改用 R2 直傳流程。

論壇與相冊不再顯示示範貼文。新投稿待審期間，只有投稿者與管理員能讀取其媒體；公開 Feed、按讚、留言與分享只針對已核准貼文。`site_members` 從這次部署後的 Discord 登入開始記錄；舊貼文作者可由遷移補入，但更早只瀏覽網站、沒有發文的訪客無法回溯。舊版 `gallery_posts`／`gallery_comments` 若已有正式資料，須另行做資料遷移後再切換新 API。

## 公開內容與安全

上傳的伺服器封存檔只作 Wiki 依據，不會放入網站或 Git 儲存庫。該封存檔包含日誌、使用者資料、資料庫及可能的連線資訊。`wiki_entries` 與 `news_items` 只應放可公開文字；API 僅傳回 `status='published'`。玩家提供的文字以純文字節點呈現，避免 HTML 注入；媒體拒絕 SVG、HTML 等格式。上線前應將 Discord、R2、D1 綁定及正式網域分別在正式與預覽環境核對。
