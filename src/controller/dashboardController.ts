import { Request, Response } from "express";
import Stats from "../models/Stats";
import Sale, { SaleDocument } from "../models/Sale";

/**
 * GET /api/dashboard
 * Returns the full dashboard stats document (cumulative totals, dailyStats, bestSelling, etc.)
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    // Fetch the single Stats document
    const stats = await Stats.findById("dashboardStats");

    if (!stats) {
      return res.status(404).json({ message: "No stats available yet" });
    }

    res.status(200).json(stats);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch dashboard stats", error });
  }
};

/**
 * GET /api/dashboard/today
 * Returns only today's stats:
 * - totalRevenue
 * - totalItemsSold
 * - totalSales
 * - bestSelling (top 5 medicines sold today)
 */
export const getTodayStats = async (req: Request, res: Response) => {
  try {
    // Set start and end of today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Fetch all sales for today
    const todaySales = await Sale.find({
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });

    let totalRevenue = 0;
    let totalItemsSold = 0;
    const totalSales = todaySales.length;

    // Map to track best-selling medicines for today
    const medicineMap: Record<string, { name: string; quantity: number }> = {};

    todaySales.forEach((sale: SaleDocument) => {
      // totalAmount might be null/undefined
      totalRevenue += sale.totalAmount ?? 0;

      sale.items.forEach(item => {
        // quantity might be undefined
        const quantity = item.quantity ?? 0;
        const medId = item.medicineId ?? "unknown";

        totalItemsSold += quantity;

        if (medicineMap[medId]) {
          medicineMap[medId].quantity += quantity;
        } else {
          medicineMap[medId] = { name: item.name ?? "Unknown", quantity };
        }
      });
    });

    // Convert map to array and sort by quantity sold
    const bestSelling = Object.entries(medicineMap)
      .map(([medicineId, data]) => ({
        medicineId,
        name: data.name,
        totalSold: data.quantity
      }))
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 5); // top 5 medicines

    // Return today's stats
    res.status(200).json({
      totalRevenue,
      totalItemsSold,
      totalSales,
      bestSelling
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch today's stats", error });
  }
};
