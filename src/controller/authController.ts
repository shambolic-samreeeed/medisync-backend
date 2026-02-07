import { Request, Response } from "express";
import { User } from "../models/User";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt.helper";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/auth/register
 * Registers a new user (Admin, Pharmacist, Doctor, Patient)
 * Requires: firstName, lastName, email, password, role, pharmacyId (if applicable)
 */
export const register = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password, role, pharmacyId } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // Validate role
    const validRoles = ["ADMIN", "PHARMACIST", "DOCTOR", "PATIENT"];
    if (!validRoles.includes(role.toUpperCase())) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    // Pharmacists must have a pharmacyId
    if (role.toUpperCase() === "PHARMACIST" && !pharmacyId) {
      return res.status(400).json({ success: false, message: "Pharmacist must belong to a pharmacy" });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      userId: uuidv4(),
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: role.toUpperCase(),
      pharmacyId: pharmacyId || undefined, // optional for non-pharmacists
    });

    // Generate JWT tokens
    let accessToken = "";
    let refreshToken = "";
    try {
      accessToken = generateAccessToken(user);
      refreshToken = generateRefreshToken(user);
    } catch (err) {
      console.error("JWT generation failed", err);
      return res.status(500).json({ success: false, message: "Server error generating token" });
    }

    // Return response without password
    const { password: _, ...userData } = user.toObject();

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: userData,
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ success: false, message: "Server error", error });
  }
};

/**
 * POST /api/auth/login
 * Login a user and return JWT tokens
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    // Generate JWT tokens
    let accessToken = "";
    let refreshToken = "";
    try {
      accessToken = generateAccessToken(user);
      refreshToken = generateRefreshToken(user);
    } catch (err) {
      console.error("JWT generation failed", err);
      return res.status(500).json({ success: false, message: "Server error generating token" });
    }

    const { password: _, ...userData } = user.toObject();

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: userData,
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: "Server error", error });
  }
};

//delete user by ID
export const deleteUserByUserId = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId; 

    if (!userId) {
      return res.status(400).json({ success: false, message: "UserId is required" });
    }

    // Prevent admin from deleting themselves
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


// Update user profile 
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, email, role } = req.body;
    const requester = (req as any).user; // the logged-in user

    // Regular users can only update their own profile
    if (requester.role !== "ADMIN" && requester.userId !== userId) {
      return res.status(403).json({ success: false, message: "You can only update your own profile" });
    }

    // Prepare fields to update
    const updateData: any = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;

    // Only admins can update roles
    if (requester.role === "ADMIN" && role) {
      updateData.role = role;
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, message: "User updated successfully", user: updatedUser });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};


// Update Password
export const updatePassword = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params; // userId of the user to update
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ success: false, message: "New password is required" });
    }

    const requester = (req as any).user; // logged-in user

    // Non-admin users can only update their own password
    if (requester.role !== "ADMIN" && requester.userId !== userId) {
      return res.status(403).json({ success: false, message: "You can only update your own password" });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: (err as Error).message,
    });
  }
};
