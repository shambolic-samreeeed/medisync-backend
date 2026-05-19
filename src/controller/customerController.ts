import { Request, Response } from "express";
import mongoose from "mongoose";
import Customer from "../models/Customer";
import Sale from "../models/Sale";

function getPharmacyIdOrFail(req: Request, res: Response): string | null {
  const pharmacyId = req.user?.pharmacyId;
  if (!pharmacyId) {
    res.status(401).json({ message: "Unauthorized (missing pharmacyId)" });
    return null;
  }
  return pharmacyId;
}

/**
 * POST /api/customers
 * Create customer (auto assigns pharmacyId from token)
 */
export async function createCustomer(req: Request, res: Response) {
  try {
    const pharmacyId = getPharmacyIdOrFail(req, res);
    if (!pharmacyId) return;

    const { name, phone, email, address } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: "name and phone are required" });
    }

    const customer = await Customer.create({
      pharmacyId,
      name,
      phone,
      email,
      address,
    });

    return res.status(201).json(customer);
  } catch (err: any) {
    // Handle duplicate phone per pharmacy
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ message: "Customer with this phone already exists" });
    }
    return res.status(500).json({ message: "Error creating customer" });
  }
}

/**
 * GET /api/customers
 * List customers for this pharmacy only
 *
 * Supported query params:
 * - ?q=...        -> fuzzy search by name/phone/email
 * - ?phone=...    -> exact lookup by phone (POS use-case)
 *
 * Examples:
 * - GET /api/customers
 * - GET /api/customers?q=ram
 * - GET /api/customers?phone=9800000000
 */

export async function getCustomers(req: Request, res: Response) {
  try {
    const pharmacyId = getPharmacyIdOrFail(req, res);
    if (!pharmacyId) return;

    const { phone, name, email } = req.query;

    const filter: any = { pharmacyId };

    // POS: exact phone lookup (fast) — no pagination needed
    if (phone) {
      filter.phone = String(phone).trim();
      const customer = await Customer.findOne(filter);
      return res.json(customer); // null if not found
    }

    // Search by name (fuzzy)
    if (name) {
      filter.name = { $regex: String(name).trim(), $options: "i" };
    }

    // Search by email
    if (email) {
      filter.email = { $regex: String(email).trim(), $options: "i" };
    }

    // ── Pagination ───────────────────────────────────────────────────────────
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [total, customers] = await Promise.all([
      Customer.countDocuments(filter),
      Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);

    return res.json({
      data: customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch {
    return res.status(500).json({ message: "Error fetching customers" });
  }
}


/**
 * GET /api/customers/:id
 * Get single customer (must belong to this pharmacy)
 */
export async function getCustomerById(req: Request, res: Response) {
  try {
    const pharmacyId = getPharmacyIdOrFail(req, res);
    if (!pharmacyId) return;

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    const customer = await Customer.findOne({ _id: id, pharmacyId });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.json(customer);
  } catch {
    return res.status(500).json({ message: "Error fetching customer" });
  }
}

/**
 * PUT /api/customers/:id
 * Update customer (must belong to this pharmacy)
 */
export async function updateCustomer(req: Request, res: Response) {
  try {
    const pharmacyId = getPharmacyIdOrFail(req, res);
    if (!pharmacyId) return;

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    // Never allow changing pharmacyId from body
    const { pharmacyId: _ignore, ...updates } = req.body;

    const updated = await Customer.findOneAndUpdate(
      { _id: id, pharmacyId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.json(updated);
  } catch (err: any) {
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ message: "Customer with this phone already exists" });
    }
    return res.status(500).json({ message: "Error updating customer" });
  }
}

/**
 * DELETE /api/customers/:id
 * Delete customer (must belong to this pharmacy)
 */
export async function deleteCustomer(req: Request, res: Response) {
  try {
    const pharmacyId = getPharmacyIdOrFail(req, res);
    if (!pharmacyId) return;

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    const deleted = await Customer.findOneAndDelete({ _id: id, pharmacyId });
    if (!deleted) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.json({ message: "Customer deleted" });
  } catch {
    return res.status(500).json({ message: "Error deleting customer" });
  }
}


/**
 * GET /api/customers/stats
 * KPI summary: total customers, new this month, top spenders.
 * Must be registered BEFORE the /:id route to avoid being swallowed by it.
 */
export async function getCustomerStats(req: Request, res: Response) {
  try {
    const pharmacyId = getPharmacyIdOrFail(req, res);
    if (!pharmacyId) return;

    const pharmacyObjId = new mongoose.Types.ObjectId(String(pharmacyId));

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalCustomers, newThisMonth, spendAgg] = await Promise.all([
      Customer.countDocuments({ pharmacyId }),
      Customer.countDocuments({ pharmacyId, createdAt: { $gte: monthStart } }),

      // Total lifetime spend per registered customer (matched by phone)
      Sale.aggregate([
        { $match: { pharmacyId: pharmacyObjId } },
        {
          $lookup: {
            from: "customers",
            let: { phone: "$customerPhone" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$phone", "$$phone"] },
                      { $eq: ["$pharmacyId", pharmacyObjId] },
                    ],
                  },
                },
              },
            ],
            as: "customerDoc",
          },
        },
        { $unwind: "$customerDoc" }, // only registered customers
        {
          $group: {
            _id: "$customerDoc._id",
            customerName: { $first: "$customerDoc.name" },
            customerPhone: { $first: "$customerDoc.phone" },
            customerEmail: { $first: "$customerDoc.email" },
            totalSpend: { $sum: "$totalAmount" },
            totalOrders: { $sum: 1 },
            lastOrderAt: { $max: "$createdAt" },
          },
        },
        { $sort: { totalSpend: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const totalSpendAll = spendAgg.reduce((s: number, c: any) => s + c.totalSpend, 0);

    return res.json({
      success: true,
      data: {
        totalCustomers,
        newThisMonth,
        totalSpendAll,
        topSpenders: spendAgg.map((c: any) => ({
          customerId:    c._id,
          name:          c.customerName,
          phone:         c.customerPhone,
          email:         c.customerEmail,
          totalSpend:    c.totalSpend,
          totalOrders:   c.totalOrders,
          lastOrderAt:   c.lastOrderAt,
        })),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch customer stats", error: err.message });
  }
}

/**
 * GET /api/customers/:id/transactions?page=1&limit=10
 * All sales for a specific customer (matched by phone from their Customer record).
 */
export async function getCustomerTransactions(req: Request, res: Response) {
  try {
    const pharmacyId = getPharmacyIdOrFail(req, res);
    if (!pharmacyId) return;

    const pharmacyObjId = new mongoose.Types.ObjectId(String(pharmacyId));

    const customer = await Customer.findOne({ _id: req.params.id, pharmacyId });
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip  = (page - 1) * limit;

    const filter = { pharmacyId: pharmacyObjId, customerPhone: customer.phone };

    const [total, sales, spendAgg] = await Promise.all([
      Sale.countDocuments(filter),
      Sale.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("invoiceNumber totalAmount paymentMethod createdAt items")
        .lean(),
      Sale.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalSpend:  { $sum: "$totalAmount" },
            totalOrders: { $sum: 1 },
            avgOrder:    { $avg: "$totalAmount" },
            lastOrderAt: { $max: "$createdAt" },
          },
        },
      ]),
    ]);

    const summary = spendAgg[0] ?? { totalSpend: 0, totalOrders: 0, avgOrder: 0, lastOrderAt: null };

    return res.json({
      success: true,
      customer: {
        _id:   customer._id,
        name:  customer.name,
        phone: customer.phone,
        email: customer.email,
      },
      summary: {
        totalSpend:  summary.totalSpend,
        totalOrders: summary.totalOrders,
        avgOrder:    Math.round(summary.avgOrder ?? 0),
        lastOrderAt: summary.lastOrderAt,
      },
      data: sales.map((s: any) => ({
        _id:           s._id,
        invoiceNumber: s.invoiceNumber,
        totalAmount:   s.totalAmount,
        paymentMethod: s.paymentMethod,
        itemCount:     s.items?.length ?? 0,
        createdAt:     s.createdAt,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch customer transactions", error: err.message });
  }
}