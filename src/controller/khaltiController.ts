import axios from "axios";
import { Request, Response } from "express";

// In a real app, this should be in your .env file (e.g., process.env.KHALTI_SECRET_KEY)
// This is the official Sandbox Test Key provided by Khalti
const KHALTI_SECRET_KEY = "Key live_secret_key_68791341fdd94846a146f0457ff7b455"; 

export const initiateKhaltiPayment = async (req: Request, res: Response) => {
  try {
    // 1. Extract payment details sent from your React frontend
    const { amount, purchase_order_id, purchase_order_name } = req.body;

    if (!amount || !purchase_order_id) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // 2. Make the POST request to Khalti's ePayment Initiate API
    const response = await axios.post(
      "https://dev.khalti.com/api/v2/epayment/initiate/",
      {
        // Where Khalti should send the user after they successfully pay
        return_url: "http://localhost:3000/payment-success", 
        // Your pharmacy website's base URL
        website_url: "http://localhost:3000",
        // Khalti strictly expects the amount in Paisa (Rs 1 = 100 Paisa)
        amount: amount * 100, 
        purchase_order_id,
        purchase_order_name,
      },
      {
        headers: {
          // You must include 'Key ' before the secret key!
          Authorization: KHALTI_SECRET_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    // 3. Send the successful response (which includes the payment_url) back to React
    return res.status(200).json({ 
      success: true, 
      data: response.data 
    });

  } catch (error: any) {
    // 4. Handle errors (Khalti returns detailed error objects in error.response.data)
    console.error("Khalti API Error:", error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to initiate Khalti payment", 
      error: error.response?.data || error.message 
    });
  }
};