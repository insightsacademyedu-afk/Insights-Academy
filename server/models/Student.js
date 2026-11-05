import { moneyFields, sumMoney } from "../utils/money.js";
import { finiteNumbers } from "../utils/finiteNumbers.js";
import mongoose from "mongoose";

const { Schema } = mongoose;

// Per spec: never store a single permanent fee value. This is the
// per-student fee structure; actual invoicing/payment history lives in
// Phase 5's StudentFee/FeePayment collections, which read these values.
const feeDetailsSchema = new Schema(
  {
    monthlyTuition: { type: Number, min: 0, default: 0 },
    admissionFee: { type: Number, min: 0, default: 0 },
    testSessionFee: { type: Number, min: 0, default: 0 },
    stationeryFee: { type: Number, min: 0, default: 0 },
    examFee: { type: Number, min: 0, default: 0 },
    otherFee: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },
    scholarship: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

moneyFields(feeDetailsSchema, ["monthlyTuition","admissionFee","testSessionFee","stationeryFee","examFee","otherFee","discount","scholarship"]);

const studentSchema = new Schema(
  {
    admissionNumber: { type: String, required: true, unique: true, trim: true },
    cardLockVersion: { type: Number, default: 0, select: false },

    // Personal information
    fullName: { type: String, required: true, trim: true },
    fatherName: { type: String, trim: true, default: "" },
    gender: { type: String, enum: ["male", "female", "other"], required: true },
    dob: { type: Date, required: true },
    cnicOrBForm: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    photoUrl: {
      type: String, trim: true, default: "", maxlength: 350000,
      validate: {
        validator: value => !value || /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) || /^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value),
        message: "Use an uploaded JPG, PNG or WebP photo, or a valid photo URL",
      },
    },
    admissionDate: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ["active", "inactive", "transferred", "graduated", "expelled"],
      default: "active",
    },

    // Parent/Guardian
    guardian: {
      type: Schema.Types.ObjectId,
      ref: "Guardian",
      required: true,
    },

    feeDetails: { type: feeDetailsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

// Virtual: total payable, computed the same way everywhere it's needed
// instead of being recalculated ad hoc in multiple controllers.
studentSchema.virtual("totalPayable").get(function () {
  const f = this.feeDetails || {};
  return Math.max(0, sumMoney(f.monthlyTuition, f.admissionFee, f.testSessionFee, f.stationeryFee, f.examFee, f.otherFee, -Number(f.discount || 0), -Number(f.scholarship || 0)));
});

studentSchema.set("toJSON", { virtuals: true });

studentSchema.index({ fullName: "text", admissionNumber: "text" });
studentSchema.index({ archivedAt: 1, createdAt: -1 });
studentSchema.index({ archivedAt: 1, status: 1 });

studentSchema.plugin(finiteNumbers);
export default mongoose.model("Student", studentSchema);
