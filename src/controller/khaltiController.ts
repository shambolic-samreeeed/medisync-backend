import axios from "axios";
import { Response } from "express";
import { PharmacySettings } from "../models/PharmacySettings";
import { AuthRequest } from "./settingsController"; 

/**
 * Initiates a Khalti E-Payment request.
 * This works for both Test and Live Secret Keys.
 */
export const initiateKhaltiPayment = async (req: AuthRequest, res: Response) => {
  try {
    // 1. Identify the pharmacy from the JWT token
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ success: false, message: "Unauthorized: No pharmacy associated with this user." });
    }

    const { amount, purchase_order_id, purchase_order_name } = req.body;

    // 2. Validation: Khalti requires a minimum of Rs 10 (1000 Paisa)
    if (!amount || amount < 10) {
      return res.status(400).json({ 
        success: false, 
        message: "Amount must be at least Rs. 10 for Khalti payments." 
      });
    }

    // 3. Fetch specific pharmacy keys from MongoDB
    const settings = await PharmacySettings.findOne({ pharmacyId });

    if (!settings || !settings.khaltiSecretKey) {
      return res.status(400).json({ 
        success: false, 
        message: "Khalti is not configured. Please add your Secret Key in Settings." 
      });
    }

    // 4. SMART HEADER LOGIC
    // This prevents the "Invalid Token" error caused by double "Key Key" prefixes.
    const rawKey = settings.khaltiSecretKey.trim();
    const authHeader = rawKey.startsWith("Key ") ? rawKey : `Key ${rawKey}`;

    // 5. URL Configuration
    // Ensure these match your Vercel deployment exactly.
    const FRONTEND_URL = "https://medisync-mauve.vercel.app";

    // 6. Call Khalti API
    const response = await axios.post(
      "https://a.khalti.com/api/v2/epayment/initiate/",
      {
        return_url: `${FRONTEND_URL}/payment-success`,
        website_url: FRONTEND_URL,
        amount: Math.round(amount * 100), // Convert Rs to Paisa (must be an integer)
        purchase_order_id: purchase_order_id,
        purchase_order_name: purchase_order_name || `Order ${purchase_order_id}`,
      },
      {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      }
    );

    // 7. Send the payment_url back to the React frontend
    return res.status(200).json({ 
      success: true, 
      data: response.data 
    });

  } catch (error: any) {
    // Log the detailed error from Khalti for debugging
    console.error("Khalti API Error Detail:", error.response?.data || error.message);
    
    return res.status(500).json({ 
      success: false, 
      message: "Khalti initiation failed.", 
      error: error.response?.data || error.message 
    });
  }
};