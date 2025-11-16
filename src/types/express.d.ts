import { Request } from "express";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;   // userId from JWT
    isAdmin?: boolean; // isAdmin from JWT
    user?: User;
  }
}
