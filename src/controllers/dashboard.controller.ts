import type { Request, Response, NextFunction } from "express";
import { DashboardService } from "../services/dashboard.service";
import { HttpStatusCode } from "axios";

export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const service = new DashboardService();
    // Getting userId from URL params as requested
    const { userId } = req.params;

    if (!userId) {
      res.status(HttpStatusCode.BadRequest).send({ message: "User ID is required." });
      return;
    }

    const { stats, recentCourses } = await service.getUserDashboard(userId.toString());

    // Also update streak on dashboard load (as it counts as activity)
    await service.updateStreak(userId.toString());

    res.status(HttpStatusCode.Ok).send({
      message: "Dashboard data retrieved successfully.",
      stats,
      recentCourses,
    });
    return;
  } catch (error) {
    next(error);
  }
};
