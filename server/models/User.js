import { finiteNumbers } from "../utils/finiteNumbers.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema } = mongoose;

// Roles are an enum today (admin/staff/guardian) but the schema is written so
// new roles (accountant, principal, receptionist, parent...) can be
// added later without changing the shape of the collection.
const ROLES = ["admin", "staff", "guardian"];

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 40,
    },
    email: {
      type: String,
      required: function () { return this.role !== "guardian" || !this.phone; },
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email address"],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned by default queries
    },
    role: {
      type: String,
      enum: ROLES,
      required: true,
      default: "staff",
    },
    // Links a login account to a Staff profile (Phase 3). Null for admin.
    staffId: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },
    displayName: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true },
    phoneAsEntered: { type: String, trim: true, maxlength: 64 },
    studentIds: [{ type: Schema.Types.ObjectId, ref: "Student" }],
    mustChangePassword: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // --- Brute-force protection ---
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },

    // --- Token invalidation ---
    // Bumped whenever the password changes or an admin force-invalidates
    // sessions (e.g. on deactivation). Included in the JWT payload and
    // checked on every request so old tokens stop working instantly.
    tokenVersion: { type: Number, default: 0 },

    lastLogin: { type: Date, default: null },

    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null, select: false },
    passwordResetAttempts: { type: Number, default: 0, select: false },
  },
  { timestamps: true } // adds createdAt / updatedAt
);

userSchema.index({ email: 1 }, { unique: true, sparse: true, name: "email_optional_unique" });
userSchema.index({ phone: 1 }, { unique: true, name: "guardian_phone_unique", partialFilterExpression: { role: "guardian", phone: { $type: "string" } } });
userSchema.index({ role: 1, studentIds: 1 });

userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil > new Date());
};

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
};

// Never leak the hash or internal lockout counters to API responses.
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    delete ret.tokenVersion;
    delete ret.passwordResetTokenHash;
    delete ret.passwordResetExpiresAt;
    delete ret.passwordResetAttempts;
    delete ret.__v;
    if (ret.role === "guardian" && ret.phoneAsEntered) ret.phone = ret.phoneAsEntered;
    return ret;
  },
});

export const ROLE_VALUES = ROLES;
userSchema.plugin(finiteNumbers);
export default mongoose.model("User", userSchema);
