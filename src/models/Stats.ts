import mongoose from "mongoose";

const dailyStatSchema = new mongoose.Schema({
  date: { type: String }, // YYYY-MM-DD
  revenue: { type: Number, default: 0 },
  itemsSold: { type: Number, default: 0 },
});

const bestSellingSchema = new mongoose.Schema({
  medicineId: String,
  name: String,
  totalSold: { type: Number, default: 0 },
});

const statsSchema = new mongoose.Schema({
  _id: { type: String, default: "dashboardStats" }, // single document
  totalRevenue: { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 },
  totalItemsSold: { type: Number, default: 0 },
  dailyStats: [dailyStatSchema],
  bestSelling: [bestSellingSchema],
  lastUpdated: { type: Date, default: Date.now },
});

export default mongoose.model("Stats", statsSchema);
