import express from "express";
import morgan from "morgan";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/users.routes";
import medicineRoutes from './routes/medicine.routes'
import saleRoutes from './routes/sale.routes'
import dashboardRoutes from './routes/dashboard.routes'
import pharmacyRoutes from './routes/pharmacy.routes'
import customerRoutes from './routes/customer.routes'
import cookieParser from "cookie-parser";

const app = express();

app.use(express.json());
app.use(morgan("dev"));
app.use(cookieParser());

// FIXED CORS HERE
app.use(
  cors({
    origin: "http://localhost:3000",
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
app.use('/api/pharmacies', pharmacyRoutes)

//Customer routes
app.use('/api/customers', customerRoutes)


// Test root
app.get("/", (_req, res) => {
  res.send("MediSync API Running");
});

export default app;
