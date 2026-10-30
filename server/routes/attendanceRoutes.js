import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listAttendance, scan } from "../controllers/attendanceController.js";
import { attendanceAccountRateLimiter } from "../middleware/rateLimiters.js";

const router = Router();
router.use(requireAuth, requireRole("admin", "subadmin", "staff"));
router.get("/", listAttendance);
router.post("/scan", attendanceAccountRateLimiter, scan);
export default router;
