-- RDS 角色與權限設定（上線前由 master 帳號執行一次）
--
-- 目的：
--   photo_migrator  只給 migration 用（pnpm db:migrate），擁有 public schema 內的物件，可做 DDL
--   photo_app       Vercel 上的 app 用，只能 SELECT/INSERT/UPDATE/DELETE，不能做 DDL，碰不到 drizzle schema
--   master 帳號     只用來跑這支腳本，不放進 app 或 Vercel
--
-- 執行方式（在本機，連線一定要 SSL 並驗證憑證）：
--
--   psql "host=<RDS 端點> port=5432 dbname=<資料庫名稱> user=<master 帳號> \
--         sslmode=verify-full sslrootcert=certs/rds-global-bundle.pem" \
--     -v ON_ERROR_STOP=1 \
--     -v migrator_password='<強密碼 A>' \
--     -v app_password='<強密碼 B>' \
--     -f docs/rds-setup.sql
--
--   - 密碼用 psql 變數傳入，不要寫進這個檔案，也不要 commit
--   - 密碼若含特殊字元，連線字串（DATABASE_URL）裡要做 URL encode；建議用英數字密碼
--   - 資料庫名稱請填實際要放資料的 DB（腳本內用 current_database()，不寫死）
--   - 腳本可重複執行：角色已存在時只會更新密碼，授權語句本身是冪等的
--
-- 執行完成後，兩個角色的連線字串（填進 Vercel／本機 .env.local）：
--   DATABASE_URL           = postgres://photo_app:<密碼 B>@<RDS 端點>:5432/<資料庫名稱>
--   MIGRATION_DATABASE_URL = postgres://photo_migrator:<密碼 A>@<RDS 端點>:5432/<資料庫名稱>
--   DATABASE_SSL           = true
-- （憑證驗證由程式內的 certs/rds-global-bundle.pem 處理，連線字串不用再加 sslmode）

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. 建立角色（已存在就只更新密碼）
-- ---------------------------------------------------------------------------
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'photo_migrator') AS migrator_exists \gset
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'photo_app') AS app_exists \gset

\if :migrator_exists
  ALTER ROLE photo_migrator WITH LOGIN NOCREATEDB NOCREATEROLE PASSWORD :'migrator_password';
\else
  CREATE ROLE photo_migrator WITH LOGIN NOCREATEDB NOCREATEROLE PASSWORD :'migrator_password';
\endif

\if :app_exists
  ALTER ROLE photo_app WITH LOGIN NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
\else
  CREATE ROLE photo_app WITH LOGIN NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
\endif

-- 兩個角色都不能建 DB、建角色（上面已指定）。新角色預設就不是 superuser；
-- RDS 的 master 不是 superuser，連 NOSUPERUSER 都不能設，所以這裡不寫

-- RDS 的 master 不是真正的 superuser，要先成為 photo_migrator 的成員，
-- 才能把物件擁有權交給它、或用 ALTER DEFAULT PRIVILEGES FOR ROLE photo_migrator
GRANT photo_migrator TO CURRENT_USER;

-- ---------------------------------------------------------------------------
-- 2. 資料庫與 schema public 的基本權限
-- ---------------------------------------------------------------------------
-- 預設 PUBLIC 可以連線、可以在 public 建表；先收回 PUBLIC 在 public 的建立權限
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 只有 migrator 可以在 public 建立物件
SELECT current_database() AS dbname \gset
-- 預設 PUBLIC 可以連任何資料庫；這台 RDS 也放其他專案，只讓需要的角色連這個 DB
REVOKE CONNECT, TEMPORARY ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"dbname" TO photo_migrator, photo_app;

-- migrator 擁有 public schema（PG15+ 預設擁有者是 pg_database_owner，這裡明確交給 migrator）
ALTER SCHEMA public OWNER TO photo_migrator;
GRANT USAGE ON SCHEMA public TO photo_app;

-- ---------------------------------------------------------------------------
-- 3. drizzle schema（drizzle-kit migrate 自己建立的 migration 紀錄）
-- ---------------------------------------------------------------------------
-- drizzle-kit migrate 預設會建立 schema "drizzle" 與資料表 "__drizzle_migrations"
-- （drizzle-orm 的 migrator 預設值，需要 CREATE SCHEMA 權限），所以 migrator 要能在這個 DB 建 schema。
-- 先替它建好、交給 migrator，之後 photo_app 完全不授權 = 看不到也改不了。
GRANT CREATE ON DATABASE :"dbname" TO photo_migrator;
CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION photo_migrator;
REVOKE ALL ON SCHEMA drizzle FROM PUBLIC;
REVOKE ALL ON SCHEMA drizzle FROM photo_app;

-- ---------------------------------------------------------------------------
-- 4. 如果 public 裡已經有 master 建立的物件（例如先前手動試跑），交給 migrator
--    全新的資料庫沒有任何物件，這段什麼都不會做
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables
           WHERE schemaname = 'public' AND tableowner <> 'photo_migrator' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO photo_migrator', r.tablename);
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'S'
             AND pg_get_userbyid(c.relowner) <> 'photo_migrator'
             AND NOT EXISTS (SELECT 1 FROM pg_depend d
                             WHERE d.objid = c.oid AND d.deptype IN ('a', 'i')) LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO photo_migrator', r.relname);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. photo_app 的權限：只有資料的讀寫，沒有 DDL
-- ---------------------------------------------------------------------------
-- 5a. 現有的資料表與 sequence（全新 DB 為空，無害）
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO photo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO photo_app;

-- 5b. 之後由 photo_migrator 跑 migration 新建的資料表／sequence，自動授權給 photo_app
--     （enum 型別預設 PUBLIC 就有 USAGE，不需要另外授權）
ALTER DEFAULT PRIVILEGES FOR ROLE photo_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO photo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE photo_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO photo_app;

-- ---------------------------------------------------------------------------
-- 6. 檢查（執行後請看輸出）
-- ---------------------------------------------------------------------------
-- 兩個角色：都應該是 can_login = t、superuser = f
SELECT rolname, rolcanlogin AS can_login, rolsuper AS superuser
FROM pg_roles WHERE rolname IN ('photo_migrator', 'photo_app') ORDER BY rolname;

-- photo_app 對 public / drizzle 的權限：public 應為 USAGE=t、CREATE=f；drizzle 應為 USAGE=f、CREATE=f
SELECT
  has_schema_privilege('photo_app', 'public', 'USAGE')  AS public_usage,
  has_schema_privilege('photo_app', 'public', 'CREATE') AS public_create,
  has_schema_privilege('photo_app', 'drizzle', 'USAGE') AS drizzle_usage,
  has_schema_privilege('photo_app', 'drizzle', 'CREATE') AS drizzle_create;

-- 跑完 migration 後可再確認一次（應列出 photo_app 的 DELETE/INSERT/SELECT/UPDATE）：
--   SELECT table_name, privilege_type FROM information_schema.role_table_grants
--   WHERE grantee = 'photo_app' AND table_schema = 'public' ORDER BY 1, 2;
