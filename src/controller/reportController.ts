import { Request, Response } from "express";
import mongoose from "mongoose";
import Sale from "../models/Sale";
import Medicine from "../models/Medicine";

export const getKpiSummary = async (req: Request, res: Response) => {
  try {
    const { range } = req.query;
    // Assuming your auth middleware attaches user to req
    const pharmacyId = (req as any).user.pharmacyId; 

    // 1. Handle Date Range Logic
    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    switch (range) {
      case "yesterday":
        startDate.setDate(startDate.getDate() - 1);
        break;
      case "this_week":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "this_month":
        startDate.setDate(1);
        break;
      case "last_month":
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7); // Default to week
    }

    const queryMatch = {
      pharmacyId: pharmacyId.toString(), // Sale model uses String for pharmacyId
      createdAt: { $gte: startDate },
    };

    // 2. Aggregate Sales Data
    const salesStats = await Sale.aggregate([
      { $match: queryMatch },
      {
        $facet: {
          "basicTotals": [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$totalAmount" },
                count: { $sum: 1 },
              },
            },
          ],
          // ⚠️ Note: This profit calc assumes you add 'costPrice' to your CartItem schema
          // If you haven't added it yet, this will return 0 or NaN
          "profitCalc": [
            { $unwind: "$items" },
            {
              $group: {
                _id: null,
                totalProfit: {
                  $sum: {
                    $multiply: [
                      { $subtract: ["$items.unitPrice", { $ifNull: ["$items.costPrice", 0] }] },
                      "$items.quantity",
                    ],
                  },
                },
              },
            },
          ],
        },
      }
    ]);

    // 3. Aggregate Loss Data (Expired/Disposed)
    const lossStats = await Medicine.aggregate([
      {
        $match: {
          pharmacyId: new mongoose.Types.ObjectId(pharmacyId),
          isDisposed: true,
          disposedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalLoss: { $sum: { $multiply: ["$costPrice", "$stock"] } },
        },
      },
    ]);

    // 4. Format Output
    const data = {
      totalRevenue: salesStats[0].basicTotals[0]?.totalRevenue || 0,
      totalInvoices: salesStats[0].basicTotals[0]?.count || 0,
      grossProfit: salesStats[0].profitCalc[0]?.totalProfit || 0,
      totalLoss: lossStats[0]?.totalLoss || 0,
    };

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};