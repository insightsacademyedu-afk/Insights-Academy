import { jest } from "@jest/globals";
import mongoose from "mongoose";
import app from "../app.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import Notification from "../models/Notification.js";
import { config } from "../config/env.js";
import { deliverNotificationEmails } from "../services/notificationDelivery.js";
import { createAdminSession, createAndLoginUser, createTeacherSession, extractCookieValue, withCsrf } from "./helpers/authHelpers.js";

const originalFetch = global.fetch;
const originalResend = { ...config.resend };
beforeEach(() => {
  config.resend.apiKey = "test-notification-key";
  config.resend.from = "Academy <notifications@example.com>";
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
});
afterEach(() => { global.fetch = originalFetch; Object.assign(config.resend, originalResend); });

async function createParentSession() {
  const session = await createAndLoginUser(app, { role: "guardian" });
  const login = await session.agent.post("/api/auth/login").send({ username: session.user.email, password: "Password123!", role: "parent" });
  expect(login.status).toBe(200);
  session.csrfToken = extractCookieValue(login, "ams_csrf") || session.csrfToken;
  return session;
}

async function setup() {
  const admin = await createAdminSession(app);
  const parent = await createParentSession();
  const other = await createParentSession();
  const student = await Student.create({ admissionNumber: "NOTICE-001", fullName: "Child One", gender: "male", dob: "2015-01-01", guardian: new mongoose.Types.ObjectId() });
  await User.updateOne({ _id: parent.user._id }, { $set: { studentIds: [student._id] } });
  return { admin, parent, other, student };
}
const send = (admin, body) => withCsrf(admin.agent.post("/api/notifications").send({ title: "Academy notice", message: "Classes start at 9 AM.", audience: "selected", ...body }), admin.csrfToken);

test("student and guardian selections deduplicate, inboxes stay private, and read state is scoped", async () => {
  const { admin, parent, other, student } = await setup();
  const result = await send(admin, { guardianIds: [String(parent.user._id)], studentIds: [String(student._id)] });
  expect(result.status).toBe(201);
  expect(result.body).toMatchObject({ recipientCount: 1, emailQueued: 1 });
  const inbox = await parent.agent.get("/api/guardian-portal/notifications");
  expect(inbox.body.unreadCount).toBe(1);
  expect(inbox.body.items[0]).toMatchObject({ title: "Academy notice", read: false });
  for (const key of ["recipientIds", "readBy", "emailDeliveries", "sentBy"]) expect(inbox.body.items[0][key]).toBeUndefined();
  expect((await other.agent.get("/api/guardian-portal/notifications")).body.total).toBe(0);
  expect((await withCsrf(other.agent.patch(`/api/guardian-portal/notifications/${result.body._id}/read`), other.csrfToken)).status).toBe(404);
  for (let i = 0; i < 2; i++) expect((await withCsrf(parent.agent.patch(`/api/guardian-portal/notifications/${result.body._id}/read`), parent.csrfToken)).status).toBe(200);
  expect((await parent.agent.get("/api/guardian-portal/notifications")).body.unreadCount).toBe(0);
  await deliverNotificationEmails();
  await deliverNotificationEmails();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(payload.to).toEqual([parent.user.email]);
  expect(payload.text).toContain("Classes start at 9 AM.");
  expect(payload.text).not.toContain(other.user.email);
  const history = await admin.agent.get("/api/notifications");
  expect(history.body.items[0].email).toMatchObject({ sent: 1, failed: 0, pending: 0 });
  expect(history.body.items[0].emailDeliveries).toBeUndefined();
});

test("broadcast snapshots active accounts, skips missing emails, and records provider failures", async () => {
  const { admin, parent, other } = await setup();
  await User.updateOne({ _id: other.user._id }, { $set: { phone: "03001234567" }, $unset: { email: 1 } });
  const inactive = await createParentSession();
  await User.updateOne({ _id: inactive.user._id }, { $set: { status: "inactive" } });
  const result = await send(admin, { audience: "all" });
  expect(result.body).toMatchObject({ recipientCount: 2, emailQueued: 1, emailSkipped: 1 });
  const later = await createParentSession();
  expect((await later.agent.get("/api/guardian-portal/notifications")).body.total).toBe(0);
  expect((await parent.agent.get("/api/guardian-portal/notifications")).body.total).toBe(1);
  expect((await other.agent.get("/api/guardian-portal/notifications")).body.total).toBe(1);
  global.fetch.mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" });
  await deliverNotificationEmails();
  expect((await admin.agent.get("/api/notifications")).body.items[0].email).toMatchObject({ failed: 1, skipped: 1 });
});

test("invalid or unavailable selections fail without creating messages; only admins send", async () => {
  const { admin, parent, student } = await setup();
  for (const body of [{}, { guardianIds: ["bad-id"] }, { title: " " }, { message: "x".repeat(5001) }, { guardianIds: [String(admin.user._id)] }]) {
    expect((await send(admin, body)).status).toBe(400);
  }
  await User.updateOne({ _id: parent.user._id }, { $set: { status: "inactive" } });
  expect((await send(admin, { studentIds: [String(student._id)] })).body.message).toMatch(/no active guardian login/);
  expect(await Notification.countDocuments()).toBe(0);
  const teacher = await createTeacherSession(app);
  for (const session of [teacher, await createParentSession(), await createAndLoginUser(app, { role: "subadmin" })]) {
    expect((await session.agent.get("/api/notifications/recipients")).status).toBe(403);
    expect((await send(session, { audience: "all" })).status).toBe(403);
  }
});

test("recipient search is paginated and reports linked parent logins; missing email config stays visible", async () => {
  const { admin, student } = await setup();
  const recipients = await admin.agent.get("/api/notifications/recipients?kind=students&search=NOTICE-001&limit=1");
  expect(recipients.body.items[0]).toMatchObject({ _id: String(student._id), guardianCount: 1 });
  expect(recipients.body.items[0].feeDetails).toBeUndefined();
  config.resend.apiKey = "";
  const smtp = { ...config.smtp };
  config.smtp.host = "";
  try {
    expect((await send(admin, { audience: "all" })).body).toMatchObject({ recipientCount: 2, emailQueued: 0, emailUnavailable: true });
    expect((await admin.agent.get("/api/notifications")).body.items[0].email.failed).toBe(2);
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { Object.assign(config.smtp, smtp); }
});

test("multiple workers claim distinct queued recipients without resending completed deliveries", async () => {
  const { admin } = await setup();
  await send(admin, { audience: "all" });
  await Promise.all([deliverNotificationEmails(1), deliverNotificationEmails(1)]);
  expect(global.fetch).toHaveBeenCalledTimes(2);
  const addresses = global.fetch.mock.calls.map(call => JSON.parse(call[1].body).to[0]);
  expect(new Set(addresses).size).toBe(2);
  await deliverNotificationEmails(1);
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect((await admin.agent.get("/api/notifications")).body.items[0].email).toMatchObject({ sent: 2, pending: 0 });
});
