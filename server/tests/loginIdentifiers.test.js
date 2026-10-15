import request from "supertest";
import app from "../app.js";
import Staff from "../models/Staff.js";
import User from "../models/User.js";
import { createAdminSession, createTeacherSession, withCsrf } from "./helpers/authHelpers.js";

const signIn = (identifier, password = "Password123!", role = "staff") => request(app)
  .post("/api/auth/login").send({ role, username: identifier, password });

test("the same staff account accepts its username, email and formatted local/international phone numbers", async () => {
  const teacher = await createTeacherSession(app, { username: "teacher.one", email: "teacher@gmail.com" });
  await Staff.findByIdAndUpdate(teacher.staff._id, { phone: "+92 (300) 123-4567" });
  for (const identifier of ["teacher.one", " TEACHER@GMAIL.COM ", "03001234567", "0300-1234567", "+92 300 1234567", "00923001234567"]) {
    const response = await signIn(identifier);
    expect(response.status).toBe(200);
    expect(response.body.user._id).toBe(String(teacher.user._id));
    expect(response.body.user.passwordHash).toBeUndefined();
  }
});

test("administrator email sign-in works too", async () => {
  const admin = await createAdminSession(app);
  expect((await signIn(admin.user.email, "Password123!", "admin")).status).toBe(200);
});

test("phone edits immediately change which phone number can sign in", async () => {
  const admin = await createAdminSession(app);
  const teacher = await createTeacherSession(app);
  await Staff.findByIdAndUpdate(teacher.staff._id, { phone: "03001234567" });
  const updated = await withCsrf(admin.agent.put(`/api/staff/${teacher.staff._id}`).send({ phone: "0311-7654321" }), admin.csrfToken);
  expect(updated.status).toBe(200);
  expect((await teacher.agent.get("/api/auth/me")).status).toBe(401);
  expect((await signIn("03001234567")).status).toBe(401);
  expect((await signIn("+923117654321")).status).toBe(200);
});

test("a shared phone is rejected instead of choosing one staff account", async () => {
  const first = await createTeacherSession(app);
  const second = await createTeacherSession(app);
  await Staff.findByIdAndUpdate(first.staff._id, { phone: "0300-1234567" });
  await Staff.findByIdAndUpdate(second.staff._id, { phone: "+923001234567" });
  expect((await signIn("03001234567")).status).toBe(401);
  expect((await signIn(first.user.username)).status).toBe(200);
  expect((await signIn(second.user.email)).status).toBe(200);
});

test("a username matching another account's email is rejected as ambiguous", async () => {
  const first = await createTeacherSession(app);
  await createTeacherSession(app, { username: first.user.email });
  expect((await signIn(first.user.email)).status).toBe(401);
});

test("all three identifiers share the same password failure limit", async () => {
  const teacher = await createTeacherSession(app);
  await Staff.findByIdAndUpdate(teacher.staff._id, { phone: "03001234567" });
  const identifiers = [teacher.user.username, teacher.user.email, "03001234567", teacher.user.email, "+923001234567"];
  for (const identifier of identifiers) expect((await signIn(identifier, "wrong-password")).status).toBe(401);
  expect((await signIn(teacher.user.username)).status).toBe(423);
  expect((await signIn(teacher.user.email)).status).toBe(423);
  expect((await signIn("03001234567")).status).toBe(423);
});

test("phone sign-in still requires a password and an active linked staff profile", async () => {
  const teacher = await createTeacherSession(app);
  await Staff.findByIdAndUpdate(teacher.staff._id, { phone: "03001234567" });
  expect((await signIn("03001234567", "wrong-password")).status).toBe(401);
  await Staff.findByIdAndUpdate(teacher.staff._id, { status: "inactive" });
  expect((await signIn("03001234567")).status).toBe(403);
  await Staff.findByIdAndUpdate(teacher.staff._id, { status: "active", user: null });
  expect((await signIn("03001234567")).status).toBe(401);
});

test("phone records cannot grant access to a different linked user or an archived profile", async () => {
  const teacher = await createTeacherSession(app);
  const other = await createTeacherSession(app);
  await Staff.findByIdAndUpdate(teacher.staff._id, { phone: "03001234567", user: other.user._id });
  expect((await signIn("03001234567")).status).toBe(401);
  await Staff.findByIdAndUpdate(teacher.staff._id, { user: teacher.user._id, archivedAt: new Date() });
  expect((await signIn("03001234567")).status).toBe(401);
  expect((await User.findById(teacher.user._id)).failedLoginAttempts).toBe(0);
});
