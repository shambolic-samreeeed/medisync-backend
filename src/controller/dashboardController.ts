import { Request, Response } from "express";
import Stats from "../models/Stats";

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const stats = await Stats.findById("dashboardStats");
    if (!stats) {
      return res.status(404).json({ message: "No stats available yet" });
    }

    res.status(200).json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch dashboard stats", error });
  }
};
