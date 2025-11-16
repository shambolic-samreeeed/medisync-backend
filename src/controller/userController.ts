import { Request, Response } from "express";
import { User } from "../models/User"

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

//delete user
export const deleteUserByUserId = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId; // from URL

    if (!userId) {
      return res.status(400).json({ success: false, message: "UserId is required" });
    }

    // Prevent admin from deleting themselves (optional)
    if ((req as any).user.userId === userId) {
      return res.status(400).json({ success: false, message: "You cannot delete yourself" });
    }

    const deletedUser = await User.findOneAndDelete({ userId });

    if (!deletedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};


//get current user
// export const getCurrentUser = async (req: Request, res: Response) => {
//   try {
//     const userId = req.userId;

//     if (!userId) {
//       return res.status(401).json({
//         success: false,
//         message: "Unauthorized. Token missing or invalid.",
//       });
//     }

//     const user = await User.findById(userId).select("-password");
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       user,
//     });
//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({
//       success: false,
//       message: "Server error",
//     });
//   }
// };