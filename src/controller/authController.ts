import { Request, Response } from "express";
import { User } from "../models/User";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt.helper";

// ----------------------
// Register
// ----------------------
export const register = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    // Create user
    const user = await User.create({ firstName, lastName, email, password, role });

    // Generate JWT tokens safely
    let accessToken = "";
    let refreshToken = "";
    try {
      accessToken = generateAccessToken(user);
      refreshToken = generateRefreshToken(user);
    } catch (err) {
      console.error("JWT generation failed", err);
      return res.status(500).json({ success: false, message: "Server error generating token" });
    }

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ success: false, message: "Server error", error });
  }
};

// ----------------------
// Login
// ----------------------
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate fields
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

    // Generate JWT tokens safely
    let accessToken = "";
    let refreshToken = "";
    try {
      accessToken = generateAccessToken(user);
      refreshToken = generateRefreshToken(user);
    } catch (err) {
      console.error("JWT generation failed", err);
      return res.status(500).json({ success: false, message: "Server error generating token" });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: "Server error", error });
  }
};
