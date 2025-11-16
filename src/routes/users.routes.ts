import {Router} from "express";
import { getAllUsers, getUsersByRole  } from "../controller/userController";
import { adminOnly } from "../middlewares/adminsOnly";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

//fetch all users
router.get("/all", authMiddleware, adminOnly, getAllUsers);

//fetch users by role
router.get("/role", authMiddleware, adminOnly, getUsersByRole )

//fetch current user
// router.get("/me", authMiddleware, getCurrentUser);


export default router;