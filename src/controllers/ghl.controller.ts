import type { Request, Response, NextFunction } from "express";
import { GHLService } from "../services/ghl.service";
import { HttpStatusCode } from "axios";

export const syncUserToGHL = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const service = new GHLService();
    const { userId } = req.params;

    if (!userId) {
      res.status(HttpStatusCode.BadRequest).send({ message: "User ID is required." });
      return;
    }

    const { payload } = await service.syncUserToGHL(userId);

    res.status(HttpStatusCode.Ok).send({
      message: "User synced to Go High Level successfully.",
      syncedData: payload
    });
    return;
  } catch (error) {
    next(error);
  }
};

export const syncAllUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const service = new GHLService();
    // This process might take longer than standard HTTP timeout.
    // Vercel Cron requests are handled as regular invocations, but can run longer on Pro plans.
    // It is best practice to return quickly or use background jobs, but for Vercel Cron simplified:

    // We launch the process and await it.
    const result = await service.syncAllUsersToGHL();

    res.status(HttpStatusCode.Ok).send({
      message: "Sync all users process completed.",
      stats: result
    });
    return;
  } catch (error) {
    next(error);
  }
};
