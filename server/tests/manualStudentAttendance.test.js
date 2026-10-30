import mongoose from "mongoose";
import app from "../app.js";
import Student from "../models/Student.js";
import Attendance from "../models/Attendance.js";
import Section from "../models/Section.js";
import StudentClassAssignment from "../models/StudentClassAssignment.js";
import { createAdminSession, createTeacherSession, createAndLoginUser, withCsrf } from "./helpers/authHelpers.js";
import { createAcademicChain, createEnrolledStudent } from "./helpers/fixtures.js";
import { academyDay } from "../utils/academyDay.js";

const post = (account, path, body) => withCsrf(account.agent.post(path).send(body), account.csrfToken);
async function setup() {
  await Attendance.init();
  const admin = await createAdminSession(app);
  const chain = await createAcademicChain();
  const first = await createEnrolledStudent(chain, { fullName: "A First" });
  const second = await createEnrolledStudent(chain, { fullName: "B Second" });
  return { admin, chain, first, second };
}

test("class roster paginates active students, filters sections and shows existing check-ins", async () => {
  const { admin, chain, first } = await setup();
  const section = await Section.create({ class: chain.klass._id, name: "B" });
  await createEnrolledStudent({ ...chain, section });
  const inactive = await createEnrolledStudent(chain);
  await Student.updateOne({ _id: inactive.student._id }, { status: "inactive" });
  await createEnrolledStudent(await createAcademicChain());
  const url = `/api/attendance/roster?class=${chain.klass._id}&section=${chain.section._id}&limit=1`;
  const response = await admin.agent.get(url);
  expect(response.status).toBe(200);expect(response.body.total).toBe(2);expect(response.body.totalPages).toBe(2);
  expect(response.body.items[0].student._id).toBe(String(first.student._id));
  expect(response.body.items[0].student.feeDetails).toBeUndefined();expect(response.body.items[0].attendance).toBeNull();
  expect((await admin.agent.get(url + "&page=2")).body.items).toHaveLength(1);
  await post(admin, "/api/attendance/manual", { class: chain.klass._id, students: [first.student._id] });
  expect((await admin.agent.get(url)).body.items[0].attendance.method).toBe("manual");
});

test("manual marking works without cards, is shared with portals and does not overwrite QR attendance", async () => {
  const { admin, chain, first, second } = await setup();
  const card = (await post(admin, `/api/student-cards/${second.student._id}/issue`, {})).body.card;
  const qr = await post(admin, "/api/attendance/scan", { token: card.token });
  expect(qr.status).toBe(201);
  const sub = await createAndLoginUser(app, { role: "subadmin" });
  const payload = { class: chain.klass._id, section: chain.section._id, students: [first.student._id, second.student._id], day: academyDay() };
  const saved = await post(sub, "/api/attendance/manual", payload);
  expect(saved.status).toBe(200);expect(saved.body).toMatchObject({ marked: 1, alreadyMarked: 1 });
  const manual = await Attendance.findOne({ student: first.student._id });
  expect(manual.method).toBe("manual");expect(manual.card).toBeNull();expect(String(manual.recordedBy)).toBe(String(sub.user._id));
  expect(manual.className).toBe(chain.klass.name);
  const unchanged = await Attendance.findOne({ student: second.student._id });
  expect(unchanged.method).toBe("qr");expect(unchanged.checkedInAt.toISOString()).toBe(qr.body.record.checkedInAt);
  expect((await post(admin, "/api/attendance/manual", payload)).body).toMatchObject({ marked: 0, alreadyMarked: 2 });
  expect(await Attendance.countDocuments()).toBe(2);
  expect((await admin.agent.get(`/api/attendance?status=absent&class=${chain.klass._id}`)).body.total).toBe(0);
  expect((await sub.agent.get(`/api/attendance?class=${chain.klass._id}`)).body.total).toBe(2);
});

test("concurrent manual and QR marks still produce one daily check-in", async () => {
  const { admin, chain, first } = await setup();
  const card = (await post(admin, `/api/student-cards/${first.student._id}/issue`, {})).body.card;
  const [manual, qr] = await Promise.all([
    post(admin, "/api/attendance/manual", { class: chain.klass._id, students: [first.student._id] }),
    post(admin, "/api/attendance/scan", { token: card.token }),
  ]);
  expect(manual.status).toBe(200);expect([200, 201]).toContain(qr.status);
  expect(await Attendance.countDocuments({ student: first.student._id })).toBe(1);
  expect(manual.body.marked + (qr.status === 201 ? 1 : 0)).toBe(1);
});

test("invalid or stale selections roll back the entire manual batch", async () => {
  const { admin, chain, first, second } = await setup();
  const other = await createAcademicChain();
  const outside = await createEnrolledStudent(other);
  const mixed = await post(admin, "/api/attendance/manual", { class: chain.klass._id, students: [first.student._id, outside.student._id] });
  expect(mixed.status).toBe(409);expect(await Attendance.countDocuments()).toBe(0);
  await Student.updateOne({ _id: second.student._id }, { status: "inactive" });
  expect((await post(admin, "/api/attendance/manual", { class: chain.klass._id, students: [first.student._id, second.student._id] })).status).toBe(409);
  expect(await Attendance.countDocuments()).toBe(0);
  await post(admin, `/api/students/${first.student._id}/enroll`, { class: other.klass._id, section: other.section._id, academicSession: other.session._id });
  expect((await post(admin, "/api/attendance/manual", { class: chain.klass._id, students: [first.student._id] })).status).toBe(409);
  expect(await StudentClassAssignment.countDocuments({ student: first.student._id, status: "active" })).toBe(1);
});

test("manual attendance rejects malformed requests, stale days and staff/parent writes", async () => {
  const { admin, chain, first } = await setup();
  const base = { class: chain.klass._id, students: [String(first.student._id)] };
  for (const payload of [{ ...base, class: "bad" }, { ...base, students: [] }, { ...base, students: ["bad"] }, { ...base, students: [...base.students, ...base.students] }, { ...base, section: new mongoose.Types.ObjectId() }]) expect((await post(admin, "/api/attendance/manual", payload)).status).toBe(400);
  expect((await post(admin, "/api/attendance/manual", { ...base, day: "2020-01-01" })).status).toBe(409);
  const teacher = await createTeacherSession(app);
  expect((await teacher.agent.get(`/api/attendance/roster?class=${chain.klass._id}`)).status).toBe(403);
  expect((await post(teacher, "/api/attendance/manual", base)).status).toBe(403);
  const parent = await createAndLoginUser(app, { role: "guardian" });
  await parent.agent.post("/api/auth/login").send({ role: "parent", username: parent.user.email, password: "Password123!" });
  expect((await parent.agent.get(`/api/attendance/roster?class=${chain.klass._id}`)).status).toBe(403);
  expect((await post(parent, "/api/attendance/manual", base)).status).toBe(403);
  expect(await Attendance.countDocuments()).toBe(0);
});
