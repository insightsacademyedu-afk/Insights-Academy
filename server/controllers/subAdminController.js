import User from "../models/User.js";

const fields = "username displayName email status createdAt lastLogin";
const invalid = message => Object.assign(new Error(message), { status: 400 });

async function accountValues(body, current) {
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (!/^[a-z\d._-]{3,40}$/.test(username)) throw invalid("Use 3–40 letters, numbers, dots, hyphens or underscores for the username.");
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw invalid("Enter a valid email address.");
  if (!displayName || displayName.length > 120) throw invalid("Enter a name of at most 120 characters.");
  if (!["active", "inactive"].includes(body.status ?? "active")) throw invalid("Invalid account status.");
  const collision = await User.exists({
    ...(current ? { _id: { $ne: current._id } } : {}),
    $or: [{ username: { $in: [username, email] } }, { email: { $in: [username, email] } }],
  });
  if (collision) throw Object.assign(new Error("That username or email is already in use."), { status: 409 });
  const values = { username, email, displayName, status: body.status ?? "active" };
  if (!current || body.password) {
    if (typeof body.password !== "string" || body.password.length < 8 || Buffer.byteLength(body.password, "utf8") > 72) {
      throw invalid("Password must have at least 8 characters and at most 72 UTF-8 bytes.");
    }
    values.passwordHash = await User.hashPassword(body.password);
  }
  return values;
}

function handleError(error, res, next) {
  if (error.code === 11000) return res.status(409).json({ message: "That username or email is already in use." });
  if (error.status) return res.status(error.status).json({ message: error.message });
  next(error);
}

export async function list(req, res, next) {
  try { res.json({ items: await User.find({ role: "subadmin" }).select(fields).sort({ createdAt: -1 }) }); }
  catch (error) { next(error); }
}

export async function create(req, res, next) {
  try {
    const values = await accountValues(req.body);
    const account = await User.create({ ...values, role: "subadmin" });
    res.status(201).json(await User.findById(account._id).select(fields));
  } catch (error) { handleError(error, res, next); }
}

export async function update(req, res, next) {
  try {
    const account = await User.findOne({ _id: req.params.id, role: "subadmin" });
    if (!account) return res.status(404).json({ message: "Sub-admin account not found." });
    const values = await accountValues(req.body, account);
    account.set(values);
    account.tokenVersion += 1;
    account.failedLoginAttempts = 0;
    account.lockUntil = null;
    account.passwordResetTokenHash = null;
    account.passwordResetExpiresAt = null;
    account.passwordResetAttempts = 0;
    await account.save();
    res.json(await User.findById(account._id).select(fields));
  } catch (error) { handleError(error, res, next); }
}
