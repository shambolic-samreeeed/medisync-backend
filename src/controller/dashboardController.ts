import { Request, Response } from "express";
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

export async function getDashboardKPIs(req: any, res: Response) {
  try {
    const pharmacyId = req.user.pharmacyId;

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const expiryDays = Number(req.query.expiryDays ?? 30);
    const expiryLimit = new Date(now);
    expiryLimit.setDate(expiryLimit.getDate() + expiryDays);

    // Run queries in parallel
    const [todaysSalesAgg, totalCustomers, lowStockCount, nearExpiryCount] =
      await Promise.all([
        Sale.aggregate([
          { $match: { pharmacyId, createdAt: { $gte: todayStart, $lte: todayEnd } } },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } }
        ]),
        Customer.countDocuments({ pharmacyId }),
        Medicine.countDocuments({
          pharmacyId,
          stock: { $gt: 0 },
          $expr: { $lte: ["$stock", "$reorderLevel"] }
        }),
        Medicine.countDocuments({
          pharmacyId,
          stock: { $gt: 0 },
          expiryDate: { $gte: now, $lte: expiryLimit }
        })
      ]);

    const todaysSales = todaysSalesAgg?.[0]?.total ?? 0;

    // Delta % (optional — do later)
    res.json({
      todaysSales: { value: todaysSales, deltaPct: null },
      totalCustomers: { value: totalCustomers, deltaPct: null },
      lowStockItems: { value: lowStockCount, deltaPct: null },
      nearingExpiry: { value: nearExpiryCount, deltaPct: null }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load dashboard KPIs" });
  }
}
