import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listAttendance, scan } from "../controllers/attendanceController.js";
import { attendanceAccountRateLimiter } from "../middleware/rateLimiters.js";
import { classRoster, markClassAttendance, markStudentAttendance } from "../controllers/manualStudentAttendanceController.js";

const router = Router();
router.use(requireAuth, requireRole("admin", "subadmin", "staff"));
router.get("/", listAttendance);
router.get("/roster", requireRole("admin", "subadmin"), classRoster);
router.post("/manual", requireRole("admin", "subadmin"), attendanceAccountRateLimiter, markClassAttendance);
router.post("/manual/student", requireRole("admin", "subadmin"), attendanceAccountRateLimiter, markStudentAttendance);
router.post("/scan", requireRole("admin", "subadmin"), attendanceAccountRateLimiter, scan);
export default router;
