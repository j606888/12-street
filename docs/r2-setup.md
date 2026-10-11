# R2 bucket 設定（CORS、Lifecycle）

App 用的 R2 API token 只有物件讀寫權限，讀不到也改不了 bucket 設定（這是刻意的）。
以下設定請在 Cloudflare 後台手動套用：**R2 → 選 bucket → Settings**。

- 本機開發：`street12-photos-dev`
- 正式環境：另外建一個 bucket（例如 `street12-photos`），兩個都要設

## CORS policy

瀏覽器會直接對 R2 發出兩種請求：
- `PUT`：上傳照片、轉帳截圖（presigned PUT）
- `GET`／`HEAD`：後台打包 ZIP 時用 `fetch` 下載照片（presigned GET）

Settings → CORS Policy → Edit，貼上：

```json
[
  {
    "AllowedOrigins": [
      "https://12-street.com",
      "https://12-street.vercel.app"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

- 上面是正式 bucket `street12-photos` 的設定（已套用）；dev bucket `street12-photos-dev` 只放 `http://localhost:3000`
- R2 的 `AllowedOrigins` 不支援 `https://*.vercel.app` 這種部分萬用字元。Preview 部署如果要測上傳，需要把那個 preview 網址加進去，或讓 preview 用 dev bucket

## Object lifecycle rules（備援）

照片和轉帳截圖平常由 cron（`/api/cron/cleanup`，每天台灣時間 03:00）在 30 天後刪除，並同步更新 DB。
Lifecycle 規則只是**備援**：萬一 cron 停了好幾天，或有 DB 沒記到的孤兒檔案，R2 也會自己清掉。
天數比 cron 長，正常情況下輪不到它。

Settings → Object lifecycle rules → Add rule：

| 規則名稱 | Prefix | 動作 |
|---|---|---|
| `photos-backstop` | `photos/` | Delete objects after **35** days |
| `transfer-proofs-backstop` | `transfer-proofs/` | Delete objects after **60** days |

- 轉帳截圖是送出訂單**之前**上傳的，cron 從「送出時間」起算 30 天；客人如果草稿放很久才送出，上傳時間會更早，所以備援給 60 天，避免比 cron 先刪
- 被 lifecycle 刪掉、但 DB 還標記為已上傳的照片，後台 ZIP 下載會失敗；這只會發生在 cron 沒在跑的時候，看到時請先檢查 cron

## Vercel Cron

- 設定在 `vercel.json`：`0 19 * * *`（UTC 19:00 = 台灣 03:00）
- Vercel 環境變數要設 `CRON_SECRET`（16 字以上，`openssl rand -base64 32`）。沒設的話 route 一律回 401，清除不會執行
- Hobby 方案的 cron 一天最多一次，實際執行時間可能在該小時內任何時間
- 執行結果會寫在 Vercel Logs：`cleanup {"photos":…,"transferProofs":…,"drafts":…,"lookupFailures":…}`
- 手動執行：`curl -H "Authorization: Bearer $CRON_SECRET" https://12-street.com/api/cron/cleanup`
