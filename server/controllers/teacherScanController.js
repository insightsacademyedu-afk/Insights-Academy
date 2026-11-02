import mongoose from "mongoose";
import TeacherCard from "../models/TeacherCard.js";
import Staff from "../models/Staff.js";
import TeacherAttendance from "../models/TeacherAttendance.js";
import { academyDay, ACADEMY_TIMEZONE } from "../utils/academyDay.js";
import { cardError } from "../services/studentCards.js";

export async function scanTeacherCard(req, res, next) {
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
}
