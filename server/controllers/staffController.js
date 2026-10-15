import mongoose from "mongoose";
import Staff from "../models/Staff.js";
import User from "../models/User.js";

export async function updateStaff(req, res, next) {
  try {
    const fields = ["fullName", "designation", "phone", "email", "joiningDate", "basicSalary", "salaryType", "status"];
    let staff;
    await mongoose.connection.transaction(async session => {
      staff = await Staff.findOne({ _id: req.params.id, archivedAt: null }).session(session);
      if (!staff) throw Object.assign(new Error("Staff not found"), { status: 404 });

      let user;
      if (staff.user) {
        user = await User.findOne({ _id: staff.user, staffId: staff._id, role: "staff" }).session(session);
        if (!user) throw Object.assign(new Error("Linked login account is unavailable. No changes were saved."), { status: 409 });
      }
      if (req.body.username !== undefined) {
        if (!user) throw Object.assign(new Error("Create a login account before setting a login username"), { status: 400 });
        if (typeof req.body.username !== "string" || !req.body.username.trim()) {
          throw Object.assign(new Error("Login username is required"), { status: 400 });
        }
        user.username = req.body.username.trim().toLowerCase();
      }
      for (const field of fields) {
        if (Object.hasOwn(req.body, field)) staff.set(field, req.body[field]);
      }
      if (user) {
        if (Object.hasOwn(req.body, "email")) {
          if (typeof req.body.email !== "string" || !req.body.email.trim()) {
            throw Object.assign(new Error("An email address is required for staff with a login account"), { status: 400 });
          }
          user.email = req.body.email.trim().toLowerCase();
        }
        if (user.isModified("username") || user.isModified("email") || staff.isModified("phone")) {
          user.tokenVersion += 1;
          user.passwordResetTokenHash = null;
          user.passwordResetExpiresAt = null;
          user.passwordResetAttempts = 0;
        }
        await user.save({ session });
      }
      await staff.save({ session });
    });
    await staff.populate([{ path: "designation" }, { path: "user", select: "username email status" }]);
    res.json(staff);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "That username or email is already taken. No changes were saved." });
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
}

// Admin action: issue login credentials for an existing staff profile.
// Kept separate from staff creation because a staff profile can exist
// (e.g. a part-time teacher) without ever needing a login account.
export async function createLogin(req, res, next) {
  try {
    const { username, email, password } = req.body;

    if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string" || !username.trim() || !email.trim() || !password) {
      return res.status(400).json({ message: "username, email and password are required" });
    }
    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const staff = await Staff.findOne({ _id: req.params.id, archivedAt: null });
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    if (staff.user) {
      return res.status(409).json({ message: "This staff member already has a login account" });
    }

    const passwordHash = await User.hashPassword(password);
    let user;
    await mongoose.connection.transaction(async (session) => {
      const current = await Staff.findOne({ _id: staff._id, archivedAt: null }).session(session);
      if (!current) throw Object.assign(new Error("Staff not found"), { status: 404 });
      if (current.user) throw Object.assign(new Error("This staff member already has a login account"), { status: 409 });
      if (current.status !== "active") throw Object.assign(new Error("Activate the staff profile before creating login access"), { status: 400 });
      [user] = await User.create([{ username: username.trim().toLowerCase(), email: email.trim().toLowerCase(), passwordHash, role: "staff", status: "active", staffId: current._id }], { session });
      current.user = user._id;
      await current.save({ session });
    });

    res.status(201).json({ message: "Login account created", user: user.toJSON() });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    if (err.code === 11000) {
      return res.status(409).json({ message: "That username or email is already taken" });
    }
    next(err);
  }
}

// Admin action: reset a staff member's password directly (per spec —
// "Admin can reset staff passwords"). Forces re-login everywhere by
// bumping tokenVersion.
export async function resetPassword(req, res, next) {
  try {
    const { password } = req.body;
    if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const staff = await Staff.findOne({ _id: req.params.id, archivedAt: null });
    if (!staff) return res.status(404).json({ message: "Staff not found" });
    if (!staff.user) return res.status(400).json({ message: "This staff member has no login account" });

    const user = await User.findById(staff.user).select("+tokenVersion");
    if (!user) return res.status(404).json({ message: "Linked user account not found" });

    await User.updateOne({ _id: user._id }, {
      $set: { passwordHash: await User.hashPassword(password), failedLoginAttempts: 0, lockUntil: null,
        passwordResetTokenHash: null, passwordResetExpiresAt: null, passwordResetAttempts: 0 },
      $inc: { tokenVersion: 1 },
    });

    res.json({ message: "Password reset. The staff member must log in with the new password." });
  } catch (err) {
    next(err);
  }
}

// Admin action: revoke a staff member's login without deleting their
// staff profile or history (deactivate, don't delete).
export async function revokeLogin(req, res, next) {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, archivedAt: null });
    if (!staff) return res.status(404).json({ message: "Staff not found" });
    if (!staff.user) return res.status(400).json({ message: "This staff member has no login account" });

    const user = await User.findById(staff.user).select("+tokenVersion");
    if (user) {
      await User.updateOne({ _id: user._id }, { $set: { status: "inactive",
        passwordResetTokenHash: null, passwordResetExpiresAt: null, passwordResetAttempts: 0 }, $inc: { tokenVersion: 1 } });
    }

    res.json({ message: "Login access revoked" });
  } catch (err) {
    next(err);
  }
}
