// lib/billingCron.ts
// Runs at 00:01 IST on the 1st of every month
// Auto-generates billing records for all active users

import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { computeMonthlyPnl } from "@/lib/pnlEngine";
import { DateTime } from "luxon";

let started = false;

export function startBillingCron() {
  if (started) return;
  started = true;

  // "1 0 1 * *" = at 00:01 on the 1st of every month (server time)
  // Railway servers run UTC — IST is UTC+5:30, so 00:01 IST = 18:31 UTC previous day
  // Cron: 31 18 28-31 * * + last-day check, OR simplest: run at 18:31 UTC on last day
  // Easiest correct approach: run at 18:31 UTC daily, check if today is last day of month
  cron.schedule("31 18 * * *", async () => {
    const nowIST = DateTime.now().setZone("Asia/Kolkata");
    const lastDayOfMonth = nowIST.endOf("month").day;
    if (nowIST.day !== lastDayOfMonth) return; // Only run on last day of month

    const monthIST = nowIST.plus({ days: 1 }).toFormat("yyyy-MM"); // Next month = billing month
    console.log(`[BillingCron] Generating bills for ${monthIST}`);

    try {
      const settings = await prisma.platformSettings.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", platformFeePercent: 20 },
        update: {},
      });
      const feePercent = settings.platformFeePercent;

      const configs = await prisma.tradeConfig.findMany({
        where: { isActive: true },
        include: {
          account: { select: { api_key_enc: true, api_secret_enc: true } },
        },
      });

      for (const config of configs) {
        try {
          // Skip if already billed
          const existing = await prisma.billing.findFirst({
            where: { tradeConfigId: config.id, month: monthIST },
          });
          if (existing) continue;

          // Carry forward from previous month
          const prevMonthIST = nowIST.toFormat("yyyy-MM");
          const prevBilling = await prisma.billing.findFirst({
            where: { tradeConfigId: config.id, month: prevMonthIST },
            select: { carryForward: true, netPnl: true },
          });
          const prevCarryForward = prevBilling
            ? Math.min(0, prevBilling.carryForward + prevBilling.netPnl)
            : 0;

          const netPnl = await computeMonthlyPnl(
            config.account.api_key_enc,
            config.account.api_secret_enc,
            [config.script],
            monthIST,
          );

          const gross = prevCarryForward + netPnl;
          const billableAmount = Math.max(0, gross) * (feePercent / 100);

          await prisma.billing.create({
            data: {
              userId: config.userId,
              tradeConfigId: config.id,
              month: monthIST,
              productId: 0,
              netPnl,
              carryForward: prevCarryForward,
              billableAmount,
              platformFeePercent: feePercent,
              status: billableAmount > 0 ? "unpaid" : "no_bill",
            },
          });

          console.log(`[BillingCron] ✓ ${config.script} user:${config.userId} bill:$${billableAmount.toFixed(2)}`);
        } catch (e) {
          console.error(`[BillingCron] ✗ ${config.script}:`, e);
        }
      }
      console.log(`[BillingCron] Done for ${monthIST}`);
    } catch (e) {
      console.error("[BillingCron] Fatal:", e);
    }
  }, {
    timezone: "UTC",
  });

  console.log("[BillingCron] Scheduled — runs 18:31 UTC on last day of month");
}
