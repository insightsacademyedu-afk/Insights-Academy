import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  audience: { type: String, enum: ["all", "selected"], required: true },
  recipientType: { type: String, enum: ["guardian", "staff"], default: "guardian" },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  recipientIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], select: false },
  readBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], select: false },
  recipientCount: { type: Number, required: true },
}, { timestamps: true });
notificationSchema.index({ recipientIds: 1, createdAt: -1 });
export default mongoose.model("Notification", notificationSchema);
