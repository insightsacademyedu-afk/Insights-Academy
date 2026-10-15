import { jest } from "@jest/globals";
import app from "../app.js";
import User from "../models/User.js";
import Staff from "../models/Staff.js";
import Notification from "../models/Notification.js";
import { createAdminSession, createAndLoginUser, createTeacherSession, extractCookieValue, withCsrf } from "./helpers/authHelpers.js";

const originalFetch = global.fetch;
beforeEach(() => { global.fetch = jest.fn(() => { throw new Error("Notifications must not use external delivery"); }); });
afterEach(() => { expect(global.fetch).not.toHaveBeenCalled(); global.fetch = originalFetch; });

async function parentSession() {
  const session = await createAndLoginUser(app, { role: "guardian" });
  const login = await session.agent.post("/api/auth/login").send({ username: session.user.email, password: "Password123!", role: "parent" });
  expect(login.status).toBe(200);
  session.csrfToken = extractCookieValue(login, "ams_csrf") || session.csrfToken;
  return session;
}
const send = (session, body = {}) => withCsrf(session.agent.post("/api/notifications").send({ title: "Academy notice", message: "Classes start at 9 AM.", recipientType: "guardian", ...body }), session.csrfToken);

test("guardian broadcasts stay in portal inboxes, include phone-only accounts and exclude staff", async () => {
  const admin = await createAdminSession(app);
  const parent = await parentSession();
  const phoneOnly = await parentSession();
  await User.updateOne({ _id: phoneOnly.user._id }, { $set: { phone: "03001234567" }, $unset: { email: 1 } });
  const teacher = await createTeacherSession(app);
  const result = await send(admin);
  expect(result.status).toBe(201);
  expect(result.body).toMatchObject({ recipientCount: 2, recipientType: "guardian" });
  const saved = await Notification.collection.findOne({ _id: (await Notification.findById(result.body._id))._id });
  expect(saved.emailDeliveries).toBeUndefined();
  expect(saved.emailUnavailable).toBeUndefined();
  for (const session of [parent, phoneOnly]) {
    const inbox = await session.agent.get("/api/notifications");
    expect(inbox.body.total).toBe(1);
    expect(inbox.body.unreadCount).toBe(1);
    expect(inbox.body.items[0]).toMatchObject({ title: "Academy notice", read: false });
    for (const key of ["recipientIds", "readBy", "sentBy", "emailDeliveries", "recipientCount"]) expect(inbox.body.items[0][key]).toBeUndefined();
  }
  expect((await teacher.agent.get("/api/notifications")).body.total).toBe(0);
  expect((await parent.agent.get("/api/guardian-portal/notifications")).body.total).toBe(1);
  const history = await admin.agent.get("/api/notifications");
  expect(history.body.items[0]).toMatchObject({ recipientType: "guardian", recipientCount: 2 });
  expect(history.body.items[0].email).toBeUndefined();
});

test("staff broadcasts include only active staff logins with available profiles and read state is private", async () => {
  const admin = await createAdminSession(app);
  const parent = await parentSession();
  const teacher = await createTeacherSession(app);
  const other = await createTeacherSession(app);
  const inactiveProfile = await createTeacherSession(app);
  await Staff.updateOne({ _id: inactiveProfile.staff._id }, { $set: { status: "inactive" } });
  const archived = await createTeacherSession(app);
  await Staff.updateOne({ _id: archived.staff._id }, { $set: { archivedAt: new Date() } });
  const inactiveLogin = await createTeacherSession(app);
  await User.updateOne({ _id: inactiveLogin.user._id }, { $set: { status: "inactive" } });
  const result = await send(admin, { recipientType: "staff" });
  expect(result.body).toMatchObject({ recipientCount: 2, recipientType: "staff" });
  expect((await parent.agent.get("/api/notifications")).body.total).toBe(0);
  expect((await teacher.agent.get("/api/notifications")).body.total).toBe(1);
  for (let index = 0; index < 2; index++) expect((await withCsrf(teacher.agent.patch(`/api/notifications/${result.body._id}/read`), teacher.csrfToken)).status).toBe(200);
  expect((await teacher.agent.get("/api/notifications")).body.unreadCount).toBe(0);
  expect((await other.agent.get("/api/notifications")).body.unreadCount).toBe(1);
  expect((await withCsrf(parent.agent.patch(`/api/notifications/${result.body._id}/read`), parent.csrfToken)).status).toBe(404);
});

test("only admins send, input is validated, and empty groups do not create messages", async () => {
  const admin = await createAdminSession(app);
  expect((await send(admin)).status).toBe(400);
  for (const body of [{ title: " " }, { title: "x".repeat(161) }, { message: " " }, { message: "x".repeat(5001) }, { recipientType: "admin" }, { recipientType: null }]) {
    expect((await send(admin, body)).status).toBe(400);
  }
  const parent = await parentSession();
  const teacher = await createTeacherSession(app);
  const subadmin = await createAndLoginUser(app, { role: "subadmin" });
  for (const session of [parent, teacher, subadmin]) expect((await send(session)).status).toBe(403);
  expect((await subadmin.agent.get("/api/notifications")).status).toBe(403);
  expect(await Notification.countDocuments()).toBe(0);
});

test("broadcast recipients are fixed at sending and old portal messages remain readable without email data", async () => {
  const admin = await createAdminSession(app);
  const parent = await parentSession();
  await send(admin);
  const later = await parentSession();
  expect((await later.agent.get("/api/notifications")).body.total).toBe(0);
  const old = await Notification.create({ title: "Earlier message", message: "Portal history", audience: "selected", sentBy: admin.user._id, recipientIds: [parent.user._id], recipientCount: 1 });
  await Notification.collection.updateOne({ _id: old._id }, { $unset: { recipientType: 1 }, $set: { emailDeliveries: [{ recipient: "private@example.com", status: "pending" }] } });
  const history = await admin.agent.get("/api/notifications?limit=1");
  expect(history.body.total).toBe(2);
  expect(history.body.items[0].recipientType).toBe("guardian");
  expect(history.body.items[0].emailDeliveries).toBeUndefined();
  expect((await parent.agent.get("/api/notifications")).body.total).toBe(2);
});
