import { randomBytes } from "node:crypto";
import Student from "../models/Student.js";
import StudentCard from "../models/StudentCard.js";
import StudentClassAssignment from "../models/StudentClassAssignment.js";
import { annualExpiry } from "../utils/academyDay.js";

export const cardError = (message, status = 409) => Object.assign(new Error(message), { status });

// Every scan, transfer and card action writes the same student document.
// Mongo transaction retries serialize races between card validation and transfer.
export async function lockStudent(id, session) {
  const student = await Student.findOneAndUpdate({ _id: id, archivedAt: null }, { $inc: { cardLockVersion: 1 } }, { new: true, session });
  if (!student) throw cardError("Student not found", 404);
  return student;
}

export async function currentPlacement(student, session) {
  const assignment = await StudentClassAssignment.findOne({ student, status: "active", archivedAt: null })
    .sort({ createdAt: -1, _id: -1 }).populate("class section academicSession").session(session);
  if (!assignment || [assignment.class, assignment.section, assignment.academicSession].some(doc => !doc || doc.archivedAt || doc.status !== "active")) {
    throw cardError("An active class, section and academic session are required");
  }
  return assignment;
}

export async function issueCard(studentId, assignment, userId, session, reason = "replaced") {
  const populated = await StudentClassAssignment.findById(assignment._id).populate("class section academicSession").session(session);
  const previous = await StudentCard.findOne({ student: studentId }).sort({ version: -1 }).session(session);
  await StudentCard.updateMany({ student: studentId, status: "active" }, { $set: { status: "revoked", revokedAt: new Date(), revokeReason: reason } }, { session });
  const now = new Date();
  const [card] = await StudentCard.create([{
    student: studentId, assignment: assignment._id,
    class: populated.class._id, section: populated.section._id, academicSession: populated.academicSession._id,
    className: populated.class.name, sectionName: populated.section.name, sessionName: populated.academicSession.name,
    version: (previous?.version || 0) + 1, token: `AMS1_${randomBytes(32).toString("base64url")}`,
    issuedAt: now, expiresAt: annualExpiry(now), issuedBy: userId,
  }], { session });
  return card;
}
