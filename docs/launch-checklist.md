# 上線檢查清單

依序進行，做完打勾。部署在 Vercel，資料庫為 AWS RDS Postgres，照片放 Cloudflare R2。

> RDS CA bundle `certs/rds-global-bundle.pem` 已 commit（`.gitignore` 有例外），`next.config.ts` 的 `outputFileTracingIncludes` 會把它打包進 Vercel Function。
> 程式在 `DATABASE_SSL=true` 時用它驗證 RDS 憑證（`src/lib/db.ts`）；部署後用下方 smoke test 確認 DB 頁面正常。

## 1. RDS

- [ ] 建立 RDS Postgres，記下端點、資料庫名稱、master 帳號（master 只用來跑 `docs/rds-setup.sql`，不放進 app）
- [ ] 參數群組設定 `rds.force_ssl = 1`，並套用到執行個體（必要時重開機）
- [ ] 開啟自動備份（保留 7 天）與刪除保護
- [ ] Security Group：Vercel 沒有固定 IP，5432 對 `0.0.0.0/0` 開放，靠強制 SSL＋強密碼防護。若要鎖 IP，需改用 Vercel Static IPs（Pro 方案）或之後加 RDS Proxy
- [ ] 本機下載 RDS CA bundle 到 `certs/rds-global-bundle.pem`（已存在則略過）
- [x] 在自己的終端機執行 `RDS_HOST=<端點> scripts/rds-bootstrap.sh`：建立 `street12` 資料庫、跑 [rds-setup.sql](rds-setup.sql)、產生兩個角色的亂數密碼，連線字串寫到 `.env.rds.local`（不 commit、不會印出密碼）。只需要輸入 master 密碼
- [ ] Vercel 函式區域：`vercel.json` 已設 `regions: ["sin1"]`（新加坡，和 RDS 同區）
- [ ] 確認腳本最後的檢查輸出：兩個角色 `can_login = t`；`photo_app` 對 public `USAGE = t`、`CREATE = f`，對 drizzle 兩者皆 `f`

## 2. 執行 Migration 與 Seed（從本機對 RDS 執行）

Vercel 的 build 指令只有 `next build`，**不會**跑 migration，所以每次有新的 migration 都要從本機手動執行。

- [ ] 暫時在本機 shell（或一份不 commit 的 env 檔）設定下列變數，不要把正式連線字串寫進 `.env.local` 以外的地方：

  ```bash
  export MIGRATION_DATABASE_URL='postgres://photo_migrator:<密碼>@<RDS 端點>:5432/<資料庫名稱>'
  export DATABASE_SSL=true
  ```

  注意：`drizzle.config.ts` 與 `src/db/seed.ts` 會讀 `.env.local`，但 dotenv 不會覆蓋已存在的環境變數。如果 `.env.local` 裡有本機的 `DATABASE_URL`，請確認上面的 `MIGRATION_DATABASE_URL` 有生效（它的優先權高於 `DATABASE_URL`），執行前先確認沒有指到本機資料庫。
- [x] `pnpm db:migrate`（2026-10-11 已對 RDS 執行）。指令：`(set -a; source .env.rds.local; set +a; pnpm db:migrate)`，`.env.rds.local` 的設定會優先於 `.env.local`
- [x] `pnpm db:seed`（2026-10-11 已執行，同上方式載入 `.env.rds.local`）：寫入尺寸、價格、證件照商品、會員標籤（價格以 [owner-pricing.md](owner-pricing.md) 為準）
- [ ] 回到 psql 確認 `photo_app` 對新建的資料表有權限（`rds-setup.sql` 結尾有查詢範例）
- [ ] 管理員：待步驟 5 之後有人用 LINE 登入過一次，再把 LINE user ID 設到 `ADMIN_LINE_IDS` 並重跑 `pnpm db:seed`（做法見 [README](../README.md#成為管理員)）

## 3. Cloudflare R2 正式 bucket

- [ ] 建立正式 bucket（例如 `street12-photos`）與只有物件讀寫權限的 API token
- [x] 依 [r2-setup.md](r2-setup.md) 設定 CORS 與 lifecycle（`street12-photos`：`AllowedOrigins` 為 `https://12-street.com`、`https://12-street.vercel.app`，**不放** localhost）
- [ ] 依 [r2-setup.md](r2-setup.md) 設定 Lifecycle 備援規則（`photos/` 35 天、`transfer-proofs/` 60 天）

## 4. Vercel 專案與環境變數

- [ ] 匯入 Git repo 建立 Vercel 專案；套件管理使用 pnpm（由 `packageManager` 決定）
- [ ] 設定環境變數（名稱來自 `.env.example`，**值不要寫進文件或 commit**）。Production 一定要設；「Preview」欄表示預覽部署是否需要（預覽部署若要連資料庫，建議另建一份資料庫，不要共用正式資料）

| 變數 | Production | Preview | 用途 |
|---|---|---|---|
| `DATABASE_URL` | 必要 | 視需要 | app 執行時連資料庫，正式用 `photo_app` 角色 |
| `DATABASE_SSL` | 必要，設 `true` | 連 RDS 時設 `true` | 啟用 TLS 並用 `certs/rds-global-bundle.pem` 驗證 RDS 憑證 |
| `MIGRATION_DATABASE_URL` | 不需要 | 不需要 | 只在本機跑 migration／seed 時用（`photo_migrator`），**不要放進 Vercel** |
| `BETTER_AUTH_SECRET` | 必要 | 視需要 | Better Auth 簽章密鑰（`openssl rand -base64 32`） |
| `BETTER_AUTH_URL` | 必要，設正式網址 | 視需要 | Better Auth 的網站網址（見下方注意事項） |
| `LINE_CLIENT_ID` | 必要 | 視需要 | LINE Login channel ID |
| `LINE_CLIENT_SECRET` | 必要 | 視需要 | LINE Login channel secret |
| `ADMIN_LINE_IDS` | 不需要 | 不需要 | 只有 `pnpm db:seed` 會讀，在本機執行時設定即可 |
| `R2_ACCOUNT_ID` | 必要 | 視需要 | Cloudflare 帳號 ID，組 R2 endpoint |
| `R2_ACCESS_KEY_ID` | 必要 | 視需要 | R2 API token 的 access key |
| `R2_SECRET_ACCESS_KEY` | 必要 | 視需要 | R2 API token 的 secret |
| `R2_BUCKET` | 必要，設正式 bucket | 視需要（可用 dev bucket） | 照片與轉帳截圖存放的 bucket |
| `NEXT_PUBLIC_LINE_PAY_ID` | 選填 | 選填 | 結帳頁顯示的 LINE Pay ID（有設 URL 時可不填） |
| `NEXT_PUBLIC_LINE_PAY_URL` | 必要 | 選填 | 結帳頁顯示的 LINE Pay MONEY 好友連結 |
| `NEXT_PUBLIC_BANK_ACCOUNT` | 必要 | 選填 | 結帳頁顯示的銀行轉帳資訊（換行用 `\n`，值見 [owner-pricing.md](owner-pricing.md)） |
| `CRON_SECRET` | 必要 | 不需要 | `/api/cron/cleanup` 的驗證密鑰（16 字以上）；沒設的話 cron 一律回 401 |

- [x] `BETTER_AUTH_URL` 設成**實際對外網址**（`https://12-street.com`），結尾不加斜線。它會決定 LINE OAuth 的 redirect URI，與 LINE 後台不一致就會登入失敗
- [ ] `NEXT_PUBLIC_*` 在 **build 時**寫進前端，修改後必須重新部署才會生效
- [ ] `DATABASE_URL` 確認用的是 `photo_app`、`MIGRATION_DATABASE_URL` 沒有出現在 Vercel

## 5. LINE Login

- [ ] LINE Developers 的 LINE Login channel，Callback URL 加上（Better Auth 的 LINE 回呼路徑是 `/api/auth/callback/line`，即 `BETTER_AUTH_URL` ＋ `/api/auth/callback/line`）：
  - `https://12-street.com/api/auth/callback/line`
  - `https://12-street.vercel.app/api/auth/callback/line`
  - 本機開發另有 `http://localhost:3000/api/auth/callback/line`
- [ ] Channel 狀態改為 Published（未發布時只有 channel 管理者／測試者能登入）
- [ ] 目前只要求 `openid`、`profile` scope（`src/lib/auth.ts`），不需要向 LINE 申請 email 權限

## 6. 部署與網域

- [ ] Vercel Project Settings → Deployment Protection：Production 關閉（客人要能直接開網站；開著會被 Vercel 登入頁擋住，LINE 登入也會失敗）
- [ ] 確認 Vercel Firewall 已有規則 `order-lookup-rate-limit`：`POST /orders/lookup`，每個 IP 60 秒 10 次（已建立，上線前確認仍在）
- [ ] 部署 production（push 到 main 或手動 deploy）；`vercel.json` 內的 cron（`0 19 * * *`，台灣時間 03:00）會一起註冊
- [x] 綁定正式網域 `12-street.com`（AWS Route 53 註冊；DNS 留在 Route 53：apex A `216.198.79.1`、`64.29.17.1`，`www` CNAME 指向 Vercel，`www` 308 轉到 apex）
- [x] 網域生效後：`BETTER_AUTH_URL` 改成正式網址並重新部署；R2 CORS 的 `AllowedOrigins` 加入 `https://12-street.com`；LINE Callback URL 已加

## 7. 上線後 Smoke Test

用手機和電腦各測一次。

- [ ] 首頁、登入頁可正常開啟（若 DB 連線有問題，這裡通常最先壞，先查 Vercel Logs 與 CA bundle）
- [ ] 訪客下單：選尺寸 → 上傳 JPG（確認直接傳到 R2、沒有經過 Vercel）→ 填資料 → 送出，取得訂單編號
- [ ] 訪客以「訂單編號＋手機」查詢到該筆訂單；故意輸入錯誤手機，確認查不到
- [ ] 會員：用 LINE 登入 → 下單 → 「我的訂單」看得到
- [ ] 管理員（`ADMIN_LINE_IDS` 設好並重跑 seed 後）：進入 `/admin`；非管理員帳號進 `/admin` 會被擋
- [ ] 後台訂單列表依付款狀態篩選 → 標記已付款 → 變更訂單狀態
- [ ] 後台下載訂單 ZIP，檔案可正常解壓、照片完整
- [ ] 手動呼叫 cron（沒設或帶錯密鑰應回 401）：

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://12-street.com/api/cron/cleanup
  ```

  回傳 JSON 應有 `photos`、`transferProofs`、`drafts`、`lookupFailures`；Vercel Logs 搜尋 `cleanup` 應看到相同內容
- [ ] 隔天確認 Vercel Cron 有自動執行（Logs 出現 `cleanup`）
- [ ] 確認 Vercel Logs 沒有 DB 權限錯誤（`permission denied`）；如果有，代表 `photo_app` 少了授權，回頭檢查 [rds-setup.sql](rds-setup.sql) 的預設權限

## 8. 訂單通知信（Resend）

- [ ] 在瀏覽器同意 Resend 的 Marketplace 條款後，執行 `vercel integration add resend --no-claim --no-env-pull`（會把 `RESEND_API_KEY` 加到 Vercel 專案）
- [ ] 在 Resend 後台新增網域 `12-street.com`，把它給的 DNS 記錄（DKIM、SPF）加到 Route 53，等驗證通過
- [ ] 在 Vercel 設定 `EMAIL_FROM`（例如 `十二街影像生活館 <noreply@12-street.com>`）和 `EMAIL_REPLY_TO`（店家實際收信的信箱；網域本身沒有收信信箱）
- [ ] `RESEND_API_KEY` 或 `EMAIL_FROM` 沒設時不會寄信，也不會報錯
- 寄信時機：訂單成立、轉帳款項確認（待確認 → 已付款）、可取件、訂單取消。訂單沒有 Email（會員沒填）就不寄

## 9. 日後維護提醒

- 新增 migration（`pnpm db:generate`）後，要再從本機對 RDS 執行 `(set -a; source .env.rds.local; set +a; pnpm db:migrate)`，不然 app 會用到還不存在的欄位
- 資料表由 `photo_migrator` 建立，`photo_app` 的權限靠預設權限自動取得；如果資料表是別的帳號建立的，需要手動 `GRANT`
