import { Router } from "express";
import { listNotifications, markNotificationRead } from "../controllers/notificationController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listChildren, requireChild, childOverview, childTests, childInvoices, childPayments } from "../controllers/guardianPortalController.js";

const router = Router();
router.use(requireAuth, requireRole("guardian"));
router.get("/notifications", listNotifications);
router.patch("/notifications/:id/read", markNotificationRead);
router.get("/children", listChildren);
router.get("/children/:id", requireChild, childOverview);
router.get("/children/:id/tests", requireChild, childTests);
router.get("/children/:id/invoices", requireChild, childInvoices);
router.get("/children/:id/payments", requireChild, childPayments);
export default router;
