import jwt from "jsonwebtoken";
import { IUser } from "../models/User";

export const generateAccessToken = (user: IUser) => {
  return jwt.sign(
    {
      id: user._id.toString(),   
      userId: user.userId,        
      role: user.role,
      email: user.email,
      pharmacyId: user.pharmacyId
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
      pharmacyId:user.pharmacyId
    },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: "7d" }
  );
};
