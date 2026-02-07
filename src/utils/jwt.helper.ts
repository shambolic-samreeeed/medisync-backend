import jwt from "jsonwebtoken";
import { IUser } from "../models/User";

export const generateAccessToken = (user: IUser) => {
  return jwt.sign(
    {
      id: user._id.toString(),     // mongo _id
      userId: user.userId,         // uuid (needed by your controllers)
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" }
  );
};

export const generateRefreshToken = (user: IUser) => {
  return jwt.sign(
    {
      id: user._id.toString(),
      userId: user.userId,
    },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: "7d" }
  );
};
