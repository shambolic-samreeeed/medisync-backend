import express from "express";
import morgan from "morgan";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/users.routes"

const app = express();

app.use(express.json());
app.use(morgan("dev"));
app.use(cors());

// Auth routes
app.use("/api/auth", authRoutes);

// User routes
app.use("/api/users", userRoutes)

// Test root
app.get("/", (_req, res) => {
  res.send("MediSync API Running");
});

export default app;
