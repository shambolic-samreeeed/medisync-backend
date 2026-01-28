import { Request } from "express";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;   // userId from JWT
    isAdmin?: boolean; // isAdmin from JWT
    user?: User;
  }
}

import { User } from "../models/User";
import { Multer } from "multer";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      isAdmin?: boolean;
      user?: User;

      file?: Multer.File;        // ✅ single file upload
      files?: Multer.File[];     // ✅ multiple file upload (optional)
    }
  }
}

export {};
