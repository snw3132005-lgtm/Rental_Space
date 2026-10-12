import { Router, type IRouter } from "express";
import healthRouter from "./health";
import rentalsRouter from "./rentals";
import assistantRouter from "./assistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rentalsRouter);
router.use(assistantRouter);

export default router;
