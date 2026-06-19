CREATE TABLE IF NOT EXISTS "Strategy" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"            TEXT NOT NULL,
  "symbol"          TEXT NOT NULL,
  "timeframe"       TEXT NOT NULL,
  "description"     TEXT,
  "equityData"      JSONB,
  "totalPnlPct"     DOUBLE PRECISION,
  "winRate"         DOUBLE PRECISION,
  "maxDrawdown"     DOUBLE PRECISION,
  "profitFactor"    DOUBLE PRECISION,
  "totalTrades"     INTEGER,
  "webhookToken"    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "isFeatured"      BOOLEAN NOT NULL DEFAULT false,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Strategy_webhookToken_key" ON "Strategy"("webhookToken");
ALTER TABLE "TradeConfig" ADD COLUMN IF NOT EXISTS "strategyId" TEXT;
ALTER TABLE "TradeConfig" ADD COLUMN IF NOT EXISTS "isSubscription" BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'TradeConfig_strategyId_fkey') THEN
    ALTER TABLE "TradeConfig" ADD CONSTRAINT "TradeConfig_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL;
  END IF;
END $$;
