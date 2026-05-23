import dotenv from "dotenv";
dotenv.config(); // Must be first — loads .env before any other import reads process.env

import express from "express";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";
import { startSubscriptionJob } from "./jobs/subscription.job";
import { startDailySummaryJob } from "./jobs/dailySummary.job";

// ── Eagerly register all Mongoose models at startup ─────────────────────────
// Mongoose resolves populate() by looking up model names in its registry.
// Importing every model here guarantees they are registered before any
// request handler runs, regardless of which route is hit first.
import "./models/GenericMedicine";
import "./models/ProductMedicine";
import "./models/Batch";
import "./models/Sale";
import "./models/Purchase";
import "./models/Supplier";
import "./models/Customer";
import "./models/Pharmacy";
import "./models/User";
import "./models/SubscriptionPlan";
import "./models/Subscription";
import "./models/PaymentRecord";
import "./models/PharmacySettings";
import "./models/PharmacyEmailSettings"; // ← NEW: per-pharmacy SMTP configuration
// ─────────────────────────────────────────────────────────────────────────────

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/users.routes";
import medicineRoutes from "./routes/medicine.routes";
import saleRoutes from "./routes/sale.routes";
import pharmacyRoutes from "./routes/pharmacy.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import customerRoutes from "./routes/customer.routes";
import supplierRoutes from "./routes/supplier.routes";
import purchaseRoutes from "./routes/purchase.routes";
import settingRoutes from "./routes/setting.routes";
import khaltiRoutes from "./routes/khalti.routes";
import posRoutes from "./routes/pos.routes";
import reportRoutes from "./routes/report.routes";
import clinicRoutes from "./routes/clinic.routes";
import inventoryRoutes from "./routes/inventory.routes";
import superAdminRoutes from "./routes/superAdmin.routes";
import subscriptionRoutes from "./routes/subscription.routes";

const app = express();

app.use(express.json());
app.use(morgan("dev"));
app.use(cookieParser());

startSubscriptionJob();
startDailySummaryJob();

// NOTE: Global SMTP startup verification is removed.
// In the multi-tenant system, each pharmacy manages its own SMTP configuration.
// Use POST /api/setting/email/test to verify a specific pharmacy's connection.
console.log("[EmailService] Multi-tenant email system active. Each pharmacy uses its own SMTP configuration.");

// Serve static files (Crucial for QR code images!)
app.use("/uploads", express.static("uploads"));

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://medisync-mauve.vercel.app",
    ],
    credentials: true,
  })
);

// ── API Routes ───────────────────────────────────────────────────────────────

app.use("/api/auth",         authRoutes);
app.use("/api/users",        userRoutes);
app.use("/api/medicines",    medicineRoutes);
app.use("/api/sales",        saleRoutes);
app.use("/api/dashboard",    dashboardRoutes);
app.use("/api/pharmacies",   pharmacyRoutes);
app.use("/api/customers",    customerRoutes);
app.use("/api/suppliers",    supplierRoutes);
app.use("/api/purchases",    purchaseRoutes);
app.use("/api/pos",          posRoutes);
app.use("/api/setting",      settingRoutes);  
app.use("/api/khalti",       khaltiRoutes);
app.use("/api/reports",      reportRoutes);
app.use("/api/clinic",       clinicRoutes);
app.use("/api/inventory",    inventoryRoutes);
app.use("/api/admin",        superAdminRoutes);
app.use("/api/subscription", subscriptionRoutes);

// Seed default subscription plans at startup
import { seedDefaultPlans } from "./services/subscriptionService";
seedDefaultPlans().catch(console.error);

// Health check
app.get("/", (_req, res) => {
  res.send("MediSync API Running");
});

export default app;
