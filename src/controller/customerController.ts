import { Request, Response } from "express";
import mongoose from "mongoose";
import Customer from "../models/Customer";

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
 */
export async function getCustomers(req: Request, res: Response) {
  try {
    const pharmacyId = getPharmacyIdOrFail(req, res);
    if (!pharmacyId) return;

    const q = (req.query.q as string | undefined)?.trim();

    const filter: any = { pharmacyId };
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ];
    }

    const customers = await Customer.find(filter).sort({ createdAt: -1 });

    return res.json(customers);
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
