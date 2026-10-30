import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listAttendance, scan } from "../controllers/attendanceController.js";
import { attendanceAccountRateLimiter } from "../middleware/rateLimiters.js";
import { classRoster, markClassAttendance } from "../controllers/manualStudentAttendanceController.js";

const router = Router();
router.use(requireAuth, requireRole("admin", "subadmin", "staff"));
router.get("/", listAttendance);
router.get("/roster", requireRole("admin", "subadmin"), classRoster);
router.post("/manual", requireRole("admin", "subadmin"), attendanceAccountRateLimiter, markClassAttendance);
router.post("/scan", requireRole("admin", "subadmin"), attendanceAccountRateLimiter, scan);
export default router;
