import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getCard, cardAction } from "../controllers/studentCardController.js";

const router = Router();
router.use(requireAuth, requireRole("admin", "subadmin"));
router.get("/:id", getCard);
router.post("/:id/:action", cardAction);
export default router;
