import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import TeacherCard from "../models/TeacherCard.js";
import Staff from "../models/Staff.js";
import TeacherAttendance from "../models/TeacherAttendance.js";
import { academyDay, validateDay, ACADEMY_TIMEZONE } from "../utils/academyDay.js";
import { cardError } from "../services/studentCards.js";
import { buildListQuery, paginatedResponse } from "../utils/listQuery.js";
import { attendanceAccountRateLimiter } from "../middleware/rateLimiters.js";

const router = Router();
router.use(requireAuth, requireRole("admin", "subadmin"));

router.post("/scan", attendanceAccountRateLimiter, async (req, res, next) => {
  try {
    const token = req.body?.token;
    if (typeof token !== "string" || !/^AMT1_[A-Za-z0-9_-]{43}$/.test(token)) throw cardError("Teacher QR code not recognized", 400);
    const identity = await TeacherCard.findOne({ token }).select("teacher");
    if (!identity) throw cardError("Teacher QR code not recognized", 404);
    let record, duplicate, teacher;
    await mongoose.connection.transaction(async session => {
      teacher = await Staff.findOneAndUpdate({ _id: identity.teacher, archivedAt: null }, { $inc: { cardLockVersion: 1 } }, { new: true, session }).populate("designation", "title");
      if (!teacher || teacher.status !== "active") throw cardError("Teacher is inactive or unavailable");
      const card = await TeacherCard.findOne({ token }).session(session);
      if (!card || card.status !== "active") throw cardError("Card revoked or replaced; use the current employee card");
      const now = new Date();
      if (card.expiresAt <= now) throw cardError("Employee card expired; renew it before checking in");
      record = await TeacherAttendance.findOne({ teacher: teacher._id, day: academyDay(now) }).session(session);
      duplicate = Boolean(record);
      if (!record) [record] = await TeacherAttendance.create([{ teacher: teacher._id, teacherName: teacher.fullName, designation: teacher.cardDesignation || teacher.designation?.title || "", day: academyDay(now), checkedInAt: now, recordedBy: req.user._id }], { session });
    });
    res.status(duplicate ? 200 : 201).json({ record, duplicate, teacher: { fullName: teacher.fullName, photoUrl: teacher.photoUrl }, employeeId: `EMP-${String(teacher._id).toUpperCase()}`, message: duplicate ? "Already marked today" : "Teacher attendance saved", timezone: ACADEMY_TIMEZONE });
  } catch (error) { next(error); }
});

// Expose only the identity fields needed by the attendance picker.
router.get("/teachers", async (req, res, next) => {
  try {
    const { filter, page, limit, skip } = buildListQuery(req.query, { searchFields: ["fullName"] });
    Object.assign(filter, { status: "active", archivedAt: null });
    const [items, total] = await Promise.all([
      Staff.find(filter).select("fullName designation cardDesignation").populate("designation", "title").sort({ fullName: 1, _id: 1 }).skip(skip).limit(limit),
      Staff.countDocuments(filter),
    ]);
    res.json(paginatedResponse(items, total, page, limit));
  } catch (error) { next(error); }
});

router.get("/", async (req, res, next) => {
  try {
    const { page, limit, skip } = buildListQuery(req.query);
    const filter = {};
    if (req.query.teacher) {
      if (!mongoose.isObjectIdOrHexString(req.query.teacher)) throw cardError("Invalid teacher ID", 400);
      filter.teacher = req.query.teacher;
    }
    if (req.query.from || req.query.to) {
      filter.day = {};
      if (req.query.from) filter.day.$gte = validateDay(req.query.from);
      if (req.query.to) filter.day.$lte = validateDay(req.query.to);
      if (req.query.from && req.query.to && req.query.from > req.query.to) throw cardError("Start date must not be after end date", 400);
    }
    const [items, total] = await Promise.all([
      TeacherAttendance.find(filter).sort({ day: -1, checkedInAt: -1, _id: -1 }).skip(skip).limit(limit).populate("recordedBy", "displayName username"),
      TeacherAttendance.countDocuments(filter),
    ]);
    res.json({ ...paginatedResponse(items, total, page, limit), timezone: ACADEMY_TIMEZONE });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.body?.teacher)) throw cardError("Invalid teacher ID", 400);
    let record, duplicate;
    await mongoose.connection.transaction(async session => {
      const teacher = await Staff.findOneAndUpdate({ _id: req.body.teacher, status: "active", archivedAt: null }, { $inc: { cardLockVersion: 1 } }, { new: true, session }).populate("designation", "title");
      if (!teacher) throw cardError("Active teacher not found", 404);
      const now = new Date();
      const identity = { teacher: teacher._id, day: academyDay(now) };
      record = await TeacherAttendance.findOne(identity).session(session);
      duplicate = Boolean(record);
      if (!record) [record] = await TeacherAttendance.create([{ ...identity, teacherName: teacher.fullName, designation: teacher.cardDesignation || teacher.designation?.title || "", checkedInAt: now, recordedBy: req.user._id }], { session });
    });
    res.status(duplicate ? 200 : 201).json({ record, duplicate, message: duplicate ? "Already marked today" : "Teacher attendance saved", timezone: ACADEMY_TIMEZONE });
  } catch (error) { next(error); }
});
export default router;
