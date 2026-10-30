import mongoose from "mongoose";
import Class from "../models/Class.js";
import Section from "../models/Section.js";
import Student from "../models/Student.js";
import StudentClassAssignment from "../models/StudentClassAssignment.js";
import Attendance from "../models/Attendance.js";
import { lockStudent, currentPlacement, cardError } from "../services/studentCards.js";
import { academyDay, validateDay, ACADEMY_TIMEZONE } from "../utils/academyDay.js";
import { buildListQuery, paginatedResponse } from "../utils/listQuery.js";

async function classScope(values, session = null) {
  if (!mongoose.isObjectIdOrHexString(values.class)) throw cardError("Select a valid class", 400);
  if (values.section && !mongoose.isObjectIdOrHexString(values.section)) throw cardError("Invalid section ID", 400);
  const klass = await Class.findOne({ _id: values.class, archivedAt: null, status: "active" }).populate("academicSession").session(session);
  if (!klass || !klass.academicSession || klass.academicSession.archivedAt || klass.academicSession.status !== "active") throw cardError("Class or academic session is inactive or unavailable", 404);
  if (values.section && !await Section.exists({ _id: values.section, class: klass._id, archivedAt: null, status: "active" }).session(session)) throw cardError("Select an active section belonging to this class", 400);
  return klass;
}

export async function classRoster(req, res, next) {
  try {
    const klass = await classScope(req.query);
    const { page, limit, skip } = buildListQuery(req.query);
    const day = academyDay();
    const filter = { class: klass._id };
    if (req.query.section) filter.section = new mongoose.Types.ObjectId(req.query.section);
    const [result] = await StudentClassAssignment.aggregate([
      { $match: { status: "active", archivedAt: null } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: "$student", placement: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$placement" } },
      { $match: filter },
      { $lookup: { from: Student.collection.name, localField: "student", foreignField: "_id", as: "profile",
        pipeline: [{ $match: { status: "active", archivedAt: null } }, { $project: { fullName: 1, admissionNumber: 1, photoUrl: 1 } }] } },
      { $unwind: "$profile" },
      { $lookup: { from: Section.collection.name, localField: "section", foreignField: "_id", as: "sectionInfo",
        pipeline: [{ $match: { status: "active", archivedAt: null } }, { $project: { name: 1 } }] } },
      { $unwind: "$sectionInfo" },
      { $facet: {
        items: [{ $sort: { "profile.fullName": 1, "profile._id": 1 } }, { $skip: skip }, { $limit: limit },
          { $lookup: { from: Attendance.collection.name, localField: "student", foreignField: "student", as: "checkIn",
            pipeline: [{ $match: { day } }, { $project: { checkedInAt: 1, method: 1 } }, { $limit: 1 }] } },
          { $project: { _id: "$student", student: "$profile", section: 1, sectionName: "$sectionInfo.name", attendance: { $ifNull: [{ $arrayElemAt: ["$checkIn", 0] }, null] } } }],
        count: [{ $count: "total" }],
      } },
    ]);
    res.json({ ...paginatedResponse(result?.items || [], result?.count[0]?.total || 0, page, limit), day, timezone: ACADEMY_TIMEZONE });
  } catch (error) { next(error); }
}

export async function markClassAttendance(req, res, next) {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.students) || body.students.length < 1 || body.students.length > 100 || body.students.some(id => !mongoose.isObjectIdOrHexString(id))) throw cardError("Select between 1 and 100 valid students", 400);
    const ids = body.students.map(id => String(id).toLowerCase()).sort();
    if (new Set(ids).size !== ids.length) throw cardError("Select each student only once", 400);
    if (body.day) validateDay(body.day);
    let marked, alreadyMarked, day;
    await mongoose.connection.transaction(async session => {
      const now = new Date(); day = academyDay(now);
      if (body.day && body.day !== day) throw cardError("Manual attendance is for today only. Refresh the class roster and retry.", 409);
      const klass = await classScope(body, session);
      marked = 0; alreadyMarked = 0;
      // Lock in deterministic order, using the same locks as QR scans and transfers.
      // A bad or stale selection rolls back the entire batch.
      for (const id of ids) {
        const student = await lockStudent(id, session);
        if (student.status !== "active") throw cardError(`${student.fullName} is inactive. Refresh the class roster.`);
        const placement = await currentPlacement(student._id, session);
        if (String(placement.class._id) !== String(klass._id) || body.section && String(placement.section._id) !== String(body.section)) throw cardError(`${student.fullName} is no longer in the selected class or section. Refresh the roster.`);
        const existing = await Attendance.exists({ student: student._id, day }).session(session);
        if (existing) { alreadyMarked++; continue; }
        await Attendance.create([{
          student: student._id, day, checkedInAt: now, method: "manual", card: null, recordedBy: req.user._id,
          class: placement.class._id, section: placement.section._id, academicSession: placement.academicSession._id,
          className: placement.class.name, sectionName: placement.section.name, sessionName: placement.academicSession.name,
        }], { session });
        marked++;
      }
    });
    res.json({ marked, alreadyMarked, day, timezone: ACADEMY_TIMEZONE, message: `${marked} marked present${alreadyMarked ? `; ${alreadyMarked} already marked` : ""}` });
  } catch (error) { next(error); }
}
