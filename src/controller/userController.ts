import { Request, Response } from "express";
import { User } from "../models/User"
import Pharmacy from "../models/Pharmacy";

//get all users 
export const getAllUsers = async (req: Request, res: Response)=>{
    try{
        const users = await User.find().select("-password");
        return res.status(200).json({success: true, users})
    }catch(err){
        return res.status(500).json({success: false, message:"Server Error!"})
    }
};

//get users according to their roles
export const getUsersByRole = async (req: Request, res: Response) => {
  try {
    const { role } = req.query; 
    const filter: any = {};

    // validate role if provided
    const validRoles = ["ADMIN", "PHARMACIST", "DOCTOR", "PATIENT"];
    if (role) {
      if (!validRoles.includes((role as string).toUpperCase())) {
        return res.status(400).json({ success: false, message: "Invalid role" });
      }
      filter.role = (role as string).toUpperCase();
    }

    const users = await User.find(filter).select("-password");
    return res.status(200).json({ success: true, users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/users/me — returns the logged-in user + their pharmacy info
export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    const reqUser = (req as any).user;
    if (!reqUser) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await User.findById(reqUser._id)
      .select("-password")
      .populate("pharmacyId", "name address phone email licenseNumber logoUrl plan subscriptionStatus planEndDate");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};