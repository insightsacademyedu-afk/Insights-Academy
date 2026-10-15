import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import Staff from "../models/Staff.js";
import { list, create, getOne, roster, enterMarks, finalize, amendMark } from "../controllers/testController.js";

const router = Router();

// Both admin and teacher use these routes — every ownership/assignment
// check happens inside the controller (loadTestForMutation, and the
// assignment check in create()), not via a role gate here, since "is this
// teacher allowed to touch THIS specific test" isn't a static role check.
router.use(requireAuth);

router.get("/teachers", requireRole("admin", "subadmin"), async (_req, res, next) => {
  try { res.json({ items: await Staff.find({ archivedAt: null, status: "active" }).select("fullName").sort({ fullName: 1 }) }); }
  catch (error) { next(error); }
});

router.get("/", list);
router.post("/", create);
router.get("/:id", getOne);
router.get("/:id/roster", roster);
router.post("/:id/marks", enterMarks);
router.post("/:id/finalize", finalize);
router.post("/:id/amend", amendMark);

export default router;
