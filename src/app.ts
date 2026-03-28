import express from "express";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/users.routes";
import medicineRoutes from './routes/medicine.routes';
import saleRoutes from './routes/sale.routes';
import pharmacyRoutes from './routes/pharmacy.routes';
import dashboardRoutes from './routes/dashboard.routes';
import customerRoutes from './routes/customer.routes';
import supplierRoutes from "./routes/supplier.routes";
import purchaseRoutes from "./routes/purchase.routes";
import settingRoutes from "./routes/setting.routes";
import khaltiRoutes from './routes/khalti.routes';
import posRoutes from './routes/pos.routes';
import reportRoutes from "./routes/report.routes";
import clinicRoutes from "./routes/clinic.routes";

const app = express();

app.use(express.json());
app.use(morgan("dev"));
app.use(cookieParser());

// Serve static files (Crucial for QR code images!)
app.use("/uploads", express.static("uploads")); 

// FIXED CORS HERE
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://medisync-mauve.vercel.app",
    ],
    credentials: true,
  })
);

// Auth routes
app.use("/api/auth", authRoutes);

// User routes
app.use("/api/users", userRoutes);

// MedicineRoutes 
app.use("/api/medicines", medicineRoutes);

// Sale routes
app.use("/api/sales", saleRoutes);

// Dashboard routes
app.use("/api/dashboard", dashboardRoutes);

//Pharmacy routes
app.use('/api/pharmacies', pharmacyRoutes);

//Customer routes
app.use('/api/customers', customerRoutes);

//Supplier routes
app.use("/api/suppliers", supplierRoutes);

//Purchase routes
app.use("/api/purchases", purchaseRoutes);

//POS routes
app.use("/api/pos", posRoutes);

//Setting routes
app.use("/api/setting", settingRoutes);

//Khalti route
app.use("/api/khalti", khaltiRoutes);

// Report routes
app.use("/api/reports", reportRoutes);

//Cliclic Routes
app.use("/api/clinic", clinicRoutes)

// Test root
app.get("/", (_req, res) => {
  res.send("MediSync API Running");
});

export default app;