import { Request, Response } from "express";
import mongoose from "mongoose";
import Sale from "../models/Sale";
import Medicine from "../models/Medicine";

/**
 * @route   GET /api/reports/dashboard
 * @desc    Get complete financial analytics (KPIs, Charts, Top Products)
 * @access  Private
 */
export const getDashboardReport = async (req: Request, res: Response) => {
  try {
    const { range } = req.query;
    const pharmacyId = (req as any).user.pharmacyId;

    // 1. Precise Date Logic
    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    let dateFormat = "%Y-%m-%d"; // Default: Group by Day

    switch (range) {
      case "today":
        // Stay at today 00:00
        break;
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
        startDate.setDate(startDate.getDate() - 7);
    }

    // 2. Main Aggregation Pipeline (Faceting for Speed)
    const reportData = await Sale.aggregate([
      { 
        $match: { 
          pharmacyId: pharmacyId.toString(), 
          createdAt: { $gte: startDate } 
        } 
      },
      {
        $facet: {
          // --- KPI SUMMARY ---
          "kpis": [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$totalAmount" },
                totalInvoices: { $sum: 1 },
                // Profit = (Selling Price - Cost Price) * Quantity
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

          // --- SALES TREND (Bar Chart) ---
          "salesTrend": [
            {
              $group: {
                _id: { $dateToString: { format: dateFormat, date: "$createdAt" } },
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
            { $sort: { "_id": 1 } },
            { 
              $project: { 
                _id: 0, 
                name: "$_id", 
                revenue: 1, 
                profit: 1 
              } 
            }
          ],

          // --- PAYMENT METHODS (Pie Chart) ---
          "paymentMethods": [
            {
              $group: {
                _id: { $ifNull: ["$paymentMethod", "Unknown"] },
                value: { $sum: "$totalAmount" }
              }
            },
            { $project: { _id: 0, name: "$_id", value: 1 } }
          ],

          // --- TOP PRODUCTS (Table) ---
          "topProducts": [
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.medicineId",
                name: { $first: "$items.name" },
                sold: { $sum: "$items.quantity" },
                revenue: { $sum: "$items.total" }
              }
            },
            { $sort: { sold: -1 } },
            { $limit: 5 },
            { $project: { _id: 0, id: "$_id", name: 1, sold: 1, revenue: 1 } }
          ]
        }
      }
    ]);

    // 3. Loss Data from Expired/Disposed items
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

    // 4. Final Formatting for Frontend
    const summary = reportData[0].kpis[0] || { totalRevenue: 0, totalInvoices: 0, grossProfit: 0 };
    
    // Add day names to trend if needed (optional formatting)
    const formattedTrend = reportData[0].salesTrend.map((t: any) => ({
      ...t,
      name: new Date(t.name).toLocaleDateString('en-US', { weekday: 'short' })
    }));

    return res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalRevenue: summary.totalRevenue,
          totalInvoices: summary.totalInvoices,
          grossProfit: summary.grossProfit,
          totalLoss: lossStats[0]?.totalLoss || 0,
        },
        salesTrend: formattedTrend,
        paymentMethods: reportData[0].paymentMethods,
        topProducts: reportData[0].topProducts
      }
    });

  } catch (error: any) {
    console.error("Report Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};