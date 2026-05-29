/**
 * @file controllers/authController.ts
 * @description
 * Handles user authentication, registration, profile management,
 * password updates, and JWT token generation for the
 * Pharmacy Management System.
 *
 * Core features:
 *  1. User registration with role validation
 *  2. Secure login with JWT access/refresh tokens
 *  3. Password hashing using model pre-save hooks
 *  4. Role-based authorization and access control
 *  5. User profile update and password management
 *  6. Prevents self-deletion and unauthorized updates
 */

import { Request, Response } from "express";
import { User } from "../models/User";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt.helper";

// Register a user
export const register = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password, role, pharmacyId } = req.body;

    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const validRoles = ["ADMIN", "PHARMACIST", "DOCTOR", "PATIENT"];
    const normalizedRole = String(role).toUpperCase();

    if (!validRoles.includes(normalizedRole)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    if (normalizedRole === "PHARMACIST" && !pharmacyId) {
      return res.status(400).json({ success: false, message: "Pharmacist must belong to a pharmacy" });
    }

    const existingUser = await User.findOne({ email: String(email).toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    // Let the schema pre-save hook hash the password
    const user = await User.create({
      firstName,
      lastName,
      email: String(email).toLowerCase(),
      password, // plain password; schema hashes it
      role: normalizedRole,
      pharmacyId: normalizedRole === "PHARMACIST" ? pharmacyId : undefined,
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user, false);

    const { password: _pw, ...userData } = user.toObject();

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: { user: userData, accessToken, refreshToken },
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ success: false, message: "Server error", error });
  }
};

// Login
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password, rememberMe = false } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email: String(email).toLowerCase(),
    }).populate("pharmacyId", "name");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user, rememberMe); // 🔥

    const userObj: any = user.toObject();
    delete userObj.password;

    const pharmacyName =
      userObj.role === "PHARMACIST" && userObj.pharmacyId?.name
        ? userObj.pharmacyId.name
        : undefined;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          firstName: userObj.firstName,
          lastName: userObj.lastName,
          email: userObj.email,
          role: userObj.role,
          pharmacyId: userObj.pharmacyId,
          pharmacyName,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Logout
export const deleteUserByUserId = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const requester = (req as any).user;

    if (!userId) {
      return res.status(400).json({ success: false, message: "UserId is required" });
    }

    //  requester.userId exists because we will include userId in JWT payload
    if (requester?.userId === userId) {
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

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, email, role } = req.body;
    const requester = (req as any).user;

    if (!requester) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (requester.role !== "ADMIN" && requester.userId !== userId) {
      return res.status(403).json({ success: false, message: "You can only update your own profile" });
    }

    const updateData: any = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = String(email).toLowerCase();

    if (requester.role === "ADMIN" && role) {
      updateData.role = String(role).toUpperCase();
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

export const updatePassword = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;
    const requester = (req as any).user;

    if (!newPassword) {
      return res.status(400).json({ success: false, message: "New password is required" });
    }

    if (!requester) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (requester.role !== "ADMIN" && requester.userId !== userId) {
      return res.status(403).json({ success: false, message: "You can only update your own password" });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    //  set plain; pre-save hook hashes
    user.password = newPassword;
    await user.save();

    return res.status(200).json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};
