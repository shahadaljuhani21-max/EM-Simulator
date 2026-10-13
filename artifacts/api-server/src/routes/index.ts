import { Router, type IRouter } from "express";
import healthRouter from "./health";
import casesRouter from "./cases";
import downloadsRouter from "./downloads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(casesRouter);
router.use(downloadsRouter);

export default router;
