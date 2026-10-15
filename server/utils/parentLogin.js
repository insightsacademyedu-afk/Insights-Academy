import mongoose from "mongoose";
import User from "../models/User.js";
import { normalizeLoginPhone } from "./loginIdentity.js";

export function phonePassword(phone) {
  if (!normalizeLoginPhone(phone)) throw Object.assign(new Error("Enter a valid primary phone number for the parent login."), { status: 400 });
  if (phone.trim().length < 8) throw Object.assign(new Error("The guardian phone number used as the default password must contain at least 8 characters."), { status: 400 });
  return phone.trim();
}

// Enrollment and account linking commit together. Existing family passwords are never reset.
export async function provisionParent(contact, studentId, session) {
  const phone = normalizeLoginPhone(contact.primaryPhone);
  phonePassword(contact.primaryPhone);
  const email = contact.email?.trim().toLowerCase();
  const candidates = await User.find({ $or: [{ role: "guardian", phone }, ...(email ? [{ email }] : [])] }).session(session);
  const conflict = () => Object.assign(new Error("These parent contact details belong to a different account. Check the parent name, phone and email before saving."), { status: 409 });
  if (candidates.length > 1) throw conflict();
  let account = candidates[0];
  const created = !account;
  if (account) {
    const name = value => (value || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (account.role !== "guardian" || (account.phone && account.phone !== phone) ||
        (email && account.email && account.email !== email) ||
        (account.displayName && name(account.displayName) !== name(contact.fullName))) throw conflict();
    account.phone = phone;
    if (email) account.email = email;
    account.studentIds.addToSet(studentId);
    await account.save({ session });
  } else {
    const id = new mongoose.Types.ObjectId();
    [account] = await User.create([{
      _id: id, username: `guardian-${id}`, role: "guardian", displayName: contact.fullName,
      phone, phoneAsEntered: contact.primaryPhone, ...(email ? { email } : {}), studentIds: [studentId],
      passwordHash: await User.hashPassword(phonePassword(contact.primaryPhone)), mustChangePassword: false,
    }], { session });
  }
  return { created, accountId: account._id, phone: account.phoneAsEntered || contact.primaryPhone, email: account.email, status: account.status };
}
