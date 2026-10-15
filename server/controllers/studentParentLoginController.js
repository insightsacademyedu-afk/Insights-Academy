import mongoose from "mongoose";
import Student from "../models/Student.js";
import User from "../models/User.js";
import { phonePassword, provisionParent } from "../utils/parentLogin.js";
import { normalizeLoginPhone } from "../utils/loginIdentity.js";

export async function parentLoginAction(req, res, next) {
  try {
    let result;
    await mongoose.connection.transaction(async session => {
      const student = await Student.findOne({ _id: req.params.id, archivedAt: null }).populate("guardian").session(session);
      if (!student) throw Object.assign(new Error("Student not found"), { status: 404 });
      if (req.params.action === "enable" && !req.body.accountId) {
        result = await provisionParent(student.guardian, student._id, session);
        if (result.status === "inactive") {
          await User.updateOne({ _id: result.accountId }, { $set: { status: "active" }, $inc: { tokenVersion: 1 } }, { session });
        }
      } else {
        const account = await User.findOne({ _id: req.body.accountId, role: "guardian", studentIds: student._id }).session(session);
        if (!account) throw Object.assign(new Error("Parent account not found for this student"), { status: 404 });
        if (req.params.action === "enable") account.status = "active";
        else if (req.params.action === "reset-password") {
          const enteredPhone = account.phoneAsEntered || (normalizeLoginPhone(student.guardian?.primaryPhone) === account.phone ? student.guardian.primaryPhone : account.phone);
          account.passwordHash = await User.hashPassword(phonePassword(enteredPhone));
          account.phoneAsEntered = enteredPhone;
          account.mustChangePassword = false;
          account.failedLoginAttempts = 0;
          account.lockUntil = null;
          account.passwordResetTokenHash = null;
          account.passwordResetExpiresAt = null;
          account.passwordResetAttempts = 0;
        } else if (req.params.action === "disable") account.status = "inactive";
        else throw Object.assign(new Error("Unknown parent login action"), { status: 400 });
        account.tokenVersion += 1;
        await account.save({ session });
      }
    });
    res.json({ message: req.params.action === "reset-password" ? "Password reset to the parent's phone number. They can change it anytime in My account." : "Parent login updated.", ...result });
  } catch (error) { next(error); }
}
