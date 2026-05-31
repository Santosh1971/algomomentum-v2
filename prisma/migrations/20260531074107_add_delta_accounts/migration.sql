-- ─────────────────────────────────────────────────────────────
-- STEP 1: Create DeltaAccount table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "DeltaAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'main',
    "accountName" TEXT NOT NULL DEFAULT 'Main Account',
    "api_key_enc" TEXT NOT NULL DEFAULT '',
    "api_secret_enc" TEXT NOT NULL DEFAULT '',
    "delta_account_name" TEXT,
    "delta_user_id" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeltaAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeltaAccount_userId_idx" ON "DeltaAccount"("userId");
CREATE UNIQUE INDEX "DeltaAccount_userId_accountType_key" ON "DeltaAccount"("userId", "accountType");

ALTER TABLE "DeltaAccount" ADD CONSTRAINT "DeltaAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- STEP 2: Migrate API keys from TradeConfig → DeltaAccount
--         One "main" account per user, using keys from first config
-- ─────────────────────────────────────────────────────────────
INSERT INTO "DeltaAccount" (
    "id", "userId", "accountType", "accountName",
    "api_key_enc", "api_secret_enc",
    "delta_account_name", "delta_user_id",
    "isActive", "createdAt"
)
SELECT DISTINCT ON ("userId")
    gen_random_uuid()::text,
    "userId",
    'main',
    'Main Account',
    COALESCE("api_key_enc", ''),
    COALESCE("api_secret_enc", ''),
    "delta_account_name",
    "delta_user_id",
    true,
    now()
FROM "TradeConfig"
ORDER BY "userId", "createdAt" ASC;

-- ─────────────────────────────────────────────────────────────
-- STEP 3: Add new columns to TradeConfig as NULLABLE first
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "TradeConfig"
    ADD COLUMN "accountId"    TEXT,
    ADD COLUMN "webhookToken" TEXT,
    ADD COLUMN "compoundMode" TEXT NOT NULL DEFAULT 'fixed',
    ADD COLUMN "leverage"     INTEGER NOT NULL DEFAULT 1;

-- ─────────────────────────────────────────────────────────────
-- STEP 4: Populate accountId and webhookToken for existing rows
-- ─────────────────────────────────────────────────────────────
UPDATE "TradeConfig" tc
SET "accountId" = da."id"
FROM "DeltaAccount" da
WHERE tc."userId" = da."userId" AND da."accountType" = 'main';

UPDATE "TradeConfig"
SET "webhookToken" = gen_random_uuid()::text
WHERE "webhookToken" IS NULL;

-- ─────────────────────────────────────────────────────────────
-- STEP 5: Now make accountId and webhookToken NOT NULL
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "TradeConfig"
    ALTER COLUMN "accountId" SET NOT NULL,
    ALTER COLUMN "webhookToken" SET NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- STEP 6: Drop old columns from TradeConfig
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "TradeConfig"
    DROP COLUMN "api_key_enc",
    DROP COLUMN "api_secret_enc",
    DROP COLUMN "delta_account_name",
    DROP COLUMN "delta_user_id";

-- ─────────────────────────────────────────────────────────────
-- STEP 7: Drop old unique constraint, add new ones
-- ─────────────────────────────────────────────────────────────
DROP INDEX "TradeConfig_userId_script_key";

CREATE UNIQUE INDEX "TradeConfig_webhookToken_key" ON "TradeConfig"("webhookToken");
CREATE INDEX "TradeConfig_webhookToken_idx" ON "TradeConfig"("webhookToken");
CREATE UNIQUE INDEX "TradeConfig_accountId_script_key" ON "TradeConfig"("accountId", "script");

-- ─────────────────────────────────────────────────────────────
-- STEP 8: Add FK from TradeConfig to DeltaAccount
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "TradeConfig" ADD CONSTRAINT "TradeConfig_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "DeltaAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
