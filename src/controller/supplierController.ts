import { Request, Response } from "express";
import Supplier from "../models/Supplier";

// CREATE supplier
export const createSupplier = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });

    const { name, contactPerson, phone, email, address } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: "Supplier name is required" });
    }

    const supplier = await Supplier.create({
      pharmacyId,
      name: name.trim(),
      contactPerson: contactPerson?.trim(),
      phone: phone?.trim(),
      email: email?.trim(),
      address: address?.trim(),
    });

    return res.status(201).json({ message: "Supplier created ", data: supplier });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Supplier name already exists for this pharmacy" });
    }
    return res.status(500).json({ message: "Failed to create supplier", error: error?.message || error });
  }
};

// GET all suppliers for pharmacy
export const getSuppliers = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });

    const searchTerm = (req.query.search as string)?.trim();
    const filter: any = { pharmacyId };
    if (searchTerm) {
      filter.$or = [
        { name: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
        { phone: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [total, suppliers] = await Promise.all([
      Supplier.countDocuments(filter),
      Supplier.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    ]);

    return res.status(200).json({
      data: suppliers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to fetch suppliers", error: error?.message || error });
  }
};

// GET single supplier
export const getSupplierById = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });

    const { id } = req.params;

    const supplier = await Supplier.findOne({ _id: id, pharmacyId });
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    return res.status(200).json(supplier);
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to fetch supplier", error: error?.message || error });
  }
};

// UPDATE supplier
export const updateSupplier = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });

    const { id } = req.params;
    const { name, contactPerson, phone, email, address } = req.body;

    const supplier = await Supplier.findOne({ _id: id, pharmacyId });
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    if (name !== undefined) supplier.name = name.trim();
    if (contactPerson !== undefined) supplier.contactPerson = contactPerson?.trim();
    if (phone !== undefined) supplier.phone = phone?.trim();
    if (email !== undefined) supplier.email = email?.trim();
    if (address !== undefined) supplier.address = address?.trim();

    await supplier.save();

    return res.status(200).json({ message: "Supplier updated ", data: supplier });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Supplier name already exists for this pharmacy" });
    }
    return res.status(500).json({ message: "Failed to update supplier", error: error?.message || error });
  }
};

// DELETE supplier
export const deleteSupplier = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });

    const { id } = req.params;

    const supplier = await Supplier.findOneAndDelete({ _id: id, pharmacyId });
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    return res.status(200).json({ message: "Supplier deleted " });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to delete supplier", error: error?.message || error });
  }
};
