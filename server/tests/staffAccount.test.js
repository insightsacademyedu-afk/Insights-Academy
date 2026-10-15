import request from "supertest";
import app from "../app.js";
import Staff from "../models/Staff.js";
import User from "../models/User.js";
import { createAdminSession, createTeacherSession, withCsrf } from "./helpers/authHelpers.js";

test("staff edit updates linked username and email, preserves password and revokes old sessions", async () => {
  const admin = await createAdminSession(app);
  const teacher = await createTeacherSession(app, { username: "oldteacher" });
  const before = await User.findById(teacher.user._id).select("+passwordHash");
  const result = await withCsrf(admin.agent.put(`/api/staff/${teacher.staff._id}`).send({
    fullName: "Updated Teacher", username: " NewTeacher ", email: "NEW@example.com",
    user: admin.user._id, role: "admin", passwordHash: "forged",
  }), admin.csrfToken);
  expect(result.status).toBe(200);
  expect(result.body.user).toMatchObject({ username: "newteacher", email: "new@example.com" });
  expect(result.body.user.passwordHash).toBeUndefined();
  const updated = await User.findById(teacher.user._id).select("+passwordHash");
  expect(updated.role).toBe("staff");
  expect(updated.passwordHash).toBe(before.passwordHash);
  expect(updated.tokenVersion).toBe(before.tokenVersion + 1);
  expect((await teacher.agent.get("/api/auth/me")).status).toBe(401);
  expect((await request(app).post("/api/auth/login").send({ role: "staff", username: "oldteacher", password: "Password123!" })).status).toBe(401);
  expect((await request(app).post("/api/auth/login").send({ role: "staff", username: "newteacher", password: "Password123!" })).status).toBe(200);
  expect((await Staff.findById(teacher.staff._id)).email).toBe("new@example.com");
  const directory = await admin.agent.get("/api/staff");
  expect(directory.body.items.find(row => row._id === String(teacher.staff._id)).user.username).toBe("newteacher");
});

test.each(["username", "email"])("duplicate %s rolls back both profile and login edits", async field => {
  const admin = await createAdminSession(app);
  const teacher = await createTeacherSession(app);
  const response = await withCsrf(admin.agent.put(`/api/staff/${teacher.staff._id}`).send({
    fullName: "Must not save", [field]: admin.user[field],
  }), admin.csrfToken);
  expect(response.status).toBe(409);
  expect((await Staff.findById(teacher.staff._id)).fullName).toBe("Test Teacher");
  expect((await User.findById(teacher.user._id))[field]).toBe(teacher.user[field]);
});

test("profile name edits preserve the username unless explicitly changed", async () => {
  const admin = await createAdminSession(app);
  const teacher = await createTeacherSession(app);
  const response = await withCsrf(admin.agent.put(`/api/staff/${teacher.staff._id}`).send({ fullName: "Renamed Teacher" }), admin.csrfToken);
  expect(response.status).toBe(200);
  expect(response.body.fullName).toBe("Renamed Teacher");
  expect(response.body.user.username).toBe(teacher.user.username);
  expect((await teacher.agent.get("/api/auth/me")).status).toBe(200);
});

test("invalid login updates do not partially save the staff profile", async () => {
  const admin = await createAdminSession(app);
  const teacher = await createTeacherSession(app);
  for (const values of [{ username: "ab" }, { username: {} }, { email: "" }, { email: "invalid-email" }]) {
    const response = await withCsrf(admin.agent.put(`/api/staff/${teacher.staff._id}`).send({ fullName: "Must not save", ...values }), admin.csrfToken);
    expect(response.status).toBe(400);
    expect((await Staff.findById(teacher.staff._id)).fullName).toBe("Test Teacher");
  }
});

test("staff without login accounts can edit their profiles and cannot silently create credentials", async () => {
  const admin = await createAdminSession(app);
  const staff = await Staff.create({ fullName: "No Login" });
  expect((await withCsrf(admin.agent.put(`/api/staff/${staff._id}`).send({ fullName: "Updated" }), admin.csrfToken)).status).toBe(200);
  expect((await withCsrf(admin.agent.put(`/api/staff/${staff._id}`).send({ username: "newlogin" }), admin.csrfToken)).status).toBe(400);
  expect((await Staff.findById(staff._id)).user).toBeNull();
});

test("teachers cannot change linked login details through the administrator staff endpoint", async () => {
  const teacher = await createTeacherSession(app);
  expect((await withCsrf(teacher.agent.put(`/api/staff/${teacher.staff._id}`).send({ username: "unauthorized" }), teacher.csrfToken)).status).toBe(403);
});
