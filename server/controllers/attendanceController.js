import mongoose from "mongoose";
import Student from "../models/Student.js";
import StudentCard from "../models/StudentCard.js";
import StudentClassAssignment from "../models/StudentClassAssignment.js";
import Attendance from "../models/Attendance.js";
import { lockStudent, currentPlacement, cardError } from "../services/studentCards.js";
import { academyDay, validateDay, ACADEMY_TIMEZONE } from "../utils/academyDay.js";
import { getTeacherClassSectionPairs, buildStudentAssignmentFilterFromPairs } from "../utils/teacherScope.js";
import { buildListQuery, paginatedResponse } from "../utils/listQuery.js";
import { absentStudents } from "../services/absentStudents.js";

export async function scan(req, res, next) {
  try {
    const token = req.body?.token;
    if (typeof token !== "string" || !/^AMS1_[A-Za-z0-9_-]{43}$/.test(token)) throw cardError("QR code not recognized", 400);
    const identity = await StudentCard.findOne({ token }).select("student");
    if (!identity) throw cardError("QR code not recognized", 404);
    let record, duplicate;
    await mongoose.connection.transaction(async session => {
      const student = await lockStudent(identity.student, session);
      const placement = await currentPlacement(student._id, session);
      const card = await StudentCard.findOne({ token }).session(session);
      const now = new Date();
      if (student.status !== "active") throw cardError("Student is inactive; attendance was not saved");
      if (!card || card.status !== "active") throw cardError("Card revoked or replaced; use the student's current card");
      if (String(card.assignment) !== String(placement._id) || String(card.class) !== String(placement.class._id) || String(card.section) !== String(placement.section._id) || String(card.academicSession) !== String(placement.academicSession._id)) throw cardError("Old class card is invalid; use the student's current card");
      if (card.expiresAt <= now) throw cardError("Card expired; renew it before checking in");
      const day = academyDay(now);
      record = await Attendance.findOne({ student: student._id, day }).session(session);
      duplicate = Boolean(record);
      if (!record) {
        [record] = await Attendance.create([{
          student: student._id, day, checkedInAt: now, card: card._id, method: "qr", recordedBy: req.user._id,
          class: card.class, section: card.section, academicSession: card.academicSession,
          className: placement.class.name, sectionName: placement.section.name, sessionName: placement.academicSession.name,
        }], { session });
      }
    });
    const student = await Student.findById(identity.student).select("fullName admissionNumber photoUrl");
    res.status(duplicate ? 200 : 201).json({ duplicate, message: duplicate ? "Already marked today" : "Attendance saved", student, record, timezone: ACADEMY_TIMEZONE });
  } catch (error) { next(error); }
}

export async function listAttendance(req, res, next) {
  try {
    const { page, limit, skip } = buildListQuery(req.query);
    const filter = {};
    for (const key of ["student", "class", "section", "academicSession"]) {
      if (req.query[key]) {
        if (!mongoose.isObjectIdOrHexString(req.query[key])) throw cardError(`Invalid ${key} ID`, 400);
        filter[key] = req.query[key];
      }
    }
    if (req.query.status && !["present", "absent"].includes(req.query.status)) throw cardError("Invalid attendance status", 400);
    if (req.query.status === "absent") return res.json(await absentStudents(req, filter, { page, limit, skip }));
    if (req.query.day) filter.day = validateDay(req.query.day);
    else if (req.query.from || req.query.to) {
      filter.day = {};
      if (req.query.from) filter.day.$gte = validateDay(req.query.from);
      if (req.query.to) filter.day.$lte = validateDay(req.query.to);
      if (req.query.from && req.query.to && req.query.from > req.query.to) throw cardError("Start date must not be after end date", 400);
    }
    if (req.user.role === "guardian") {
      filter.student = req.portalChild._id;
    } else if (req.user.role === "staff") {
      const pairs = await getTeacherClassSectionPairs(req.user.staffId);
      const studentIds = await StudentClassAssignment.find(buildStudentAssignmentFilterFromPairs(pairs)).distinct("student");
      filter.$and = [{ student: { $in: studentIds } }, { $or: pairs.length ? pairs : [{ _id: null }] }];
    }
    const query = Attendance.find(filter).sort({ day: -1, checkedInAt: -1, _id: -1 }).skip(skip).limit(limit)
      .populate("student", "fullName admissionNumber photoUrl");
    if (req.user.role === "guardian") query.select("-recordedBy -card");
    else query.populate("recordedBy", "username displayName role");
    const [items, total] = await Promise.all([query, Attendance.countDocuments(filter)]);
    res.json({ ...paginatedResponse(items, total, page, limit), timezone: ACADEMY_TIMEZONE });
  } catch (error) { next(error); }
}
