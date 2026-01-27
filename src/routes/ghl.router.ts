import { Router } from "express";
import { syncUserToGHL, syncAllUsers } from "../controllers/ghl.controller";

const ghlRouter = Router();

ghlRouter.get("/sync-all", syncAllUsers); // Helper for Cron
ghlRouter.post("/sync/:userId", syncUserToGHL);

export default ghlRouter;
