import mongoose from "mongoose";
import Student from "../models/Student.js";
import StudentClassAssignment from "../models/StudentClassAssignment.js";
import Attendance from "../models/Attendance.js";
import Class from "../models/Class.js";
import Section from "../models/Section.js";
import AcademicSession from "../models/AcademicSession.js";
import { academyDay, validateDay, ACADEMY_TIMEZONE } from "../utils/academyDay.js";
import { cardError } from "./studentCards.js";
import { getTeacherClassSectionPairs } from "../utils/teacherScope.js";
import { paginatedResponse } from "../utils/listQuery.js";

export async function absentStudents(req, filters, { page, limit, skip }) {
  let selectedDay = req.query.day;
  if (!selectedDay) {
    if ((req.query.from || req.query.to) && req.query.from !== req.query.to) throw cardError("Select one date to view absent students", 400);
    selectedDay = req.query.from || academyDay();
  }
  const day = validateDay(selectedDay);
  if (day > academyDay()) throw cardError("Absent students can only be viewed for today or a past date", 400);
  const start = new Date(`${day}T00:00:00+05:00`);
  const end = new Date(start.getTime() + 86400000);
  const placementFilter = {};
  for (const field of ["student", "class", "section", "academicSession"]) if (filters[field]) placementFilter[field] = new mongoose.Types.ObjectId(filters[field]);
  if (req.user.role === "guardian") placementFilter.student = req.portalChild._id;
  if (req.user.role === "staff") {
    const pairs = await getTeacherClassSectionPairs(req.user.staffId);
    placementFilter.$or = pairs.length ? pairs : [{ _id: null }];
  }

  const pipeline = [
    // Pick the latest placement that existed on this date before applying class filters.
    // Otherwise a transferred student could incorrectly appear under their old class.
    { $match: { createdAt: { $lt: end } } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $group: { _id: "$student", placement: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$placement" } },
    { $match: { ...placementFilter, archivedAt: null, $expr: { $or: [
      { $eq: ["$status", "active"] },
      { $gt: [{ $ifNull: ["$endedAt", "$updatedAt"] }, start] },
    ] } } },
    { $lookup: { from: Student.collection.name, localField: "student", foreignField: "_id", as: "studentProfile",
      pipeline: [{ $match: { status: "active", archivedAt: null, admissionDate: { $lt: end } } }, { $project: { fullName: 1, admissionNumber: 1, photoUrl: 1 } }] } },
    { $unwind: "$studentProfile" },
    // Check attendance across every class/card so a same-day transfer cannot create an absence.
    { $lookup: { from: Attendance.collection.name, let: { studentId: "$student" }, as: "checkIn",
      pipeline: [{ $match: { day, $expr: { $eq: ["$student", "$$studentId"] } } }, { $limit: 1 }, { $project: { _id: 1 } }] } },
    { $match: { "checkIn.0": { $exists: false } } },
  ];
  for (const [field, model] of [["class", Class], ["section", Section], ["academicSession", AcademicSession]]) {
    pipeline.push({ $lookup: { from: model.collection.name, localField: field, foreignField: "_id", as: `${field}Info`,
      pipeline: [{ $match: { status: "active", archivedAt: null, ...(field === "academicSession" ? { startDate: { $lt: end }, endDate: { $gte: start } } : {}) } }, { $project: { name: 1 } }] } },
    { $unwind: `$${field}Info` });
  }
  pipeline.push({ $facet: {
    items: [{ $sort: { "studentProfile.fullName": 1, "studentProfile._id": 1 } }, { $skip: skip }, { $limit: limit },
      { $project: { _id: { $concat: ["absent-", { $toString: "$student" }, "-", day] }, student: "$studentProfile", day: { $literal: day }, status: { $literal: "absent" },
        class: 1, section: 1, academicSession: 1, className: "$classInfo.name", sectionName: "$sectionInfo.name", sessionName: "$academicSessionInfo.name",
        checkedInAt: { $literal: null }, recordedBy: { $literal: null } } }],
    count: [{ $count: "total" }],
  } });
  const [result] = await StudentClassAssignment.aggregate(pipeline);
  return { ...paginatedResponse(result?.items || [], result?.count[0]?.total || 0, page, limit), day, timezone: ACADEMY_TIMEZONE };
}
