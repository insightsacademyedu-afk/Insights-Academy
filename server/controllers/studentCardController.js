import mongoose from "mongoose";
import Student from "../models/Student.js";
import StudentCard from "../models/StudentCard.js";
import StudentClassAssignment from "../models/StudentClassAssignment.js";
import { lockStudent, currentPlacement, issueCard, cardError } from "../services/studentCards.js";
import { annualExpiry } from "../utils/academyDay.js";

export async function getCard(req, res, next) {
  try {
    const student = await Student.findOne({ _id: req.params.id, archivedAt: null })
      .select("fullName admissionNumber photoUrl status guardian").populate("guardian", "primaryPhone");
    if (!student) throw cardError("Student not found", 404);
    const [cardDoc, assignment, history] = await Promise.all([
      StudentCard.findOne({ student: student._id }).sort({ version: -1 }).select("+token"),
      StudentClassAssignment.findOne({ student: student._id, status: "active", archivedAt: null }).sort({ createdAt: -1, _id: -1 }).populate("class section academicSession"),
      StudentCard.find({ student: student._id }).sort({ version: -1 }).limit(20),
    ]);
    let card = null;
    if (cardDoc) {
      card = cardDoc.toObject();
      card.effectiveStatus = card.status === "revoked" ? "revoked" :
        student.status !== "active" ? "inactive_student" :
        !assignment || String(card.assignment) !== String(assignment._id) || [assignment.class, assignment.section, assignment.academicSession].some(doc => !doc || doc.archivedAt || doc.status !== "active") ? "invalid_class" :
        card.expiresAt <= new Date() ? "expired" : "active";
      if (card.status !== "active") delete card.token;
    }
    res.json({ student, card, currentAssignment: assignment, history });
  } catch (error) { next(error); }
}

export async function cardAction(req, res, next) {
  try {
    const action = req.params.action;
    if (!["issue", "renew", "replace", "revoke"].includes(action)) throw cardError("Unknown card action", 400);
    await mongoose.connection.transaction(async session => {
      const student = await lockStudent(req.params.id, session);
      const card = await StudentCard.findOne({ student: student._id }).sort({ version: -1 }).session(session);
      if (action === "revoke") {
        if (!card || card.status !== "active") throw cardError("There is no active card to revoke");
        card.status = "revoked"; card.revokedAt = new Date(); card.revokeReason = "revoked_by_administrator";
        await card.save({ session });
        return;
      }
      if (student.status !== "active") throw cardError("Only active students can receive a valid card");
      const assignment = await currentPlacement(student._id, session);
      if (action === "issue" && card) {
        if (card.status === "active" && String(card.assignment) === String(assignment._id)) return;
        throw cardError("Use Replace card to issue a replacement");
      }
      if (action === "renew") {
        if (!card || card.status !== "active" || String(card.assignment) !== String(assignment._id)) throw cardError("Only the current, unrevoked class card can be renewed");
        card.expiresAt = annualExpiry(card.expiresAt > new Date() ? card.expiresAt : new Date());
        await card.save({ session });
      } else {
        await issueCard(student._id, assignment, req.user._id, session, "replacement");
      }
    });
    return getCard(req, res, next);
  } catch (error) { next(error); }
}
