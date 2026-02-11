// /controllers/customerController.ts
import { Request, Response } from "express";
import Customer from "../models/Customer";

// POST /api/customers
export const registerCustomer = async (req: Request, res: Response) => {
  try {
    const { name, phone, email } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone are required." });
    }

    const existing = await Customer.findOne({ phone });
    if (existing) {
      return res.status(400).json({ message: "Customer with this phone already exists." });
    }

    const customer = new Customer({ name, phone, email });
    await customer.save();

    return res.status(201).json({ message: "Customer registered successfully", customer });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ message: error?.message || "Failed to register customer" });
  }
};

// GET /api/customers/:phone
export const getCustomerByPhone = async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;

    const customer = await Customer.findOne({ phone });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.status(200).json(customer);
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ message: error?.message || "Failed to fetch customer" });
  }
};
