import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireStudentAccess } from "../utils/teacherScope.js";
import { list, getOne, create, update, enroll, remove } from "../controllers/studentController.js";
import { sensitiveActionRateLimiter } from "../middleware/rateLimiters.js";
import { archiveResource } from "../controllers/archiveController.js";
import { parentLoginAction } from "../controllers/studentParentLoginController.js";

const router = Router();

router.use(requireAuth);

// Both admin and staff can list — the controller itself scopes staff
// down to only their assigned students, rather than a route-level block.
router.get("/", list);

// Single-student routes are guarded by requireStudentAccess, which
// enforces the exact rule from the spec: a teacher hitting a student ID
// outside their assignment gets 403, no matter how they got that ID.
router.get("/:id", requireStudentAccess("id"), getOne);

// Sub-admins can register and update students; account actions and archives
// remain exclusive to the main admin.
router.use(requireRole("admin", "subadmin"));

router.post("/", create);
router.post("/:id/parent-login/:action", requireRole("admin"), sensitiveActionRateLimiter, parentLoginAction);
router.put("/:id", update);
router.post("/:id/enroll", enroll);
router.delete("/:id", requireRole("admin"), sensitiveActionRateLimiter, archiveResource("student"));

export default router;
