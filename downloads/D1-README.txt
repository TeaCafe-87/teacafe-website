TeaCafe D1 資料庫檔案（2026-10-18）

全新 teacafe-db：請到 Cloudflare D1 Studio 的 Query，依序執行：
1. migrations/0001_community.sql
2. migrations/0002_content.sql
3. migrations/0004_admin.sql
4. migrations/0005_supporters.sql

如果資料庫已經有 community_posts、community_media 等資料表，只要補執行尚未套用的檔案。不要重建資料庫，也不要手動刪除舊資料。

0003_discussion_seed.sql 已移除：那是舊版的八篇示範論壇貼文。0004_admin.sql 會把舊示範貼文隱藏，所以編號跳過 0003 是正常的。

在 Pages 的 Settings > Bindings，D1 變數名稱必須是 DB；R2 bucket 變數名稱必須是 GALLERY_MEDIA。這份壓縮包只有 D1 SQL，不含 R2 物件或登入密鑰。
