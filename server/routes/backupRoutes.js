import { Router, raw } from "express";
import { createBackup, inspectBackup, restoreBackup } from "../controllers/backupController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sensitiveActionRateLimiter } from "../middleware/rateLimiters.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));
router.post("/create", sensitiveActionRateLimiter, createBackup);
router.post("/inspect", sensitiveActionRateLimiter, raw({ type: "application/octet-stream", limit: "32mb", inflate: false }), inspectBackup);
router.post("/restore", sensitiveActionRateLimiter, raw({ type: "application/octet-stream", limit: "32mb", inflate: false }), restoreBackup);
export default router;
