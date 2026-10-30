import mongoose from "mongoose";

const { Schema } = mongoose;
const schema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  assignment: { type: Schema.Types.ObjectId, ref: "StudentClassAssignment", required: true },
  class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  section: { type: Schema.Types.ObjectId, ref: "Section", required: true },
  academicSession: { type: Schema.Types.ObjectId, ref: "AcademicSession", required: true },
  className: { type: String, required: true },
  sectionName: { type: String, required: true },
  sessionName: { type: String, required: true },
  version: { type: Number, required: true },
  token: { type: String, required: true, select: false },
  issuedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ["active", "revoked"], default: "active" },
  revokedAt: { type: Date, default: null },
  revokeReason: { type: String, default: "" },
  issuedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
schema.index({ token: 1 }, { unique: true });
schema.index({ student: 1, version: 1 }, { unique: true });
schema.index({ student: 1 }, { unique: true, partialFilterExpression: { status: "active" }, name: "one_active_student_card" });
export default mongoose.model("StudentCard", schema);
