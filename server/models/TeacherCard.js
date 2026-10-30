import mongoose from "mongoose";
const { Schema } = mongoose;
const schema = new Schema({
  teacher: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
  version: { type: Number, required: true },
  token: { type: String, required: true, select: false },
  issuedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ["active", "revoked"], default: "active" },
  revokedAt: { type: Date, default: null },
  issuedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
schema.index({ token: 1 }, { unique: true });
schema.index({ teacher: 1, version: 1 }, { unique: true });
schema.index({ teacher: 1 }, { unique: true, partialFilterExpression: { status: "active" }, name: "one_active_teacher_card" });
export default mongoose.model("TeacherCard", schema);
