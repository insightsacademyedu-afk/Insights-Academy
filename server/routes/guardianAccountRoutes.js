import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sensitiveActionRateLimiter } from "../middleware/rateLimiters.js";
import { listAccounts, createAccount, updateAccount, resetAccountPassword, revokeAccount } from "../controllers/guardianAccountController.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));
router.get("/", listAccounts);
router.post("/", sensitiveActionRateLimiter, createAccount);
router.put("/:id", sensitiveActionRateLimiter, updateAccount);
router.post("/:id/reset-password", sensitiveActionRateLimiter, resetAccountPassword);
router.post("/:id/revoke-login", sensitiveActionRateLimiter, revokeAccount);
export default router;
