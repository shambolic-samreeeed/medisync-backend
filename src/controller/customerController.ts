// controller/customerController.ts
import { Request, Response } from "express";
import Customer from "../models/Customer";

interface CustomerInput {
  name: string;
  phone: string;
  email?: string;
}

// Create/register a new customer
export const createCustomer = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req.user as any)?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const { name, phone, email }: CustomerInput = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone are required." });
    }

    // Check if customer with this phone already exists for this pharmacy
    const existing = await Customer.findOne({ pharmacyId, phone });
    if (existing) {
      return res.status(400).json({ message: "Customer with this phone already exists." });
    }

    const customer = new Customer({
      pharmacyId, // ✅ links customer to logged-in pharmacy
      name,
      phone,
      email,
    });

    await customer.save();

    return res.status(201).json({
      message: "Customer registered successfully",
      customer,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ message: "Failed to create customer", error: error?.message });
  }
};

// Find customer by phone (for checkout)
export const findCustomerByPhone = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req.user as any)?.pharmacyId;
    const { phone } = req.params;

    const customer = await Customer.findOne({ pharmacyId, phone });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.json({ customer });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ message: "Failed to find customer", error: error?.message });
  }
};
