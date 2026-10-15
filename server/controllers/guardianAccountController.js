import mongoose from "mongoose";
import User from "../models/User.js";
import Student from "../models/Student.js";
import { normalizeLoginPhone } from "../utils/loginIdentity.js";
import { buildListQuery, paginatedResponse } from "../utils/listQuery.js";

const publicFields = "displayName email phone status studentIds createdAt";
const childPopulation = { path: "studentIds", select: "fullName admissionNumber", match: { archivedAt: null } };
const badRequest = message => Object.assign(new Error(message), { status: 400 });

function validPassword(password) {
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    throw badRequest("Password must contain at least 8 characters and at most 72 UTF-8 bytes");
  }
}

async function accountFields(body, session) {
  if (typeof body.displayName !== "string" || !body.displayName.trim() || body.displayName.length > 120) throw badRequest("Guardian name is required (maximum 120 characters)");
  if (body.email !== undefined && typeof body.email !== "string" || body.phone !== undefined && typeof body.phone !== "string") throw badRequest("Enter a valid email address or phone number");
  const email = body.email?.trim().toLowerCase() || undefined;
  const phone = body.phone?.trim() ? normalizeLoginPhone(body.phone) : undefined;
  if (email && (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))) throw badRequest("Enter a valid email address");
  if (body.phone?.trim() && !phone) throw badRequest("Enter a valid phone number");
  if (!email && !phone) throw badRequest("At least one login email address or phone number is required");
  if (!Array.isArray(body.studentIds) || !body.studentIds.length || body.studentIds.length > 100 ||
      body.studentIds.some(id => typeof id !== "string" || !mongoose.isObjectIdOrHexString(id))) throw badRequest("Select between 1 and 100 children");
  const studentIds = [...new Set(body.studentIds)];
  if (await Student.countDocuments({ _id: { $in: studentIds }, archivedAt: null }).session(session) !== studentIds.length) throw badRequest("One or more selected children are unavailable");
  const status = body.status ?? "active";
  if (!["active", "inactive"].includes(status)) throw badRequest("Invalid account status");
  return { displayName: body.displayName.trim(), email, phone, studentIds, status };
}

function handleError(error, res, next) {
  if (error.code === 11000) return res.status(409).json({ message: "That login email address or phone number is already in use. No changes were saved." });
  if (error.status) return res.status(error.status).json({ message: error.message });
  next(error);
}

export async function listAccounts(req, res, next) {
  try {
    const { filter, page, limit, skip } = buildListQuery(req.query, { searchFields: ["displayName", "email", "phone"], exactFilters: ["status"] });
    filter.role = "guardian";
    const [items, total] = await Promise.all([
      User.find(filter).select(publicFields).populate(childPopulation).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    res.json(paginatedResponse(items, total, page, limit));
  } catch (error) { next(error); }
}

export async function createAccount(req, res, next) {
  try {
    validPassword(req.body.password);
    const passwordHash = await User.hashPassword(req.body.password);
    let account;
    await mongoose.connection.transaction(async session => {
      const fields = await accountFields(req.body, session);
      const id = new mongoose.Types.ObjectId();
      [account] = await User.create([{ ...fields, _id: id, username: `guardian-${id}`, role: "guardian", passwordHash }], { session });
    });
    account = await User.findById(account._id).select(publicFields).populate(childPopulation);
    res.status(201).json(account);
  } catch (error) { handleError(error, res, next); }
}

export async function updateAccount(req, res, next) {
  try {
    let account;
    await mongoose.connection.transaction(async session => {
      account = await User.findOne({ _id: req.params.id, role: "guardian" }).session(session);
      if (!account) throw Object.assign(new Error("Guardian account not found"), { status: 404 });
      const fields = await accountFields(req.body, session);
      account.set(fields);
      // Changes to child access or login identifiers invalidate all prior sessions.
      account.tokenVersion += 1;
      account.passwordResetTokenHash = null;
      account.passwordResetExpiresAt = null;
      account.passwordResetAttempts = 0;
      await account.save({ session });
    });
    res.json(await User.findById(account._id).select(publicFields).populate(childPopulation));
  } catch (error) { handleError(error, res, next); }
}

export async function resetAccountPassword(req, res, next) {
  try {
    validPassword(req.body.password);
    const passwordHash = await User.hashPassword(req.body.password);
    const account = await User.findOneAndUpdate({ _id: req.params.id, role: "guardian" }, {
      $set: { passwordHash, failedLoginAttempts: 0, lockUntil: null, passwordResetTokenHash: null, passwordResetExpiresAt: null, passwordResetAttempts: 0 },
      $inc: { tokenVersion: 1 },
    });
    if (!account) return res.status(404).json({ message: "Guardian account not found" });
    res.json({ message: "Password reset. The guardian must sign in with the new password." });
  } catch (error) { handleError(error, res, next); }
}

export async function revokeAccount(req, res, next) {
  try {
    const account = await User.findOneAndUpdate({ _id: req.params.id, role: "guardian" }, {
      $set: { status: "inactive", passwordResetTokenHash: null, passwordResetExpiresAt: null, passwordResetAttempts: 0 }, $inc: { tokenVersion: 1 },
    });
    if (!account) return res.status(404).json({ message: "Guardian account not found" });
    res.json({ message: "Guardian access revoked" });
  } catch (error) { next(error); }
}
