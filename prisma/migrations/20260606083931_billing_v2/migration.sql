-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedByAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "screenshotUrl" TEXT;

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "platformFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "upiQrImageUrl" TEXT,
    "upiId" TEXT,
    "adminWhatsapp" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);
