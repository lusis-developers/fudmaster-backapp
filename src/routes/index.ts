import express, { Application } from "express";
import userRouter from "./user.router";
import coursesRouter from "./courses.router";
import commentsRouter from "./comments.router";
import gamificationRouter from "./gamification.router";
import careersRouter from "./careers.router";
import paymentRouter from "./payment.router";
import dashboardRouter from "./dashboard.router";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);
  router.use("/users", userRouter);
  router.use("/courses", coursesRouter);
  router.use("/comments", commentsRouter);
  router.use("/gamification", gamificationRouter);
  router.use("/careers", careersRouter);
  router.use("/payment", paymentRouter);
  router.use("/dashboard", dashboardRouter);
}

export default routerApi;
