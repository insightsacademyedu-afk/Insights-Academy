import mongoose from "mongoose";

const { Schema } = mongoose;
const schema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  checkedInAt: { type: Date, required: true },
  card: { type: Schema.Types.ObjectId, ref: "StudentCard", required: true },
  class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  section: { type: Schema.Types.ObjectId, ref: "Section", required: true },
  academicSession: { type: Schema.Types.ObjectId, ref: "AcademicSession", required: true },
  className: { type: String, required: true },
  sectionName: { type: String, required: true },
  sessionName: { type: String, required: true },
  status: { type: String, enum: ["present"], default: "present" },
  recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
schema.index({ student: 1, day: 1 }, { unique: true });
schema.index({ day: -1, class: 1, section: 1 });
export default mongoose.model("Attendance", schema);
