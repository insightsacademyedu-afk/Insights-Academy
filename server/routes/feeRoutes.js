import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listInvoices,
  getInvoice,
  createInvoice,
  bulkGenerateTuitionInvoices,
  recordPayment,
  waiveInvoice,
  studentFeeSummary,
} from "../controllers/feeController.js";

const router = Router();

// Sub-admin reads are restricted to a single student by requireAuth.
router.use(requireAuth, requireRole("admin", "subadmin"));

router.get("/invoices", listInvoices);
router.get("/invoices/:id", getInvoice);
router.post("/invoices", requireRole("admin"), createInvoice);
router.post("/invoices/bulk-generate", requireRole("admin"), bulkGenerateTuitionInvoices);
router.patch("/invoices/:id/waive", requireRole("admin"), waiveInvoice);

router.post("/payments", requireRole("admin"), recordPayment);

router.get("/students/:studentId/summary", studentFeeSummary);

export default router;
