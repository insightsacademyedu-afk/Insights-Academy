import { Router } from "express";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { requireAuth, requireRole } from "../middleware/auth.js";
import Staff from "../models/Staff.js";
import TeacherCard from "../models/TeacherCard.js";
import { annualExpiry } from "../utils/academyDay.js";
import { cardError } from "../services/studentCards.js";

const router = Router();
router.use(requireAuth, requireRole("admin", "subadmin"));
router.param("id", (req, res, next, id) => mongoose.isObjectIdOrHexString(id) ? next() : next(cardError("Invalid teacher ID", 400)));
async function getCard(req, res, next) {
  try {
    const teacher = await Staff.findOne({ _id: req.params.id, archivedAt: null }).select("fullName photoUrl cardDesignation designation status").populate("designation", "title");
    if (!teacher) throw cardError("Teacher not found", 404);
    const [current, history] = await Promise.all([
      TeacherCard.findOne({ teacher: teacher._id }).sort({ version: -1 }).select("+token"),
      TeacherCard.find({ teacher: teacher._id }).sort({ version: -1 }).limit(20),
    ]);
    const card = current?.toObject() || null;
    if (card) {
      card.effectiveStatus = card.status === "revoked" ? "revoked" : teacher.status !== "active" ? "inactive_teacher" : card.expiresAt <= new Date() ? "expired" : "active";
      if (card.status !== "active") delete card.token;
    }
    res.json({ teacher, employeeId: `EMP-${String(teacher._id).toUpperCase()}`, card, history });
  } catch (error) { next(error); }
}
router.get("/:id", getCard);
router.put("/:id", async (req, res, next) => {
  try {
    const { fullName, cardDesignation, photoUrl } = req.body;
    if (typeof fullName !== "string" || !fullName.trim() || fullName.trim().length > 120 || typeof cardDesignation !== "string" || !cardDesignation.trim() || cardDesignation.trim().length > 120 || typeof photoUrl !== "string") throw cardError("Name, designation and a valid photo value are required", 400);
    const teacher = await Staff.findOne({ _id: req.params.id, archivedAt: null });
    if (!teacher) throw cardError("Teacher not found", 404);
    teacher.fullName = fullName.trim(); teacher.cardDesignation = cardDesignation.trim(); teacher.photoUrl = photoUrl;
    await teacher.save();
    return getCard(req, res, next);
  } catch (error) { next(error); }
});
router.post("/:id/:action", async (req, res, next) => {
  try {
    const { action } = req.params;
    if (!["issue", "replace", "renew", "revoke"].includes(action)) throw cardError("Unknown card action", 400);
    await mongoose.connection.transaction(async session => {
      const teacher = await Staff.findOneAndUpdate({ _id: req.params.id, archivedAt: null }, { $inc: { cardLockVersion: 1 } }, { new: true, session });
      if (!teacher) throw cardError("Teacher not found", 404);
      const card = await TeacherCard.findOne({ teacher: teacher._id }).sort({ version: -1 }).session(session);
      if (action === "revoke") {
        if (!card || card.status !== "active") throw cardError("No active card to revoke");
        card.status = "revoked"; card.revokedAt = new Date(); await card.save({ session }); return;
      }
      if (teacher.status !== "active") throw cardError("Only active teachers can receive cards");
      if (action === "issue" && card) { if (card.status === "active") return; throw cardError("Use Replace card for a revoked card"); }
      if (action === "renew") {
        if (!card || card.status !== "active") throw cardError("Only an unrevoked card can be renewed");
        card.expiresAt = annualExpiry(card.expiresAt > new Date() ? card.expiresAt : new Date()); await card.save({ session }); return;
      }
      await TeacherCard.updateMany({ teacher: teacher._id, status: "active" }, { $set: { status: "revoked", revokedAt: new Date() } }, { session });
      const now = new Date();
      await TeacherCard.create([{ teacher: teacher._id, version: (card?.version || 0) + 1, token: `AMT1_${randomBytes(32).toString("base64url")}`, issuedAt: now, expiresAt: annualExpiry(now), issuedBy: req.user._id }], { session });
    });
    return getCard(req, res, next);
  } catch (error) { next(error); }
});
export default router;
