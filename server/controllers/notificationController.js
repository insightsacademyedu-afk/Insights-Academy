import Notification from "../models/Notification.js";
import User from "../models/User.js";
import Staff from "../models/Staff.js";
import { buildListQuery, paginatedResponse } from "../utils/listQuery.js";

export async function sendNotification(req, res, next) {
  try {
    const { title, message, recipientType } = req.body;
    if (typeof title !== "string" || !title.trim() || title.trim().length > 160 ||
        typeof message !== "string" || !message.trim() || message.trim().length > 5000 ||
        !["guardian", "staff"].includes(recipientType)) {
      return res.status(400).json({ message: "Choose Guardian or Staff, enter a title (up to 160 characters) and a message (up to 5000 characters)." });
    }
    const filter = { role: recipientType, status: "active" };
    if (recipientType === "staff") {
      filter.staffId = { $in: await Staff.find({ status: "active", archivedAt: null }).distinct("_id") };
    }
    const recipientIds = await User.find(filter).distinct("_id");
    if (!recipientIds.length) return res.status(400).json({ message: `No active ${recipientType} portal accounts are available.` });
    const notification = await Notification.create({ title, message, recipientType, audience: "all", sentBy: req.user._id, recipientIds, recipientCount: recipientIds.length });
    res.status(201).json({ _id: notification._id, recipientCount: recipientIds.length, recipientType });
  } catch (error) { next(error); }
}

export async function listNotifications(req, res, next) {
  try {
    const admin = req.user.role === "admin";
    const filter = admin ? {} : { recipientIds: req.user._id };
    const { page, limit, skip } = buildListQuery(req.query);
    const [rows, total, unreadCount] = await Promise.all([
      Notification.find(filter).select(admin ? "title message createdAt audience recipientType recipientCount" : "title message createdAt +readBy")
        .sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(filter),
      admin ? Promise.resolve(0) : Notification.countDocuments({ ...filter, readBy: { $ne: req.user._id } }),
    ]);
    const items = rows.map(({ readBy, ...row }) => admin ? { ...row, recipientType: row.recipientType || "guardian" } : {
      ...row, read: (readBy || []).some(id => String(id) === String(req.user._id)),
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
