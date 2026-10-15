import { config } from "../config/env.js";
import User from "../models/User.js";
import Staff from "../models/Staff.js";
import Student from "../models/Student.js";
import { phoneLoginPattern, normalizeLoginPhone } from "../utils/loginIdentity.js";
import { signToken, getCookieOptions } from "../utils/token.js";
import { createHash, randomInt } from "node:crypto";
import { sendPasswordResetCode } from "../services/email.js";

const GENERIC_LOGIN_ERROR = "Invalid login details or password";
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_RESET_ATTEMPTS = 5;

function hashResetCode(code) {
  return createHash("sha256").update(code).digest("hex");
}

export async function login(req, res, next) {
  try {
    if (req.get("origin") && req.get("origin") !== config.clientUrl) return res.status(403).json({ message: "Untrusted login origin" });
    const { username, password, role } = req.body;

    if (typeof role !== "string" || !["admin", "subadmin", "staff", "parent"].includes(role)) {
      return res.status(400).json({ message: "Select Admin, Sub-admin, Staff or Parent to sign in." });
    }
    const accountRole = role === "parent" ? "guardian" : role;

    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || username.length > 254 || !password || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Username, email or phone number and password are required" });
    }

    const identifier = username.trim().toLowerCase();
    const identities = [{ username: identifier, role: { $ne: "guardian" } }, { email: identifier }];
    const escapedName = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    identities.push({ role: "guardian", displayName: new RegExp(`^${escapedName}$`, "i") });
    const phonePattern = phoneLoginPattern(identifier);
    if (phonePattern) {
      identities.push({ phone: normalizeLoginPhone(identifier), role: "guardian" });
      const profiles = await Staff.find({ phone: phonePattern, user: { $ne: null }, archivedAt: null })
        .select("_id user").limit(3).lean();
      for (const profile of profiles) {
        identities.push({ _id: profile.user, staffId: profile._id, role: "staff" });
      }
      // More than two matching profiles is already an ambiguous phone number.
      if (profiles.length > 2) return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
    }
    const candidates = await User.find({ $or: identities }).limit(2)
      .select("+passwordHash +failedLoginAttempts +lockUntil +tokenVersion");
    // Shared phone numbers and collisions across identity types must never pick an arbitrary account.
    const user = candidates.length === 1 ? candidates[0] : null;

    // Same generic message whether the user exists or not, to avoid
    // leaking which usernames are registered.
    if (!user || user.role !== accountRole) {
      return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
    }

    if (user.isLocked()) {
      const minutesLeft = Math.ceil((user.lockUntil - new Date()) / 60000);
      return res.status(423).json({
        message: `Account temporarily locked. Try again in ${minutesLeft} minute(s).`,
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "Account is deactivated. Contact your administrator." });
    }

    let passwordMatches = await user.comparePassword(password);
    let enteredPhoneUpgrade;
    // Accept the recorded phone for legacy default-password accounts, preserving custom passwords.
    if (!passwordMatches && user.role === "guardian" && !user.phoneAsEntered) {
      const children = await Student.find({ _id: { $in: user.studentIds } }).select("guardian").populate("guardian");
      const contact = children.map(child => child.guardian).find(guardian => guardian?.primaryPhone === password && normalizeLoginPhone(guardian.primaryPhone) === user.phone);
      const oldDefault = /^923\d{9}$/.test(user.phone || "") ? `0${user.phone.slice(2)}` : user.phone;
      if (contact && await user.comparePassword(oldDefault)) {
        enteredPhoneUpgrade = { phoneAsEntered: contact.primaryPhone, passwordHash: await User.hashPassword(password) };
        passwordMatches = true;
      }
    }

    if (!passwordMatches) {
      const reachesLimit = { $gte: [{ $add: ["$failedLoginAttempts", 1] }, config.loginMaxAttempts] };
      await User.updateOne({ _id: user._id, passwordHash: user.passwordHash, tokenVersion: user.tokenVersion,
        $or: [{ lockUntil: null }, { lockUntil: { $lte: new Date() } }] }, [
        { $set: {
          failedLoginAttempts: { $cond: [reachesLimit, 0, { $add: ["$failedLoginAttempts", 1] }] },
          lockUntil: { $cond: [reachesLimit, new Date(Date.now() + config.loginLockoutMinutes * 60000), null] },
        } },
      ]);
      return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
    }

    if (user.role === "staff" && (!user.staffId || !await Staff.exists({
      _id: user.staffId, status: "active", archivedAt: null,
    }))) return res.status(403).json({ message: "Staff profile is inactive or unavailable" });

    // Successful login: reset counters, update lastLogin
    const current = await User.findOneAndUpdate({
      _id: user._id, role: accountRole, passwordHash: user.passwordHash, tokenVersion: user.tokenVersion, status: "active",
      $or: [{ lockUntil: null }, { lockUntil: { $lte: new Date() } }],
    }, { $set: { failedLoginAttempts: 0, lockUntil: null, lastLogin: new Date(), ...enteredPhoneUpgrade } }, { new: true });
    if (!current) return res.status(401).json({ message: GENERIC_LOGIN_ERROR });

    const token = signToken(current);
    res.cookie(config.cookieName, token, getCookieOptions());

    return res.json({ user: current.toJSON() });
  } catch (err) {
    next(err);
  }
}

export async function requestPasswordReset(req, res, next) {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: "Enter a valid account email address." });

    const code = String(randomInt(100000, 1000000));
    // Reserve issuance atomically and keep a one-minute cooldown per account.
    const user = await User.findOneAndUpdate({ email, role: { $ne: "guardian" }, status: "active", $or: [
      { passwordResetExpiresAt: null },
      { passwordResetExpiresAt: { $lte: new Date(Date.now() + RESET_CODE_TTL_MS - 60000) } },
    ] }, { $set: {
      passwordResetTokenHash: hashResetCode(code),
      passwordResetExpiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
      passwordResetAttempts: 0,
    } });
    if (user) {
      try {
        await sendPasswordResetCode({ recipient: user.email, code });
      } catch (error) {
        console.error("[auth] password reset email failed:", error.message);
      }
    }

    return res.json({ message: "If an active account uses that email, a reset code has been sent." });
  } catch (error) { next(error); }
}

export async function resetPassword(req, res, next) {
  try {
    const { email, code, newPassword, confirmPassword } = req.body;
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || typeof code !== "string" || !/^\d{6}$/.test(code) ||
        typeof newPassword !== "string" || newPassword.length < 8 || Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({ message: "Enter the email, six-digit code, and a new password of at least 8 characters." });
    }
    if (newPassword !== confirmPassword) return res.status(400).json({ message: "New passwords do not match." });

    // Claim one of the five attempts in the database, including concurrent requests.
    const user = await User.findOneAndUpdate({
      email: normalizedEmail, role: { $ne: "guardian" }, status: "active",
      passwordResetTokenHash: { $ne: null },
      passwordResetExpiresAt: { $gt: new Date() },
      passwordResetAttempts: { $lt: MAX_RESET_ATTEMPTS },
    }, { $inc: { passwordResetAttempts: 1 } }, { new: true })
      .select("+passwordResetTokenHash +passwordResetExpiresAt +passwordResetAttempts");
    if (!user) {
      return res.status(400).json({ message: "That reset code is invalid or expired." });
    }
    if (hashResetCode(code) !== user.passwordResetTokenHash) {
      return res.status(400).json({ message: "That reset code is invalid or expired." });
    }

    const passwordHash = await User.hashPassword(newPassword);
    // Consume the code once; a competing reset or password change must win safely.
    const updated = await User.findOneAndUpdate({
      _id: user._id, status: "active", tokenVersion: user.tokenVersion,
      passwordResetTokenHash: user.passwordResetTokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    }, { $set: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null,
      passwordResetAttempts: 0, failedLoginAttempts: 0, lockUntil: null }, $inc: { tokenVersion: 1 } });
    if (!updated) return res.status(400).json({ message: "That reset code is invalid or expired." });
    return res.json({ message: "Password reset successfully. You can now sign in." });
  } catch (error) { next(error); }
}

export async function logout(req, res, next) {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    const cookieOptions = getCookieOptions();
    delete cookieOptions.maxAge;
    res.clearCookie(config.cookieName, cookieOptions);
    return res.json({ message: "Logged out" });
  } catch (error) { next(error); }
}

export async function me(req, res) {
  // req.user is set by requireAuth
  return res.json({ user: req.user.toJSON() });
}

export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword, 'utf8') > 72 ||
        typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({ message: 'Enter your current password and a new password of at least 8 characters (maximum 72 UTF-8 bytes).' });
    }
    if (newPassword !== confirmPassword) return res.status(400).json({ message: 'New passwords do not match.' });
    if (newPassword === currentPassword) return res.status(400).json({ message: 'Choose a different new password.' });
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user || !await user.comparePassword(currentPassword)) return res.status(400).json({ message: 'Current password is incorrect.' });
    const passwordHash = await User.hashPassword(newPassword);
    // Compare-and-swap prevents competing changes or an admin reset from being overwritten.
    const updated = await User.findOneAndUpdate({ _id: user._id, status: 'active', passwordHash: user.passwordHash, tokenVersion: req.user.tokenVersion },
      { $set: { passwordHash, mustChangePassword: false, failedLoginAttempts: 0, lockUntil: null,
        passwordResetTokenHash: null, passwordResetExpiresAt: null, passwordResetAttempts: 0 }, $inc: { tokenVersion: 1 } }, { new: true });
    if (!updated) return res.status(409).json({ message: 'Your account changed. Sign in again before changing your password.' });
    res.cookie(config.cookieName, signToken(updated), getCookieOptions());
    return res.json({ message: 'Password changed. Other sessions have been signed out.' });
  } catch (error) { next(error); }
}
