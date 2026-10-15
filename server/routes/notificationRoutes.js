import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendNotification, listNotifications, markNotificationRead } from "../controllers/notificationController.js";

const router = Router();
router.use(requireAuth, requireRole("admin", "guardian", "staff"));
router.get("/", listNotifications);
router.post("/", requireRole("admin"), sendNotification);
router.patch("/:id/read", requireRole("guardian", "staff"), markNotificationRead);
export default router;
