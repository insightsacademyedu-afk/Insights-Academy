import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  studentsReport,
  feeCollectionReport,
  outstandingFeesReport,
  expensesReport,
} from "../controllers/reportController.js";

const router = Router();

router.use(requireAuth, requireRole("admin", "subadmin"));

router.get("/students", studentsReport);
router.get("/fee-collection", feeCollectionReport);
router.get("/outstanding-fees", outstandingFeesReport);
router.get("/expenses", requireRole("admin"), expensesReport);

export default router;
