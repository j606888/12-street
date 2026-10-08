@AGENTS.md

# 線上洗照片系統

客人上傳 JPG 照片、選沖印尺寸／張數／周邊商品後下單（LINE 登入或訪客）；店家在 `/admin` 管理訂單、會員、照片。
需求來源是已報價的提案（NT$18,000）：**超出提案範圍的功能，先問再做。**

## 技術棧
- Next.js 16 App Router + TypeScript strict + Tailwind v4（Next 16 有破壞性變更，寫之前先查 `node_modules/next/dist/docs/`）
- Postgres：正式環境是 AWS RDS，本機用 `docker compose`；ORM 是 Drizzle（`drizzle-orm/node-postgres`）
- 驗證：Better Auth（LINE social login），管理員 = `user.role = 'admin'`
- 照片：Cloudflare R2（S3 相容 API，presigned URL）
- 部署：Vercel；套件管理：pnpm（不要用 npm/yarn）

## 指令
```
docker compose up -d     # 本機 Postgres
pnpm dev                 # 開發伺服器
pnpm lint / pnpm typecheck / pnpm test
pnpm db:generate         # schema 改完後產生 migration
pnpm db:migrate          # 套用 migration
pnpm db:seed             # 尺寸、價格、周邊商品、管理員
```

## 資料夾結構
- `src/app/(shop)/` 前台、`src/app/admin/` 後台、`src/app/api/` route handlers（auth、cron）
- `src/db/schema/` Drizzle schema、`src/db/migrations/` 產生出來的 migration、`src/db/seed.ts`
- `src/lib/` server 端共用（`auth.ts`、`r2.ts`、`db.ts`、`validators/`）
- `src/components/` UI 元件；`src/actions/` Server Actions

## 規範
- 預設用 Server Component，有互動才加 `"use client"`
- 寫入一律走 Server Actions，輸入用 Zod 驗證；每個 action 一開始就檢查身分與資料擁有權（admin action 檢查 role）。`proxy.ts` 的檢查只是第一道防線，不能取代 action 內的檢查
- 照片和轉帳截圖**絕不經過** Vercel Function（4.5 MB 上限）：上傳用 presigned PUT 直接傳到 R2，下載／ZIP 打包用 presigned GET 在瀏覽器處理
- 只接受 JPG/JPEG；重複判斷用瀏覽器算出的 SHA-256
- 金額一律用整數（新台幣元），下單時把單價快照到訂單上，不能回頭查目前價格
- 時間存 UTC（`timestamptz`），顯示時轉 `Asia/Taipei`
- UI 文字一律用繁體中文（台灣用語）；程式碼、變數名稱、commit message 用英文
- schema 變更一定要 `db:generate` 產生 migration 並 commit；不准用 `drizzle-kit push` 改 RDS
- App 連 DB 用最小權限的 `photo_app` 角色；DDL／migration 用 `photo_migrator`；master 帳號不進 app
- 連 RDS 一定要 SSL（`sslmode=verify-full`）
- 機密只放 `.env.local`／Vercel env，新增 env 時同步更新 `.env.example`
- 照片 1 個月後由 cron（`/api/cron/cleanup`）刪除，所有照片都要有 `expiresAt`
