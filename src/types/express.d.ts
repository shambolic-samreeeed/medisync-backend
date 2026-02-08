/**
 * @file types/express.d.ts
 * @description
 * Adds custom fields to Express Request so TypeScript knows about:
 * - req.user (our auth payload)
 * - req.file / req.files (multer)
 *
 * IMPORTANT:
 * - req.user here is NOT the full Mongoose User document.
 * - It is a small, safe auth payload used by controllers.
 */

import "express-serve-static-core";
import type { Multer } from "multer";

type AuthUser = {
  _id: string;
  role: string;
  pharmacyId: string; // ObjectId as string
};

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;

    // multer
    file?: Multer.File;
    files?: Multer.File[];
  }
}

export {};
