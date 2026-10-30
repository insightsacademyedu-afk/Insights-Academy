import mongoose from "mongoose";

const schema = new mongoose.Schema({
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
  teacherName: { type: String, required: true },
  designation: { type: String, default: "" },
  day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  checkedInAt: { type: Date, required: true },
  status: { type: String, enum: ["present"], default: "present" },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
schema.index({ teacher: 1, day: 1 }, { unique: true });
schema.index({ day: -1, checkedInAt: -1 });
export default mongoose.model("TeacherAttendance", schema);
