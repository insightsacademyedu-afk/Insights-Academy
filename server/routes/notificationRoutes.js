import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listRecipients, sendNotification, listNotifications } from "../controllers/notificationController.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));
router.get("/recipients", listRecipients);
router.get("/", listNotifications);
router.post("/", sendNotification);
export default router;
