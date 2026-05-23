// FILE: src/controller/saleController.ts
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: The only changes vs. the original are:
//  1. checkAndNotifyStockLevels() now accepts + forwards `pharmacyId` to email functions.
//  2. sendSaleReceiptEmail() call now includes `pharmacyId`.
//  3. sendOutOfStockAlert / sendLowStockAlert calls now include `pharmacyId`.
//  All sale logic, FEFO batching, and session handling are UNCHANGED.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import Sale from "../models/Sale";
import Batch from "../models/Batch";
import ProductMedicine from "../models/ProductMedicine";
import Customer from "../models/Customer";
import Pharmacy from "../models/Pharmacy";
import {
  sendSaleReceiptEmail,
  sendLowStockAlert,
  sendOutOfStockAlert,
} from "../utils/emailService";

interface SaleItemInput {
  productId: string;
  quantity: number;
}

function normalizePhone(phone: any) {
  return String(phone ?? "").trim();
}

/**
 * After a sale, check all sold products for low/out-of-stock and notify the pharmacy.
 * This runs asynchronously after the response is sent.
 *
 * `pharmacyId` is now passed through to every email function so each pharmacy
 * uses its own SMTP configuration (multi-tenant requirement).
 */
async function checkAndNotifyStockLevels(
  pharmacyId: string,
  productIds: mongoose.Types.ObjectId[],
  pharmacyEmail: string,
  pharmacyName: string
) {
  try {
    const products = await ProductMedicine.find({
      _id: { $in: productIds },
      pharmacyId,
      isActive: true,
    }).lean();

    const outOfStock: Array<{ brandName: string }> = [];
    const lowStock: Array<{ brandName: string; currentStock: number; reorderLevel: number }> = [];

    for (const product of products) {
      const stockAgg = await Batch.aggregate([
        {
          $match: {
            pharmacyId: new mongoose.Types.ObjectId(pharmacyId),
            productId: product._id,
            status: "ACTIVE",
          },
        },
        { $group: { _id: null, totalStock: { $sum: "$currentQuantity" } } },
      ]);

      const totalStock = stockAgg[0]?.totalStock ?? 0;
      const reorderLevel = product.reorderLevel ?? 0;

      if (totalStock <= 0) {
        outOfStock.push({ brandName: product.brandName });
      } else if (reorderLevel > 0 && totalStock <= reorderLevel) {
        lowStock.push({ brandName: product.brandName, currentStock: totalStock, reorderLevel });
      }
    }

    // ── Multi-tenant: pharmacyId tells emailService which SMTP config to use ─
    if (outOfStock.length > 0) {
      await sendOutOfStockAlert({ pharmacyId, pharmacyEmail, pharmacyName, items: outOfStock });
    }
    if (lowStock.length > 0) {
      await sendLowStockAlert({ pharmacyId, pharmacyEmail, pharmacyName, items: lowStock });
    }
  } catch (err: any) {
    // Gracefully handle missing SMTP config (pharmacy hasn't set up email yet)
    if (err.message?.includes("No email configuration") || err.message?.includes("incomplete SMTP")) {
      console.warn(`[Email] Stock alert skipped for pharmacy ${pharmacyId} — SMTP not configured.`);
    } else {
      console.error("Stock notification error:", err);
    }
  }
}

export const createSale = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) {
      await session.abortTransaction();
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const data = req.body;
    const items = data.items as SaleItemInput[];
    if (!items?.length) throw new Error("No items provided for sale");

    // Customer resolution
    const phone = data.customerPhone ? normalizePhone(data.customerPhone) : "";
    let resolvedCustomerName = "Walk-in Customer";
    let resolvedCustomerEmail: string | undefined;

    if (phone) {
      const customer = await Customer.findOne({ pharmacyId, phone })
        .select("name email")
        .session(session);
      if (customer) {
        resolvedCustomerName = customer.name || "Registered Customer";
        resolvedCustomerEmail = (customer as any).email || undefined;
      } else if (data.customerName?.trim()) {
        resolvedCustomerName = data.customerName.trim();
      }
    } else if (data.customerName?.trim()) {
      resolvedCustomerName = data.customerName.trim();
    }

    if (!resolvedCustomerEmail && data.customerEmail?.trim()) {
      resolvedCustomerEmail = data.customerEmail.trim();
    }

    let totalAmount = 0;
    const saleItems: any[] = [];
    const soldProductIds: mongoose.Types.ObjectId[] = [];

    for (const item of items) {
      let remaining = Number(item.quantity);
      if (!remaining || remaining <= 0) throw new Error("Each item must have quantity > 0");

      const product = await ProductMedicine.findOne({
        _id: item.productId,
        pharmacyId,
        isActive: true,
        posStatus: "ACTIVE",
      }).session(session);
      if (!product) throw new Error(`Product ${item.productId} not available for sale`);

      soldProductIds.push(product._id as mongoose.Types.ObjectId);

      // FEFO: oldest expiry first
      const candidates = await Batch.find({
        pharmacyId,
        productId: item.productId,
        status: "ACTIVE",
        currentQuantity: { $gt: 0 },
        expiryDate: { $gt: new Date() },
      })
        .sort({ expiryDate: 1, createdAt: 1 })
        .session(session);

      for (const batch of candidates) {
        if (remaining <= 0) break;
        const take = Math.min(batch.currentQuantity, remaining);

        const updated = await Batch.findOneAndUpdate(
          { _id: batch._id, currentQuantity: { $gte: take }, status: "ACTIVE" },
          {
            $inc: { currentQuantity: -take },
            ...(batch.currentQuantity === take && { $set: { status: "DEPLETED" } }),
          },
          { new: true, session }
        );
        if (!updated) continue;

        const lineTotal = batch.sellingPrice * take;
        totalAmount += lineTotal;

        saleItems.push({
          productId: product._id,
          batchId: batch._id,
          productName: product.brandName,
          batchNumber: batch.batchNumber,
          quantity: take,
          unitPrice: batch.sellingPrice,
          costPrice: batch.costPrice,
          total: lineTotal,
        });

        remaining -= take;
      }

      if (remaining > 0) {
        throw new Error(`Insufficient stock for ${product.brandName}. Short by ${remaining} unit(s).`);
      }
    }

    const paidAmount = data.paidAmount ?? totalAmount;
    const change = paidAmount - totalAmount;
    if (change < 0) throw new Error("Paid amount is less than total amount due");

    const invoiceNumber = `INV-${Date.now()}`;

    const [saleRecord] = await Sale.create(
      [
        {
          pharmacyId,
          saleId: uuidv4(),
          items: saleItems,
          totalAmount,
          paidAmount,
          change,
          customerName: resolvedCustomerName,
          customerPhone: phone || "Walk-in",
          customerEmail: resolvedCustomerEmail,
          paymentMethod: data.paymentMethod || "CASH",
          invoiceNumber,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // ── Post-sale async side effects (non-blocking) ──────────────────────────
    const pharmacyObjId = new mongoose.Types.ObjectId(String(pharmacyId));

    setImmediate(async () => {
      try {
        const pharmacy = await Pharmacy.findById(pharmacyObjId)
          .select("name email address phone")
          .lean();

        if (!pharmacy) {
          console.error("[Email] Pharmacy not found for id:", pharmacyId);
          return;
        }

        console.log("[Email] Pharmacy found:", pharmacy.name, "| pharmacy email:", pharmacy.email);
        console.log("[Email] Customer email:", resolvedCustomerEmail ?? "none (walk-in)");

        // 1. Send customer receipt (uses pharmacy's own SMTP via pharmacyId)
        if (resolvedCustomerEmail) {
          try {
            await sendSaleReceiptEmail({
              pharmacyId,              // ← multi-tenant: determines which SMTP to use
              customerEmail: resolvedCustomerEmail,
              customerName: resolvedCustomerName,
              pharmacyName: pharmacy.name,
              pharmacyAddress: (pharmacy as any).address,
              pharmacyPhone: (pharmacy as any).phone,
              invoiceNumber,
              items: saleItems.map((si) => ({
                productName: si.productName,
                batchNumber: si.batchNumber,
                quantity: si.quantity,
                unitPrice: si.unitPrice,
                total: si.total,
              })),
              totalAmount,
              paidAmount,
              change,
              paymentMethod: data.paymentMethod || "CASH",
              saleDate: new Date(),
            });
            console.log("[Email] Receipt sent to:", resolvedCustomerEmail);
          } catch (emailErr: any) {
            if (emailErr.message?.includes("No email configuration") || emailErr.message?.includes("incomplete SMTP")) {
              console.warn(`[Email] Receipt skipped for pharmacy ${pharmacyId} — SMTP not configured.`);
            } else {
              console.error("[Email] Failed to send receipt:", emailErr);
            }
          }
        }

        // 2. Check stock levels and notify pharmacy (uses pharmacy's own SMTP)
        if (pharmacy.email) {
          try {
            await checkAndNotifyStockLevels(pharmacyId, soldProductIds, pharmacy.email, pharmacy.name);
          } catch (stockErr) {
            console.error("[Email] Failed to send stock alert:", stockErr);
          }
        } else {
          console.warn("[Email] No pharmacy email set — skipping stock alerts.");
        }
      } catch (err) {
        console.error("[Email] Post-sale email block failed:", err);
      }
    });

    return res.status(201).json({
      success: true,
      message: "Sale processed successfully",
      sale: saleRecord,
    });
  } catch (err: any) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    console.error("Sale error:", err);
    return res.status(400).json({ success: false, message: err.message || "Sale failed" });
  }
};

/**
 * GET /api/sales/recent?limit=10&page=1
 */
export const getRecentSales = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized" });

    const pharmacyObjId = new mongoose.Types.ObjectId(String(pharmacyId));
    const limit = Math.min(Number(req.query.limit ?? 10), 50);
    const page  = Math.max(Number(req.query.page  ?? 1), 1);
    const skip  = (page - 1) * limit;

    const [total, sales] = await Promise.all([
      Sale.countDocuments({ pharmacyId: pharmacyObjId }),
      Sale.find({ pharmacyId: pharmacyObjId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("invoiceNumber customerName totalAmount paymentMethod createdAt items")
        .lean(),
    ]);

    const data = sales.map((s: any) => ({
      _id:           s._id,
      invoiceNumber: s.invoiceNumber,
      customerName:  s.customerName || "Walk-in Customer",
      totalAmount:   s.totalAmount,
      paymentMethod: s.paymentMethod || "Cash",
      itemCount:     s.items?.length ?? 0,
      createdAt:     s.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch recent sales", error: err.message });
  }
};

/**
 * GET /api/sales/stats
 */
export const getSalesStats = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized" });

    const pharmacyObjId = new mongoose.Types.ObjectId(String(pharmacyId));

    const { from, to } = req.query;
    const matchBase: any = { pharmacyId: pharmacyObjId };
    if (from || to) {
      matchBase.createdAt = {};
      if (from) matchBase.createdAt.$gte = new Date(String(from));
      if (to)   matchBase.createdAt.$lte = new Date(String(to));
    }

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const [overallAgg, todayAgg, paymentBreakdown] = await Promise.all([
      Sale.aggregate([
        { $match: matchBase },
        { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" }, totalSales: { $sum: 1 }, avgOrderValue: { $avg: "$totalAmount" }, maxSale: { $max: "$totalAmount" } } },
      ]),
      Sale.aggregate([
        { $match: { pharmacyId: pharmacyObjId, createdAt: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: null, todayRevenue: { $sum: "$totalAmount" }, todaySales: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        { $match: matchBase },
        { $group: { _id: "$paymentMethod", count: { $sum: 1 }, total: { $sum: "$totalAmount" } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const overall = overallAgg[0] ?? { totalRevenue: 0, totalSales: 0, avgOrderValue: 0, maxSale: 0 };
    const today   = todayAgg[0]   ?? { todayRevenue: 0, todaySales: 0 };

    return res.status(200).json({
      success: true,
      data: {
        totalRevenue:   overall.totalRevenue,
        totalSales:     overall.totalSales,
        avgOrderValue:  Math.round(overall.avgOrderValue ?? 0),
        maxSale:        overall.maxSale,
        todayRevenue:   today.todayRevenue,
        todaySales:     today.todaySales,
        paymentBreakdown: paymentBreakdown.map((p: any) => ({
          method: p._id || "Cash",
          count:  p.count,
          total:  p.total,
        })),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch sales stats", error: err.message });
  }
};

/**
 * GET /api/sales/:id
 */
export const getSaleById = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized" });

    const pharmacyObjId = new mongoose.Types.ObjectId(String(pharmacyId));
    const saleObjId     = new mongoose.Types.ObjectId(String(req.params.id));

    const sale = await Sale.findOne({ _id: saleObjId, pharmacyId: pharmacyObjId }).lean();
    if (!sale) return res.status(404).json({ message: "Sale not found" });

    return res.status(200).json({ success: true, data: sale });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch sale details", error: err.message });
  }
};
