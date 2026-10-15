import { Router } from "express";
import TeacherClassAssignment from "../models/TeacherClassAssignment.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createCrudController } from "../utils/crudFactory.js";
import { sensitiveActionRateLimiter } from "../middleware/rateLimiters.js";
import { archiveResource } from "../controllers/archiveController.js";
import mongoose from "mongoose";


const router = Router();

const populatePaths = [
  { path: "teacher", select: "fullName" },
  { path: "class", select: "name" },
  { path: "section", select: "name" },
  { path: "subject", select: "name code" },
  { path: "academicSession", select: "name" },
];

const controller = createCrudController(TeacherClassAssignment, {
  exactFilters: ["status", "teacher", "class", "section", "subject", "academicSession"],
  populate: populatePaths,
  duplicateMessage: "This teacher is already assigned to this class/section/subject for this session",
});

router.use(requireAuth);

// A teacher viewing their own assignments — no admin role required, but
// scoped hard to req.user.staffId so a teacher can never query anyone else's.
router.get("/mine", async (req, res, next) => {
  try {
    if (!req.user.staffId) {
      return res.json({ items: [] });
    }
    const items = await TeacherClassAssignment.find({
      teacher: req.user.staffId, status: "active",
      ...(req.query.academicSession ? { academicSession: req.query.academicSession } : {}),
    }).populate(populatePaths);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// Everything else here is admin-only: creating/editing/removing assignments
// is how access control itself is managed, so it must be tightly restricted.
router.use(requireRole("admin"));

// Keep individual permission records, but save the entire selection atomically.
router.post("/bulk", async (req, res, next) => {
  const { teacher, academicSession, assignments, status = "active" } = req.body;
  const isId = (value) => typeof value === "string" && mongoose.isObjectIdOrHexString(value);
  if (!isId(teacher) || !isId(academicSession) || !["active", "inactive"].includes(status) ||
      !Array.isArray(assignments) || !assignments.length || assignments.length > 500 ||
      !assignments.every((item) => item && [item.class, item.section, item.subject].every(isId))) {
    return res.status(400).json({ message: "Select a teacher, session, and between 1 and 500 valid assignments" });
  }
  const unique = [...new Map(assignments.map((item) => [
    `${item.class}:${item.section}:${item.subject}`,
    { teacher, academicSession, class: item.class, section: item.section, subject: item.subject, status },
  ])).values()];
  try {
    let created = 0;
    let skipped = 0;
    await TeacherClassAssignment.db.transaction(async (session) => {
      created = 0;
      skipped = 0;
      for (const fields of unique) {
        const { status: _status, ...key } = fields;
        const existing = await TeacherClassAssignment.findOne({ ...key, archivedAt: null }).session(session);
        if (existing) {
          skipped += 1;
          continue;
        }
        await TeacherClassAssignment.create([fields], { session });
        created += 1;
      }
    });
    res.status(created ? 201 : 200).json({ created, skipped });
  } catch (err) {
    if (["ValidationError", "CastError"].includes(err.name)) return res.status(400).json({ message: err.message });
    if (err.code === 11000) return res.status(409).json({ message: "An assignment already exists or is archived. Refresh the list or restore it from Archive History." });
    next(err);
  }
});

router.get("/", controller.list);
router.get("/:id", controller.getOne);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.delete("/:id", sensitiveActionRateLimiter, archiveResource("teacherAssignment"));

export default router;
