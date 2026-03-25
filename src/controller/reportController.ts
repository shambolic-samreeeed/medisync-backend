import { Request, Response } from "express";
import mongoose from "mongoose";
import Sale from "../models/Sale";
import Medicine from "../models/Medicine";

export const getDashboardReport = async (req: Request, res: Response) => {
  try {
    const { range } = req.query;
    const pharmacyId = (req as any).user.pharmacyId;

    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    switch (range) {
      case "yesterday": startDate.setDate(startDate.getDate() - 1); break;
      case "this_week": startDate.setDate(startDate.getDate() - 7); break;
      case "this_month": startDate.setDate(1); break;
      case "last_month": 
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(1);
        break;
      default: startDate.setDate(startDate.getDate() - 7);
    }

    const reportData = await Sale.aggregate([
      { 
        $match: { 
          pharmacyId: pharmacyId.toString(), 
          createdAt: { $gte: startDate } 
        } 
      },
      {
        $facet: {
          "kpis": [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$totalAmount" },
                totalInvoices: { $sum: 1 },
                grossProfit: {
                  $sum: {
                    $reduce: {
                      input: "$items",
                      initialValue: 0,
                      in: {
                        $add: [
                          "$$value",
                          {
                            $multiply: [
                              // 🚀 PROFIT CALCULATION: (Selling - Cost) * Qty
                              { $subtract: ["$$this.unitPrice", { $ifNull: ["$$this.costPrice", 0] }] },
                              "$$this.quantity"
                            ]
                          }
                        ]
                      }
                    }
                  }
                }
              }
            }
          ],
          "salesTrend": [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                revenue: { $sum: "$totalAmount" },
                profit: {
                  $sum: {
                    $reduce: {
                      input: "$items",
                      initialValue: 0,
                      in: {
                        $add: [
                          "$$value",
                          {
                            $multiply: [
                              { $subtract: ["$$this.unitPrice", { $ifNull: ["$$this.costPrice", 0] }] },
                              "$$this.quantity"
                            ]
                          }
                        ]
                      }
                    }
                  }
                }
              }
            },
            { $sort: { "_id": 1 } }
          ],
          "paymentMethods": [
            { $group: { _id: "$paymentMethod", value: { $sum: "$totalAmount" } } }
          ],
          "topProducts": [
            { $unwind: "$items" },
            { $group: { _id: "$items.medicineId", name: { $first: "$items.name" }, sold: { $sum: "$items.quantity" }, revenue: { $sum: "$items.total" } } },
            { $sort: { sold: -1 } },
            { $limit: 5 }
          ]
        }
      }
    ]);

    const lossStats = await Medicine.aggregate([
      { $match: { pharmacyId: new mongoose.Types.ObjectId(pharmacyId), isDisposed: true, disposedAt: { $gte: startDate } } },
      { $group: { _id: null, totalLoss: { $sum: { $multiply: ["$costPrice", "$stock"] } } } }
    ]);

    const summary = reportData[0].kpis[0] || { totalRevenue: 0, totalInvoices: 0, grossProfit: 0 };

    return res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalRevenue: summary.totalRevenue,
          totalInvoices: summary.totalInvoices,
          grossProfit: summary.grossProfit,
          totalLoss: lossStats[0]?.totalLoss || 0,
        },
        salesTrend: reportData[0].salesTrend.map((t: any) => ({
          name: new Date(t._id).toLocaleDateString('en-US', { weekday: 'short' }),
          revenue: t.revenue,
          profit: t.profit
        })),
        paymentMethods: reportData[0].paymentMethods.map((p: any) => ({ name: p._id || "Other", value: p.value })),
        topProducts: reportData[0].topProducts.map((p: any) => ({ id: p._id, name: p.name, sold: p.sold, revenue: p.revenue }))
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};