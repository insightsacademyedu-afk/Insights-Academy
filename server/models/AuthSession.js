import mongoose from "mongoose";

const authSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tokenVersion: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true, collection: "authsessions" });

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ user: 1, revokedAt: 1 });

export default mongoose.model("AuthSession", authSessionSchema);
