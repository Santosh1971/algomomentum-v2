CREATE TABLE "EngineRunLog" (
  "id"         TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accountId"  TEXT NOT NULL,
  "engineType" TEXT NOT NULL,
  "mode"       TEXT NOT NULL,
  "barTime"    TIMESTAMP(3) NOT NULL,
  "ok"         BOOLEAN NOT NULL DEFAULT true,
  "replay"     JSONB,
  "exchange"   JSONB,
  "actions"    JSONB,
  "notes"      TEXT,
  CONSTRAINT "EngineRunLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EngineRunLog_accountId_barTime_mode_key" ON "EngineRunLog"("accountId", "barTime", "mode");
CREATE INDEX "EngineRunLog_createdAt_idx" ON "EngineRunLog"("createdAt");
