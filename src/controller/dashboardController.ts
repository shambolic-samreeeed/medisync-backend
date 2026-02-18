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

const DASH_TZ = "Asia/Kathmandu";

// Format date as YYYY-MM-DD in Nepal timezone
function dateKeyInTZ(d: Date, timeZone = DASH_TZ) {
  return d.toLocaleDateString("en-CA", { timeZone }); // "YYYY-MM-DD"
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
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

/**
 * GET /api/dashboard/sales-trend?days=7|30
 * Returns: [{ date: "YYYY-MM-DD", revenue: number, transactions: number }]
 */
export const getSalesTrend = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req.user as any)?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const daysRaw = Number(req.query.days ?? 7);
    const days = daysRaw === 30 ? 30 : 7; // only allow 7 or 30

    const now = new Date();

    // Start date = (days-1) days ago
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    // Aggregate by date (Nepal timezone)
    const rows = await Sale.aggregate([
      {
        $match: {
          pharmacyId,
          createdAt: { $gte: start, $lte: now },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: DASH_TZ,
            },
          },
          revenue: { $sum: "$totalAmount" },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Map results
    const map = new Map<string, { revenue: number; transactions: number }>();
    for (const r of rows) {
      map.set(r._id, {
        revenue: Number(r.revenue ?? 0),
        transactions: Number(r.transactions ?? 0),
      });
    }

    // Fill missing days with 0
    const startKey = dateKeyInTZ(start);
    const startDate = new Date(`${startKey}T00:00:00`); // safe base for iteration

    const series = Array.from({ length: days }).map((_, i) => {
      const d = addDays(startDate, i);
      const key = dateKeyInTZ(d);
      const v = map.get(key) ?? { revenue: 0, transactions: 0 };
      return { date: key, revenue: v.revenue, transactions: v.transactions };
    });

    return res.json({ days, series });
  } catch (err: any) {
    console.error("Sales trend error:", err);
    return res.status(500).json({
      message: "Failed to load sales trend",
      error: err?.message || err,
    });
  }
};