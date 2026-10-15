import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  audience: { type: String, enum: ["all", "selected"], required: true },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  recipientIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], select: false },
  readBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], select: false },
  recipientCount: { type: Number, required: true },
  emailDeliveries: { type: [{
    recipient: { type: String, required: true },
    status: { type: String, enum: ["pending", "sending", "sent", "failed"], default: "pending" },
    startedAt: Date,
  }], select: false },
  emailSkipped: { type: Number, default: 0 },
  emailUnavailable: { type: Boolean, default: false },
}, { timestamps: true });
notificationSchema.index({ recipientIds: 1, createdAt: -1 });
export default mongoose.model("Notification", notificationSchema);
