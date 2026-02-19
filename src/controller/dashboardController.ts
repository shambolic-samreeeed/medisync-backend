// src/controllers/dashboard.controller.ts
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
    return 100; // or null/"NEW" depending on your UI
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
 * Convert "today in Nepal" boundaries to UTC Dates for Mongo queries.
 * We build a Nepal-local YYYY-MM-DD key then use it as a stable base.
 */
function startOfDayInTZ(date = new Date(), timeZone = DASH_TZ) {
  const key = dateKeyInTZ(date, timeZone); // YYYY-MM-DD (Nepal)
  return new Date(`${key}T00:00:00.000Z`);
}
function endOfDayInTZ(date = new Date(), timeZone = DASH_TZ) {
  const key = dateKeyInTZ(date, timeZone);
  return new Date(`${key}T23:59:59.999Z`);
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

/**
 * GET /api/dashboard/inventory-alerts?expiryDays=30&limit=50
 * Shows:
 * - expired (expired + still in stock)
 * - nearExpiry (expiring within expiryDays + in stock)
 * - outOfStock (stock <= 0)
 * - lowStock (0 < stock <= reorderLevel)
 */
export const getInventoryAlerts = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req.user as any)?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const expiryDays = Number(req.query.expiryDays ?? 30);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const now = new Date();
    const todayStartNepal = startOfDayInTZ(now, DASH_TZ);

    const expiryLimit = new Date(now);
    expiryLimit.setDate(expiryLimit.getDate() + expiryDays);

    // Keep response light
    const projection = {
      name: 1,
      brand: 1,
      batchNumber: 1,
      stock: 1,
      reorderLevel: 1,
      expiryDate: 1,
      sellingPrice: 1,
      purchasePrice: 1,
      category: 1,
      unit: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    // expired but still in stock
    const expiredPromise = Medicine.find({
      pharmacyId,
      stock: { $gt: 0 },
      expiryDate: { $lt: todayStartNepal },
    })
      .select(projection)
      .sort({ expiryDate: 1 })
      .limit(limit)
      .lean();

    // near expiry (includes today..expiryLimit)
    const nearExpiryPromise = Medicine.find({
      pharmacyId,
      stock: { $gt: 0 },
      expiryDate: { $gte: todayStartNepal, $lte: expiryLimit },
    })
      .select(projection)
      .sort({ expiryDate: 1 })
      .limit(limit)
      .lean();

    const outOfStockPromise = Medicine.find({
      pharmacyId,
      stock: { $lte: 0 },
    })
      .select(projection)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    // low stock = stock > 0 and stock <= reorderLevel (treat missing reorderLevel as 0)
    const lowStockPromise = Medicine.find({
      pharmacyId,
      stock: { $gt: 0 },
      $expr: { $lte: ["$stock", { $ifNull: ["$reorderLevel", 0] }] },
    })
      .select(projection)
      .sort({ stock: 1 })
      .limit(limit)
      .lean();

    const [expired, nearExpiry, outOfStock, lowStock] = await Promise.all([
      expiredPromise,
      nearExpiryPromise,
      outOfStockPromise,
      lowStockPromise,
    ]);

    return res.json({
      expiryDays,
      items: { expired, nearExpiry, outOfStock, lowStock },
      counts: {
        expired: expired.length,
        nearExpiry: nearExpiry.length,
        outOfStock: outOfStock.length,
        lowStock: lowStock.length,
      },
    });
  } catch (err: any) {
    console.error("Inventory alerts error:", err);
    return res.status(500).json({
      message: "Failed to load inventory alerts",
      error: err?.message || err,
    });
  }
};

/**
 * GET /api/dashboard/inventory-alerts/summary?expiryDays=30
 * Counts only (useful for dashboard cards)
 */
export const getInventoryAlertsSummary = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req.user as any)?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const expiryDays = Number(req.query.expiryDays ?? 30);

    const now = new Date();
    const todayStartNepal = startOfDayInTZ(now, DASH_TZ);

    const expiryLimit = new Date(now);
    expiryLimit.setDate(expiryLimit.getDate() + expiryDays);

    const expiredCountPromise = Medicine.countDocuments({
      pharmacyId,
      stock: { $gt: 0 },
      expiryDate: { $lt: todayStartNepal },
    });

    const nearExpiryCountPromise = Medicine.countDocuments({
      pharmacyId,
      stock: { $gt: 0 },
      expiryDate: { $gte: todayStartNepal, $lte: expiryLimit },
    });

    const outOfStockCountPromise = Medicine.countDocuments({
      pharmacyId,
      stock: { $lte: 0 },
    });

    const lowStockCountPromise = Medicine.countDocuments({
      pharmacyId,
      stock: { $gt: 0 },
      $expr: { $lte: ["$stock", { $ifNull: ["$reorderLevel", 0] }] },
    });

    const [expired, nearExpiry, outOfStock, lowStock] = await Promise.all([
      expiredCountPromise,
      nearExpiryCountPromise,
      outOfStockCountPromise,
      lowStockCountPromise,
    ]);

    return res.json({
      expiryDays,
      counts: { expired, nearExpiry, outOfStock, lowStock },
    });
  } catch (err: any) {
    console.error("Inventory alerts summary error:", err);
    return res.status(500).json({
      message: "Failed to load inventory alerts summary",
      error: err?.message || err,
    });
  }
};
