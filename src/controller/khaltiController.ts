// controllers/khaltiController.ts
import axios from "axios";
import { Response } from "express";
import { PharmacySettings } from "../models/PharmacySettings";
import { AuthRequest } from "./settingsController";

export const initiateKhaltiPayment = async (req: AuthRequest, res: Response) => {
  try {
    // 1. Get the logged-in pharmacy's ID from your auth token
    const pharmacyId = req.user!.pharmacyId; 
    const { amount, purchase_order_id, purchase_order_name } = req.body;

    if (!amount || !purchase_order_id) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // 2. Fetch this specific pharmacy's settings from the database
    const settings = await PharmacySettings.findOne({ pharmacyId });

    // 3. Security Check: Did they actually save their Khalti key in settings?
    if (!settings || !settings.khaltiSecretKey) {
      return res.status(400).json({ 
        success: false, 
        message: "Khalti is not configured. Please add your Khalti Secret Key in Settings." 
      });
    }

    // 4. Use THEIR specific secret key for the transaction
    const merchantSecretKey = settings.khaltiSecretKey;

    // 5. Initiate the payment

    const FRONTEND_URL = "https://medisync-mauve.vercel.app"
    const response = await axios.post(
      "https://a.khalti.com/api/v2/epayment/initiate/",
      {
        return_url: `${FRONTEND_URL}/payment-success`,
        website_url: FRONTEND_URL,
        amount: amount * 100, 
        purchase_order_id,
        purchase_order_name,
      },
      {
        headers: {
          // Dynamically injecting their key!
          Authorization: `Key ${merchantSecretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.status(200).json({ success: true, data: response.data });

  } catch (error: any) {
    console.error("Khalti API Error:", error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to initiate Khalti payment", 
      error: error.response?.data || error.message 
    });
  }
};