import { Router } from "express";
import { getDashboard } from "../controllers/dashboard.controller";
// import { authMiddleware } from "../middlewares/auth.middleware"; // Disabled per user request

const dashboardRouter = Router();

// Route now accepts userId directly: GET /api/dashboard/:userId
dashboardRouter.get("/:userId", getDashboard);

export default dashboardRouter
