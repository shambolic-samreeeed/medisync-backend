// src/controller/dashboardController.ts
import { Request, Response } from "express";
import mongoose from "mongoose";
import Sale from "../models/Sale";
import Batch from "../models/Batch";
import ProductMedicine from "../models/ProductMedicine";
import { DateTime } from "luxon";

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
    return 100;
  }
  return Math.round(((today - yesterday) / Math.abs(yesterday)) * 100);
}

const DASH_TZ = "Asia/Kathmandu";

function dateKeyInTZ(d: Date, timeZone = DASH_TZ) {
  return d.toLocaleDateString("en-CA", { timeZone });
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfDayInTZ(date = new Date(), timeZone = DASH_TZ) {
  const key = dateKeyInTZ(date, timeZone);
  return new Date(`${key}T00:00:00.000Z`);
}

function endOfDayInTZ(date = new Date(), timeZone = DASH_TZ) {
  const key = dateKeyInTZ(date, timeZone);
  return new Date(`${key}T23:59:59.999Z`);
}

/**
 * GET /api/dashboard/kpis?expiryDays=30
 */
export const getDashboardKPIs = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req.user as any)?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    // req.user.pharmacyId is a string. Sale & Batch store pharmacyId as ObjectId.
    // Aggregation pipelines do strict type matching so we must convert.
    const pharmacyObjId = new mongoose.Types.ObjectId(String(pharmacyId));

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

    // --- Today's revenue ---
    const todaySalesAggPromise = Sale.aggregate([
      { $match: { pharmacyId: pharmacyObjId, createdAt: { $gte: todayStart, $lte: todayEnd } } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    const todaySalesCountPromise = Sale.countDocuments({
      pharmacyId: pharmacyObjId,
      createdAt: { $gte: todayStart, $lte: todayEnd },
    });

    // --- Yesterday's revenue ---
    const yesterdaySalesAggPromise = Sale.aggregate([
      { $match: { pharmacyId: pharmacyObjId, createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    const yesterdaySalesCountPromise = Sale.countDocuments({
      pharmacyId: pharmacyObjId,
      createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd },
    });

    // --- Low stock: products where total active batch stock <= reorderLevel ---
    const lowStockPromise = ProductMedicine.aggregate([
      { $match: { pharmacyId: pharmacyObjId, isActive: true } },
      {
        $lookup: {
          from: "batches",
          let: { pid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$productId", "$$pid"] }, status: "ACTIVE" } },
            { $group: { _id: null, total: { $sum: "$currentQuantity" } } },
          ],
          as: "stockInfo",
        },
      },
      {
        $addFields: {
          totalStock: { $ifNull: [{ $arrayElemAt: ["$stockInfo.total", 0] }, 0] },
        },
      },
      {
        $match: {
          $expr: {
            $and: [
              { $gt: ["$totalStock", 0] },
              { $gt: ["$reorderLevel", 0] },
              { $lte: ["$totalStock", "$reorderLevel"] },
            ],
          },
        },
      },
      { $count: "count" },
    ]).then((r: any[]) => r[0]?.count ?? 0);

    // --- Near expiry: active batches expiring within expiryDays ---
    const nearExpiryPromise = Batch.countDocuments({
      pharmacyId: pharmacyObjId,
      status: "ACTIVE",
      currentQuantity: { $gt: 0 },
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
      todaysSales: {
        value: todaySales,
        deltaPct: calcDeltaPct(todaySales, yesterdaySales),
      },
      salesToday: {
        value: todaySalesCount,
        deltaPct: calcDeltaPct(todaySalesCount, yesterdaySalesCount),
      },
      lowStockItems: {
        value: lowStockCount,
        deltaPct: null,
      },
      nearingExpiry: {
        value: nearExpiryCount,
        deltaPct: null,
      },
    });
  } catch (err: any) {
    console.error("Dashboard KPI Error:", err);
    return res.status(500).json({ message: "Failed to load dashboard KPIs", error: err?.message || err });
  }
};

/**
 * GET /api/dashboard/sales-trend?days=7|30
 */
export const getSalesTrend = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req.user as any)?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const pharmacyObjId = new mongoose.Types.ObjectId(String(pharmacyId));
    const daysRaw = Number(req.query.days ?? 7);
    const days = daysRaw === 30 ? 30 : 7;
    const now = new Date();

    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const rows = await Sale.aggregate([
      { $match: { pharmacyId: pharmacyObjId, createdAt: { $gte: start, $lte: now } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: DASH_TZ } },
          revenue: { $sum: "$totalAmount" },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const map = new Map<string, { revenue: number; transactions: number }>();
    for (const r of rows) {
      map.set(r._id, { revenue: Number(r.revenue ?? 0), transactions: Number(r.transactions ?? 0) });
    }

    const startKey = dateKeyInTZ(start);
    const startDate = new Date(`${startKey}T00:00:00`);

    const series = Array.from({ length: days }).map((_, i) => {
      const d = addDays(startDate, i);
      const key = dateKeyInTZ(d);
      const v = map.get(key) ?? { revenue: 0, transactions: 0 };
      return { date: key, revenue: v.revenue, transactions: v.transactions };
    });

    return res.json({ days, series });
  } catch (err: any) {
    console.error("Sales trend error:", err);
    return res.status(500).json({ message: "Failed to load sales trend", error: err?.message || err });
  }
};

/**
 * GET /api/dashboard/inventory-alerts?expiryDays=30&limit=50
 */
export const getInventoryAlerts = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req.user as any)?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const pharmacyObjId = new mongoose.Types.ObjectId(String(pharmacyId));
    const expiryDays = Number(req.query.expiryDays ?? 30);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const now = new Date();
    const todayStartNepal = startOfDayInTZ(now, DASH_TZ);
    const expiryLimit = new Date(now);
    expiryLimit.setDate(expiryLimit.getDate() + expiryDays);

    // Expired batches still with stock
    const expiredPromise = Batch.find({
      pharmacyId: pharmacyObjId,
      status: "ACTIVE",
      currentQuantity: { $gt: 0 },
      expiryDate: { $lt: todayStartNepal },
    })
      .populate("productId", "brandName productCode unit manufacturer")
      .sort({ expiryDate: 1 })
      .limit(limit)
      .lean();

    // Near-expiry batches
    const nearExpiryPromise = Batch.find({
      pharmacyId: pharmacyObjId,
      status: "ACTIVE",
      currentQuantity: { $gt: 0 },
      expiryDate: { $gte: todayStartNepal, $lte: expiryLimit },
    })
      .populate("productId", "brandName productCode unit manufacturer")
      .sort({ expiryDate: 1 })
      .limit(limit)
      .lean();

    // Out of stock: products with zero total active stock
    const outOfStockPromise = ProductMedicine.aggregate([
      { $match: { pharmacyId: pharmacyObjId, isActive: true } },
      {
        $lookup: {
          from: "batches",
          let: { pid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$productId", "$$pid"] }, status: "ACTIVE" } },
            { $group: { _id: null, total: { $sum: "$currentQuantity" } } },
          ],
          as: "stockInfo",
        },
      },
      {
        $addFields: {
          totalStock: { $ifNull: [{ $arrayElemAt: ["$stockInfo.total", 0] }, 0] },
        },
      },
      { $match: { totalStock: { $lte: 0 } } },
      {
        $project: {
          brandName: 1, productCode: 1, unit: 1,
          manufacturer: 1, totalStock: 1, reorderLevel: 1, updatedAt: 1,
        },
      },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
    ]);

    // Low stock: 0 < totalStock <= reorderLevel
    const lowStockPromise = ProductMedicine.aggregate([
      { $match: { pharmacyId: pharmacyObjId, isActive: true } },
      {
        $lookup: {
          from: "batches",
          let: { pid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$productId", "$$pid"] }, status: "ACTIVE" } },
            { $group: { _id: null, total: { $sum: "$currentQuantity" } } },
          ],
          as: "stockInfo",
        },
      },
      {
        $addFields: {
          totalStock: { $ifNull: [{ $arrayElemAt: ["$stockInfo.total", 0] }, 0] },
        },
      },
      {
        $match: {
          $expr: {
            $and: [
              { $gt: ["$totalStock", 0] },
              { $gt: ["$reorderLevel", 0] },
              { $lte: ["$totalStock", "$reorderLevel"] },
            ],
          },
        },
      },
      {
        $project: {
          brandName: 1, productCode: 1, unit: 1,
          manufacturer: 1, totalStock: 1, reorderLevel: 1, updatedAt: 1,
        },
      },
      { $sort: { totalStock: 1 } },
      { $limit: limit },
    ]);

    const [expired, nearExpiry, outOfStock, lowStock] = await Promise.all([
      expiredPromise, nearExpiryPromise, outOfStockPromise, lowStockPromise,
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
    return res.status(500).json({ message: "Failed to load inventory alerts", error: err?.message || err });
  }
};

/**
 * GET /api/dashboard/inventory-alerts/summary?expiryDays=30
 */
export const getInventoryAlertsSummary = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req.user as any)?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const pharmacyObjId = new mongoose.Types.ObjectId(String(pharmacyId));
    const expiryDays = Number(req.query.expiryDays ?? 30);
    const now = new Date();
    const todayStartNepal = startOfDayInTZ(now, DASH_TZ);
    const expiryLimit = new Date(now);
    expiryLimit.setDate(expiryLimit.getDate() + expiryDays);

    const expiredCountPromise = Batch.countDocuments({
      pharmacyId: pharmacyObjId,
      status: "ACTIVE",
      currentQuantity: { $gt: 0 },
      expiryDate: { $lt: todayStartNepal },
    });

    const nearExpiryCountPromise = Batch.countDocuments({
      pharmacyId: pharmacyObjId,
      status: "ACTIVE",
      currentQuantity: { $gt: 0 },
      expiryDate: { $gte: todayStartNepal, $lte: expiryLimit },
    });

    const outOfStockCountPromise = ProductMedicine.aggregate([
      { $match: { pharmacyId: pharmacyObjId, isActive: true } },
      {
        $lookup: {
          from: "batches",
          let: { pid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$productId", "$$pid"] }, status: "ACTIVE" } },
            { $group: { _id: null, total: { $sum: "$currentQuantity" } } },
          ],
          as: "stockInfo",
        },
      },
      {
        $addFields: {
          totalStock: { $ifNull: [{ $arrayElemAt: ["$stockInfo.total", 0] }, 0] },
        },
      },
      { $match: { totalStock: { $lte: 0 } } },
      { $count: "count" },
    ]).then((r: any[]) => r[0]?.count ?? 0);

    const lowStockCountPromise = ProductMedicine.aggregate([
      { $match: { pharmacyId: pharmacyObjId, isActive: true } },
      {
        $lookup: {
          from: "batches",
          let: { pid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$productId", "$$pid"] }, status: "ACTIVE" } },
            { $group: { _id: null, total: { $sum: "$currentQuantity" } } },
          ],
          as: "stockInfo",
        },
      },
      {
        $addFields: {
          totalStock: { $ifNull: [{ $arrayElemAt: ["$stockInfo.total", 0] }, 0] },
        },
      },
      {
        $match: {
          $expr: {
            $and: [
              { $gt: ["$totalStock", 0] },
              { $gt: ["$reorderLevel", 0] },
              { $lte: ["$totalStock", "$reorderLevel"] },
            ],
          },
        },
      },
      { $count: "count" },
    ]).then((r: any[]) => r[0]?.count ?? 0);

    const [expired, nearExpiry, outOfStock, lowStock] = await Promise.all([
      expiredCountPromise, nearExpiryCountPromise, outOfStockCountPromise, lowStockCountPromise,
    ]);

    return res.json({ expiryDays, counts: { expired, nearExpiry, outOfStock, lowStock } });
  } catch (err: any) {
    console.error("Inventory alerts summary error:", err);
    return res.status(500).json({ message: "Failed to load inventory alerts summary", error: err?.message || err });
  }
};

const TOP_SELLING_TZ = "Asia/Kathmandu";

function computeTopSellingRange(range: string) {
  const now = DateTime.now().setZone(TOP_SELLING_TZ);
  if (range === "today") {
    return { label: "today", from: now.startOf("day").toJSDate(), to: now.endOf("day").toJSDate() };
  }
  if (range === "7d") {
    return { label: "7d", from: now.minus({ days: 6 }).startOf("day").toJSDate(), to: now.endOf("day").toJSDate() };
  }
  if (range === "30d") {
    return { label: "30d", from: now.minus({ days: 29 }).startOf("day").toJSDate(), to: now.endOf("day").toJSDate() };
  }
  return { label: "7d", from: now.minus({ days: 6 }).startOf("day").toJSDate(), to: now.endOf("day").toJSDate() };
}

/**
 * GET /api/dashboard/top-selling-medicines?range=today|7d|30d&limit=10
 */
export const getTopSellingMedicines = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req.user as any)?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const pharmacyObjId = new mongoose.Types.ObjectId(String(pharmacyId));
    const rangeParam = String(req.query.range ?? "today");
    const limitRaw = Number(req.query.limit ?? 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;
    const { from, to, label } = computeTopSellingRange(rangeParam);

    const items = await Sale.aggregate([
      { $match: { pharmacyId: pharmacyObjId, createdAt: { $gte: from, $lte: to } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          qtySold: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.total" },
          ordersSet: { $addToSet: "$_id" },
          name: { $last: "$items.productName" },
          unitPrice: { $last: "$items.unitPrice" },
        },
      },
      { $addFields: { ordersCount: { $size: "$ordersSet" } } },
      { $sort: { qtySold: -1, revenue: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          medicineId: "$_id",
          name: 1,
          unitPrice: 1,
          qtySold: 1,
          revenue: 1,
          ordersCount: 1,
        },
      },
    ]);

    return res.json({ range: label, from, to, limit, items });
  } catch (err: any) {
    console.error("Top selling medicines error:", err);
    return res.status(500).json({ message: "Failed to fetch top selling medicines", error: err?.message || err });
  }
};