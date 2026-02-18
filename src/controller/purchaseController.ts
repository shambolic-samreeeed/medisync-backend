import { Request, Response } from "express";
import mongoose from "mongoose";
import Purchase from "../models/Purchase";
import Supplier from "../models/Supplier";

/**
 * Lean type (keep it simple to avoid TS union issues from mongoose typings)
 * Adjust item fields later if you want strict typing.
 */
type PurchaseLean = {
  _id: mongoose.Types.ObjectId;
  invoiceNumber: string;
  purchaseDate: Date;
  supplierId: any; // populated -> { _id, name }
  items: any[];
  createdAt: Date;
};

/**
 * GET /api/suppliers/:supplierId/purchases
 * Returns purchase invoices for the given supplier scoped to the logged-in pharmacy.
 *
 * Query params:
 * - page (default 1)
 * - limit (default 20, max 100)
 */
export const getSupplierPurchases = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const { supplierId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(supplierId)) {
      return res.status(400).json({ message: "Invalid supplierId" });
    }

    // Ensure supplier belongs to this pharmacy
    const supplier = await Supplier.findOne({ _id: supplierId, pharmacyId }).select("_id name");
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found for this pharmacy" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limitRaw = Number(req.query.limit) || 20;
    const limit = Math.min(100, Math.max(1, limitRaw));
    const skip = (page - 1) * limit;

    const filter = { pharmacyId, supplierId: supplier._id };

    const [total, purchases] = await Promise.all([
      Purchase.countDocuments(filter),
      Purchase.find(filter)
        .sort({ purchaseDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("_id invoiceNumber purchaseDate items createdAt")
        .lean<any[]>(), // ✅ explicitly say this is an array
    ]);

    const data = purchases.map((p: any) => ({
      _id: p._id,
      invoiceNumber: p.invoiceNumber,
      purchaseDate: p.purchaseDate,
      itemsCount: Array.isArray(p.items) ? p.items.length : 0,
      createdAt: p.createdAt,
    }));

    return res.status(200).json({
      supplier: { _id: supplier._id, name: supplier.name },
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to fetch supplier purchases",
      error: error?.message || error,
    });
  }
};

/**
 * GET /api/purchases/:purchaseId
 * Returns details of ONE purchase invoice (including items),
 * scoped to logged-in pharmacy.
 */
export const getPurchaseById = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const { purchaseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
      return res.status(400).json({ message: "Invalid purchaseId" });
    }

    // ✅ strongly type as single object or null (prevents TS union error)
    const purchase = await Purchase.findOne({ _id: purchaseId, pharmacyId })
      .select("_id invoiceNumber purchaseDate supplierId items createdAt")
      .populate("supplierId", "name")
      .lean<PurchaseLean | null>();

    if (!purchase) {
      return res.status(404).json({ message: "Purchase not found for this pharmacy" });
    }

    return res.status(200).json({
      _id: purchase._id,
      invoiceNumber: purchase.invoiceNumber,
      purchaseDate: purchase.purchaseDate,
      supplier: purchase.supplierId, // { _id, name }
      createdAt: purchase.createdAt,
      items: Array.isArray(purchase.items) ? purchase.items : [],
      itemsCount: Array.isArray(purchase.items) ? purchase.items.length : 0,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to fetch purchase details",
      error: error?.message || error,
    });
  }
};
