import { Request, Response } from "express";
import Sale from "../models/Sale";
import Medicine from "../models/Medicine";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function calcDeltaPct(today: number, yesterday: number) {
  if (yesterday === 0) {
    if (today === 0) return 0;
    return 100; // or return null if you prefer "NEW"
  }
  return Math.round(((today - yesterday) / Math.abs(yesterday)) * 100);
}

/**
 * GET /api/dashboard/kpis?expiryDays=30
 * Protected: uses req.user.pharmacyId
 */
export const getDashboardKPIs = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req.user as any)?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const now = new Date();

    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yesterdayStart = startOfDay(y);
    const yesterdayEnd = endOfDay(y);

    const expiryDays = Number(req.query.expiryDays ?? 30);
    const expiryLimit = new Date(now);
    expiryLimit.setDate(expiryLimit.getDate() + expiryDays);

    // --- Today ---
    const todaySalesAggPromise = Sale.aggregate([
      { $match: { pharmacyId, createdAt: { $gte: todayStart, $lte: todayEnd } } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    const todaySalesCountPromise = Sale.countDocuments({
      pharmacyId,
      createdAt: { $gte: todayStart, $lte: todayEnd },
    });

    // --- Yesterday ---
    const yesterdaySalesAggPromise = Sale.aggregate([
      { $match: { pharmacyId, createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    const yesterdaySalesCountPromise = Sale.countDocuments({
      pharmacyId,
      createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd },
    });

    // --- State metrics (no delta) ---
    const lowStockPromise = Medicine.countDocuments({
      pharmacyId,
      stock: { $gt: 0 },
      $expr: { $lte: ["$stock", "$reorderLevel"] },
    });

    const nearExpiryPromise = Medicine.countDocuments({
      pharmacyId,
      stock: { $gt: 0 },
      expiryDate: { $gte: now, $lte: expiryLimit },
    });

    const [
      todaySalesAgg,
      todaySalesCount,
      yesterdaySalesAgg,
      yesterdaySalesCount,
      lowStockCount,
      nearExpiryCount,
    ] = await Promise.all([
      todaySalesAggPromise,
      todaySalesCountPromise,
      yesterdaySalesAggPromise,
      yesterdaySalesCountPromise,
      lowStockPromise,
      nearExpiryPromise,
    ]);

    const todaySales = todaySalesAgg?.[0]?.total ?? 0;
    const yesterdaySales = yesterdaySalesAgg?.[0]?.total ?? 0;

    return res.json({
      // Card 1: Today's Sales (sum)
      todaysSales: {
        value: todaySales,
        deltaPct: calcDeltaPct(todaySales, yesterdaySales),
      },

      // Card 2: Sales recorded today (count)
      salesToday: {
        value: todaySalesCount,
        deltaPct: calcDeltaPct(todaySalesCount, yesterdaySalesCount),
      },

      // Card 3: Low stock (state)
      lowStockItems: {
        value: lowStockCount,
        deltaPct: null,
      },

      // Card 4: Near expiry (state)
      nearingExpiry: {
        value: nearExpiryCount,
        deltaPct: null,
      },
    });
  } catch (err: any) {
    console.error("Dashboard KPI Error:", err);
    return res.status(500).json({
      message: "Failed to load dashboard KPIs",
      error: err?.message || err,
    });
  }
};
