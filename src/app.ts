import express from "express";
import morgan from "morgan";
import cors from "cors";
import authRoutes from "./routes/authRoute";

const app = express();

// Middleware
app.use(express.json());
app.use(morgan("dev"));
app.use(cors());

// Routes
app.use("/api/auth", authRoutes);

// Test root
app.get("/", (_req, res) => {
  res.send("MediSync API Running");
});

export default app;
