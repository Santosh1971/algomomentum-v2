-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "phone" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDetails" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "deltaUserId" TEXT,
    "deltaAccountName" TEXT,

    CONSTRAINT "UserDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "initial_amount" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "userActive" BOOLEAN NOT NULL DEFAULT true,
    "script" TEXT NOT NULL,
    "comission" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "api_key_enc" TEXT NOT NULL DEFAULT '',
    "api_secret_enc" TEXT NOT NULL DEFAULT '',
    "delta_account_name" TEXT,
    "delta_user_id" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'bridge',
    "strategy" TEXT,
    "timeframe" TEXT,
    "session_start" TEXT,
    "session_end" TEXT,
    "risk_reward" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "platformFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "lastToggledAt" TIMESTAMP(3),
    "pause_lastToggledAt" TIMESTAMP(3),
    "lastEditAt" TIMESTAMP(3),

    CONSTRAINT "TradeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Script" (
    "symbol" TEXT NOT NULL,
    "exchange_symbol" TEXT NOT NULL,
    "lot" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "exchange" TEXT NOT NULL DEFAULT 'delta',
    "algorithm" TEXT,
    "productId" INTEGER NOT NULL,
    "Max_pos_size" INTEGER NOT NULL DEFAULT 15000,
    "Pos_Per" INTEGER NOT NULL DEFAULT 100,
    "gridEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultStrategy" TEXT,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "Billing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tradeConfigId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "netPnl" DOUBLE PRECISION NOT NULL,
    "carryForward" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billableAmount" DOUBLE PRECISION NOT NULL,
    "platformFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "billingId" TEXT,
    "amountPaid" DOUBLE PRECISION NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "razorpayPaymentId" TEXT,
    "reference" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserDetails_userId_key" ON "UserDetails"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE INDEX "TradeConfig_isActive_idx" ON "TradeConfig"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TradeConfig_userId_script_key" ON "TradeConfig"("userId", "script");

-- CreateIndex
CREATE UNIQUE INDEX "Billing_month_tradeConfigId_productId_key" ON "Billing"("month", "tradeConfigId", "productId");

-- AddForeignKey
ALTER TABLE "UserDetails" ADD CONSTRAINT "UserDetails_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeConfig" ADD CONSTRAINT "TradeConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Billing" ADD CONSTRAINT "Billing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Billing" ADD CONSTRAINT "Billing_tradeConfigId_fkey" FOREIGN KEY ("tradeConfigId") REFERENCES "TradeConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "Billing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
