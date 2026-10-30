import app from "../app.js";
import TeacherCard from "../models/TeacherCard.js";
import TeacherAttendance from "../models/TeacherAttendance.js";
import Staff from "../models/Staff.js";
import Designation from "../models/Designation.js";
import { createAdminSession, createTeacherSession, createAndLoginUser, withCsrf } from "./helpers/authHelpers.js";

const post = (account, path, body = {}) => withCsrf(account.agent.post(path).send(body), account.csrfToken);
test("employee cards support edits, renewal, replacement and private admin/subadmin QR attendance", async () => {
  await Promise.all([TeacherCard.init(), TeacherAttendance.init()]);
  const admin = await createAdminSession(app);
  const sub = await createAndLoginUser(app, { role: "subadmin" });
  const teacher = await createTeacherSession(app);
  const designation = await Designation.create({ title: "Mathematics Teacher" });
  await Staff.updateOne({ _id: teacher.staff._id }, { designation: designation._id });
  const path = `/api/teacher-cards/${teacher.staff._id}`;
  expect((await teacher.agent.get(path)).status).toBe(403);
  expect((await post(teacher, `${path}/issue`)).status).toBe(403);
  const issued = await post(sub, `${path}/issue`);
  expect(issued.status).toBe(200);
  const { card, employeeId } = issued.body;
  expect(card.token).toMatch(/^AMT1_[A-Za-z0-9_-]{43}$/);
  expect(issued.body.teacher.designation.title).toBe("Mathematics Teacher");
  expect(issued.body.teacher.phone).toBeUndefined();
  expect(issued.body.teacher.basicSalary).toBeUndefined();
  const edit = await withCsrf(sub.agent.put(path).send({ fullName: "Ayesha Khan", cardDesignation: "Senior Teacher", photoUrl: "", basicSalary: 999999 }), sub.csrfToken);
  expect(edit.status).toBe(200);
  expect(edit.body.teacher.fullName).toBe("Ayesha Khan");
  expect(edit.body.teacher.cardDesignation).toBe("Senior Teacher");
  expect(edit.body.employeeId).toBe(employeeId);
  expect(edit.body.card.token).toBe(card.token);
  expect((await Staff.findById(teacher.staff._id)).basicSalary).toBe(0);
  const renewed = await post(admin, `${path}/renew`);
  expect(renewed.body.card.token).toBe(card.token);
  expect(new Date(renewed.body.card.expiresAt) > new Date(card.expiresAt)).toBe(true);
  expect((await post(teacher, "/api/teacher-attendance/scan", { token: card.token })).status).toBe(403);
  const scans = await Promise.all([post(admin, "/api/teacher-attendance/scan", { token: card.token }), post(sub, "/api/teacher-attendance", { teacher: teacher.staff._id })]);
  expect(scans.map(item => item.status).sort()).toEqual([200, 201]);
  expect(await TeacherAttendance.countDocuments()).toBe(1);
  const replaced = await post(sub, `${path}/replace`);
  expect(replaced.status).toBe(200);
  expect(replaced.body.card.token).not.toBe(card.token);
  expect(replaced.body.card.version).toBe(2);
  expect(replaced.body.history.every(item => !item.token)).toBe(true);
  expect((await post(admin, "/api/teacher-attendance/scan", { token: card.token })).status).toBe(409);
  expect((await post(sub, "/api/teacher-attendance/scan", { token: replaced.body.card.token })).status).toBe(200);
  await TeacherCard.updateOne({ _id: replaced.body.card._id }, { expiresAt: new Date(0) });
  expect((await post(admin, "/api/teacher-attendance/scan", { token: replaced.body.card.token })).status).toBe(409);
  await post(admin, `${path}/renew`);
  await post(admin, `${path}/revoke`);
  expect((await post(admin, "/api/teacher-attendance/scan", { token: replaced.body.card.token })).status).toBe(409);
  expect((await sub.agent.get(path)).body.card.token).toBeUndefined();
});

test("card details reject invalid inputs and inactive teachers cannot receive cards", async () => {
  const admin = await createAdminSession(app);
  const teacher = await createTeacherSession(app);
  const path = `/api/teacher-cards/${teacher.staff._id}`;
  expect((await admin.agent.get("/api/teacher-cards/invalid")).status).toBe(400);
  for (const body of [{ fullName: "", cardDesignation: "Teacher", photoUrl: "" }, { fullName: "Teacher", cardDesignation: "Teacher", photoUrl: "javascript:alert(1)" }]) {
    expect((await withCsrf(admin.agent.put(path).send(body), admin.csrfToken)).status).toBe(400);
  }
  await Staff.updateOne({ _id: teacher.staff._id }, { status: "inactive" });
  expect((await post(admin, `${path}/issue`)).status).toBe(409);
  expect((await post(admin, "/api/teacher-attendance/scan", { token: "AMS1_" + "a".repeat(43) })).status).toBe(400);
});
