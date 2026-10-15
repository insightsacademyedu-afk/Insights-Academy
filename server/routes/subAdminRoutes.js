import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sensitiveActionRateLimiter } from "../middleware/rateLimiters.js";
import { list, create, update } from "../controllers/subAdminController.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));
router.get("/", list);
router.post("/", sensitiveActionRateLimiter, create);
router.put("/:id", sensitiveActionRateLimiter, update);
export default router;
