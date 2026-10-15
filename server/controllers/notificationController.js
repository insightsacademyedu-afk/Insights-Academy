import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import { emailIsConfigured } from "../services/email.js";
import { buildListQuery, paginatedResponse } from "../utils/listQuery.js";

export async function listRecipients(req, res, next) {
  try {
    const students = req.query.kind === "students";
    const { filter, page, limit, skip } = buildListQuery(req.query, {
      searchFields: students ? ["fullName", "admissionNumber"] : ["displayName", "username", "phone", "email"],
    });
    const Model = students ? Student : User;
    Object.assign(filter, students ? { archivedAt: null } : { role: "guardian", status: "active" });
    const [items, total] = await Promise.all([
      Model.find(filter).select(students ? "fullName admissionNumber" : "displayName username phone").sort(students ? { fullName: 1, _id: 1 } : { displayName: 1, _id: 1 }).skip(skip).limit(limit).lean(),
      Model.countDocuments(filter),
    ]);
    if (students) {
      const accounts = await User.find({ role: "guardian", status: "active", studentIds: { $in: items.map(item => item._id) } }).select("studentIds").lean();
      for (const item of items) item.guardianCount = accounts.filter(account => account.studentIds.some(id => String(id) === String(item._id))).length;
    }
    res.json(paginatedResponse(items, total, page, limit));
  } catch (error) { next(error); }
}

export async function sendNotification(req, res, next) {
  try {
    const { title, message, audience, guardianIds = [], studentIds = [] } = req.body;
    if (typeof title !== "string" || !title.trim() || title.trim().length > 160 ||
        typeof message !== "string" || !message.trim() || message.trim().length > 5000 ||
        !["all", "selected"].includes(audience)) {
      return res.status(400).json({ message: "Enter a title (up to 160 characters), message (up to 5000 characters) and valid audience." });
    }
    for (const ids of [guardianIds, studentIds]) {
      if (!Array.isArray(ids) || ids.length > 1000 || ids.some(id => typeof id !== "string" || !mongoose.isObjectIdOrHexString(id))) {
        return res.status(400).json({ message: "Select valid recipients (up to 1000 per type)." });
      }
    }
    const filter = { role: "guardian", status: "active" };
    if (audience === "selected") {
      const students = await Student.find({ _id: { $in: studentIds }, archivedAt: null }).distinct("_id");
      if (students.length !== new Set(studentIds).size) return res.status(400).json({ message: "One or more selected students are unavailable." });
      const directCount = await User.countDocuments({ ...filter, _id: { $in: guardianIds } });
      if (directCount !== new Set(guardianIds).size) return res.status(400).json({ message: "One or more selected guardians are unavailable." });
      // Require a delivery account for every selected student; never silently skip a family.
      const linked = await User.find({ ...filter, studentIds: { $in: students } }).select("studentIds").lean();
      const covered = new Set(linked.flatMap(user => user.studentIds.map(String)));
      if (students.some(id => !covered.has(String(id)))) return res.status(400).json({ message: "A selected student has no active guardian login. Create their parent login first." });
      filter.$or = [{ _id: { $in: guardianIds } }, { studentIds: { $in: students } }];
    }
    const recipients = await User.find(filter).select("email").lean();
    const recipientIds = recipients.map(user => user._id);
    if (!recipientIds.length) return res.status(400).json({ message: "No active guardian accounts match this audience." });
    const emailDeliveries = recipients.filter(user => user.email).map(user => ({ recipient: user.email }));
    const emailUnavailable = !emailIsConfigured();
    const notification = await Notification.create({ title, message, audience, sentBy: req.user._id, recipientIds, recipientCount: recipientIds.length,
      emailDeliveries: emailDeliveries.map(item => ({ ...item, status: emailUnavailable ? "failed" : "pending" })),
      emailSkipped: recipients.length - emailDeliveries.length, emailUnavailable,
    });
    res.status(201).json({ _id: notification._id, recipientCount: recipientIds.length, emailQueued: emailUnavailable ? 0 : emailDeliveries.length,
      emailSkipped: notification.emailSkipped, emailUnavailable });
  } catch (error) { next(error); }
}

export async function listNotifications(req, res, next) {
  try {
    const guardian = req.user.role === "guardian";
    const filter = guardian ? { recipientIds: req.user._id } : {};
    const { page, limit, skip } = buildListQuery(req.query);
    const [rows, total, unreadCount] = await Promise.all([
      Notification.find(filter).select(guardian ? "title message createdAt +readBy" : "title message createdAt audience recipientCount emailSkipped emailUnavailable +emailDeliveries").sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(filter),
      guardian ? Notification.countDocuments({ ...filter, readBy: { $ne: req.user._id } }) : Promise.resolve(0),
    ]);
    const items = rows.map(({ readBy, emailDeliveries, ...row }) => guardian ? { ...row, read: (readBy || []).some(id => String(id) === String(req.user._id)) } : {
      ...row, email: {
        sent: (emailDeliveries || []).filter(item => item.status === "sent").length,
        failed: (emailDeliveries || []).filter(item => item.status === "failed").length,
        pending: (emailDeliveries || []).filter(item => ["pending", "sending"].includes(item.status)).length,
        skipped: row.emailSkipped,
      },
    });
    res.json({ ...paginatedResponse(items, total, page, limit), unreadCount });
  } catch (error) { next(error); }
}

export async function markNotificationRead(req, res, next) {
  try {
    const result = await Notification.updateOne({ _id: req.params.id, recipientIds: req.user._id }, { $addToSet: { readBy: req.user._id } });
    if (!result.matchedCount) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Notification marked as read" });
  } catch (error) { next(error); }
}
