import { Response } from "express";
import Sale from "../models/Sale";
import Customer from "../models/Customer";
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
    return 100; // or return null and show "NEW"
  }
  return Math.round(((today - yesterday) / Math.abs(yesterday)) * 100);
}

export const getDashboardKPIs = async (req: any, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const now = new Date();

    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yesterdayStart = startOfDay(y);
    const yesterdayEnd = endOfDay(y);

    const expiryDays = Number(req.query.expiryDays ?? 30);
    const expiryLimitToday = new Date(now);
    expiryLimitToday.setDate(expiryLimitToday.getDate() + expiryDays);

    const expiryLimitYesterday = new Date(yesterdayStart);
    expiryLimitYesterday.setDate(expiryLimitYesterday.getDate() + expiryDays);

    const [
      todaySalesAgg,
      yesterdaySalesAgg,

      totalCustomersToday,
      totalCustomersYesterday,

      lowStockToday,
      lowStockYesterday,

      nearExpiryToday,
      nearExpiryYesterday,
    ] = await Promise.all([
      // Sales
      Sale.aggregate([
        { $match: { pharmacyId, createdAt: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Sale.aggregate([
        { $match: { pharmacyId, createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),

      // Customers (two choices)
      // Option A: total customers in DB (this won't change much day-to-day unless you create customers daily)
      Customer.countDocuments({ pharmacyId }),
      // "Yesterday" for total customers doesn't really make sense unless you track createdAt.
      // If you DO have createdAt on Customer, use this instead:
      Customer.countDocuments({ pharmacyId, createdAt: { $lte: yesterdayEnd } }),

      // Low stock count
      Medicine.countDocuments({
        pharmacyId,
        stock: { $gt: 0 },
        $expr: { $lte: ["$stock", "$reorderLevel"] },
      }),
      // Yesterday low-stock is tricky because stock changes.
      // For now: compare against the same current data but it won’t reflect yesterday precisely unless you snapshot.
      // Better approach: compare "today vs yesterday" low stock by using sales/purchases history or snapshots.
      Medicine.countDocuments({
        pharmacyId,
        stock: { $gt: 0 },
        $expr: { $lte: ["$stock", "$reorderLevel"] },
      }),

      // Near expiry count
      Medicine.countDocuments({
        pharmacyId,
        stock: { $gt: 0 },
        expiryDate: { $gte: now, $lte: expiryLimitToday },
      }),
      Medicine.countDocuments({
        pharmacyId,
        stock: { $gt: 0 },
        expiryDate: { $gte: yesterdayStart, $lte: expiryLimitYesterday },
      }),
    ]);

    const todaySales = todaySalesAgg?.[0]?.total ?? 0;
    const yesterdaySales = yesterdaySalesAgg?.[0]?.total ?? 0;

    // customers: if you don't have createdAt, set yesterday = today (delta 0)
    const customersToday = totalCustomersToday ?? 0;
    const customersYesterday = totalCustomersYesterday ?? customersToday;

    const lowStockItemsToday = lowStockToday ?? 0;
    const lowStockItemsYesterday = lowStockYesterday ?? lowStockItemsToday;

    const nearExpiryTodayCount = nearExpiryToday ?? 0;
    const nearExpiryYesterdayCount = nearExpiryYesterday ?? nearExpiryTodayCount;

    return res.json({
      todaysSales: {
        value: todaySales,
        deltaPct: calcDeltaPct(todaySales, yesterdaySales),
      },
      totalCustomers: {
        value: customersToday,
        deltaPct: calcDeltaPct(customersToday, customersYesterday),
      },
      lowStockItems: {
        value: lowStockItemsToday,
        deltaPct: calcDeltaPct(lowStockItemsToday, lowStockItemsYesterday),
      },
      nearingExpiry: {
        value: nearExpiryTodayCount,
        deltaPct: calcDeltaPct(nearExpiryTodayCount, nearExpiryYesterdayCount),
      },
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: "Failed to load KPI stats" });
  }
};
