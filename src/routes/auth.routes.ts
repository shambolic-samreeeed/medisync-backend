import { Router } from "express";
import { deleteUserByUserId, login, register, updatePassword, updateUser } from "../controller/authController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { adminOnly } from "../middlewares/adminsOnly";

const router = Router();

// Register user — staff limit enforced for PHARMACIST registrations
// The enforceStaffLimit middleware reads req.user, so it must come after authMiddleware.
// For admin-created pharmacists, the admin registers them directly.
// Staff self-registration (if allowed) would need the pharmacy token in context.
router.post("/register", register);

// login user
router.post("/login", login);

// delete users by id
router.delete("/:userId", authMiddleware, adminOnly, deleteUserByUserId);

// update user details
router.put("/:userId", authMiddleware, updateUser);

// update user password
router.put("/:userId/password", authMiddleware, updatePassword);

export default router;
