# 十二街寫真館 線上洗照片系統

## 專案簡介

客人上傳 JPG 照片、選擇沖印尺寸與張數（以及護貝、證件照、客製化商品），以 LINE 會員或訪客身分下單；店家在 `/admin` 管理訂單、會員與照片。
需求來源是已報價的提案，超出提案範圍的功能請先與業主確認再做。開發規範請看 [CLAUDE.md](CLAUDE.md)。

## 技術棧

- Next.js 16 App Router、TypeScript strict、Tailwind v4（Next 16 有破壞性變更，寫之前先查 `node_modules/next/dist/docs/`）
- Postgres（正式環境 AWS RDS，本機 Docker）＋ Drizzle ORM
- Better Auth（LINE Login），管理員 = `user.role = 'admin'`
- Cloudflare R2（presigned URL 直傳／直下載）
- 部署在 Vercel，套件管理用 pnpm

## 本機開發

### 事前準備

- Node.js（建議 LTS）與 Docker
- pnpm 10：專案用 `packageManager` 鎖定 `pnpm@10.18.0`，啟用 corepack 即可，不要用 npm／yarn

  ```bash
  corepack enable
  # 若 corepack 下載時卡在互動提示，可先設定：
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  ```

### 步驟

1. 啟動本機 Postgres（埠 5433，帳密／資料庫皆為 `photo`）：

   ```bash
   docker compose up -d
   ```

2. 複製環境變數範本，並填入 `.env.local`（機密只放這裡，不要 commit）：

   ```bash
   cp .env.example .env.local
   ```

   - `DATABASE_URL`：範本預設值已對應 docker compose，不用改
   - `BETTER_AUTH_SECRET`：自行產生，例如 `openssl rand -base64 32`
   - `BETTER_AUTH_URL`：本機維持 `http://localhost:3000`
   - `LINE_CLIENT_ID`、`LINE_CLIENT_SECRET`：LINE Developers 的 LINE Login channel（LINE Login 的 callback URL 要加上 `http://localhost:3000/api/auth/callback/line`）
   - `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`：Cloudflare R2，bucket 的 CORS 設定見 [docs/r2-setup.md](docs/r2-setup.md)
   - `NEXT_PUBLIC_LINE_PAY_ID`／`NEXT_PUBLIC_LINE_PAY_URL`／`NEXT_PUBLIC_BANK_ACCOUNT`：結帳頁顯示的付款資訊，值見 [docs/owner-pricing.md](docs/owner-pricing.md)
   - `CRON_SECRET`：本機要測 `/api/cron/cleanup` 才需要（16 字以上）
   - `MIGRATION_DATABASE_URL`、`DATABASE_SSL`：本機留空（正式環境才用，見 [docs/launch-checklist.md](docs/launch-checklist.md)）

3. 安裝套件、套用 migration、寫入初始資料、啟動：

   ```bash
   pnpm install
   pnpm db:migrate
   pnpm db:seed
   pnpm dev
   ```

   開啟 <http://localhost:3000>。

### 成為管理員

`pnpm db:seed` 會依 `ADMIN_LINE_IDS`（以逗號分隔的 LINE user ID）把對應帳號的 `user.role` 設成 `admin`。**該帳號必須先登入過一次**，否則找不到人：

1. 用要當管理員的 LINE 帳號在網站登入一次
2. 把這個帳號的 LINE user ID（資料表 `account.account_id`，也就是 LINE 的 `sub`，通常以 `U` 開頭）寫進 `.env.local` 的 `ADMIN_LINE_IDS`，多人以逗號分隔
3. 再跑一次 `pnpm db:seed`，輸出會顯示 `admins promoted: x/y`
4. 重新整理後即可進入 `/admin`

## 常用指令

| 指令 | 用途 |
|---|---|
| `pnpm dev` | 開發伺服器 |
| `pnpm build` / `pnpm start` | 正式建置／啟動（建置**不會**跑 migration） |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `next typegen` ＋ `tsc --noEmit` |
| `pnpm test` | Vitest |
| `pnpm format` | Prettier |
| `pnpm db:generate` | schema 改完後產生 migration（要 commit） |
| `pnpm db:migrate` | 套用 migration |
| `pnpm db:seed` | 寫入尺寸、價格、證件照商品、會員標籤，並提升管理員 |
| `pnpm db:studio` | Drizzle Studio |

schema 變更一定要 `db:generate` 並 commit migration，不准用 `drizzle-kit push` 改正式資料庫。

## 資料夾結構

- `src/app/(shop)/` 前台、`src/app/admin/` 後台、`src/app/login/` 登入、`src/app/api/` route handlers（auth、cron）
- `src/db/schema/` Drizzle schema、`src/db/migrations/` 產生出來的 migration、`src/db/seed.ts`
- `src/lib/` server 端共用（`auth.ts`、`r2.ts`、`db.ts`、`validators/` 等）
- `src/actions/` Server Actions、`src/components/` UI 元件
- `src/proxy.ts` 保護 `/admin` 與 `/orders/mine` 的第一道防線
- `certs/` RDS CA bundle（連正式資料庫用）
- `docs/` 文件

慣例與規範（Server Actions、金額、時區、照片不經過 Vercel Function 等）請看 [CLAUDE.md](CLAUDE.md)。

## 文件索引

| 文件 | 內容 |
|---|---|
| [docs/owner-pricing.md](docs/owner-pricing.md) | 業主提供的價目、證件照、付款資訊與系統對應狀態 |
| [docs/r2-setup.md](docs/r2-setup.md) | R2 bucket 的 CORS、Lifecycle 與 Vercel Cron 設定 |
| [docs/rds-setup.sql](docs/rds-setup.sql) | 在 RDS 建立 `photo_migrator`／`photo_app` 角色與權限（master 帳號執行一次） |
| [docs/launch-checklist.md](docs/launch-checklist.md) | 上線檢查清單：RDS、migration、環境變數、LINE callback、smoke test |

## 部署

部署在 Vercel，資料庫為 AWS RDS。完整步驟（RDS 角色、migration、環境變數、LINE callback URL、正式網域與上線後測試）請照 [docs/launch-checklist.md](docs/launch-checklist.md) 逐項勾選。
