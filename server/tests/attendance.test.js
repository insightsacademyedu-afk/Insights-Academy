import mongoose from "mongoose";
import app from "../app.js";
import Student from "../models/Student.js";
import StudentCard from "../models/StudentCard.js";
import Attendance from "../models/Attendance.js";
import StudentClassAssignment from "../models/StudentClassAssignment.js";
import Class from "../models/Class.js";
import Section from "../models/Section.js";
import User from "../models/User.js";
import { createAdminSession, createTeacherSession, createAndLoginUser, extractCookieValue, withCsrf } from "./helpers/authHelpers.js";
import { createAcademicChain, createEnrolledStudent, assignTeacher } from "./helpers/fixtures.js";
import { academyDay, annualExpiry } from "../utils/academyDay.js";
import { ensureStudentAssignmentIndex } from "../utils/studentAssignmentIndex.js";

const post = (account, path, body = {}) => withCsrf(account.agent.post(path).send(body), account.csrfToken);
async function setup() {
  await Promise.all([StudentCard.init(), Attendance.init(), StudentClassAssignment.init()]);
  const admin = await createAdminSession(app);
  const chain = await createAcademicChain({ className: "Class 9" });
  const enrolled = await createEnrolledStudent(chain);
  const issued = await post(admin, `/api/student-cards/${enrolled.student._id}/issue`);
  expect(issued.status).toBe(200);
  return { admin, chain, ...enrolled, card: issued.body.card };
}

test("academy day changes at Pakistan midnight; annual validity uses local calendar boundaries", () => {
  expect(academyDay(new Date("2026-10-30T18:59:59Z"))).toBe("2026-10-30");
  expect(academyDay(new Date("2026-10-30T19:00:00Z"))).toBe("2026-10-31");
  expect(annualExpiry(new Date("2026-10-30T10:00:00Z")).toISOString()).toBe("2027-10-29T19:00:00.000Z");
  expect(academyDay(annualExpiry(new Date("2028-02-29T10:00:00Z")))).toBe("2029-02-28");
});

test("new enrollment automatically issues a class-linked random static QR; edits keep it unchanged", async () => {
  const admin = await createAdminSession(app);
  const chain = await createAcademicChain();
  const response = await post(admin, "/api/students", { fullName: "Amina", gender: "female", dob: "2012-01-01", guardian: { fullName: "Parent", primaryPhone: "03001234567" }, enrollment: { class: chain.klass._id, section: chain.section._id, academicSession: chain.session._id } });
  expect(response.status).toBe(201);
  const id = response.body.student._id;
  const first = (await admin.agent.get(`/api/student-cards/${id}`)).body.card;
  expect(first.token).toMatch(/^AMS1_[A-Za-z0-9_-]{43}$/);
  expect(first.className).toBe(chain.klass.name);
  expect(first.token).not.toContain(id);
  const changed = await withCsrf(admin.agent.put(`/api/students/${id}`).send({ fullName: "Amina Ali", photoUrl: "data:image/jpeg;base64,YQ==" }), admin.csrfToken);
  expect(changed.status).toBe(200);
  expect((await admin.agent.get(`/api/student-cards/${id}`)).body.card.token).toBe(first.token);
  expect((await StudentCard.findOne({ student: id }).lean()).token).toBeUndefined();
});

test("simultaneous admin/sub-admin scans create exactly one daily record", async () => {
  const { admin, chain, student, card } = await setup();
  const sub = await createAndLoginUser(app, { role: "subadmin" });
  const teacher = await createTeacherSession(app);
  await assignTeacher(chain, teacher.staff._id);
  const responses = await Promise.all([admin, sub, admin].map(account => post(account, "/api/attendance/scan", { token: card.token, day: "2000-01-01", student: new mongoose.Types.ObjectId() })));
  expect(responses.map(response => response.status).sort()).toEqual([200, 200, 201]);
  expect(responses.filter(response => response.body.duplicate)).toHaveLength(2);
  expect(await Attendance.countDocuments({ student: student._id })).toBe(1);
  expect((await Attendance.findOne()).day).toBe(academyDay());
  for (const account of [admin, sub, teacher]) {
    const records = await account.agent.get("/api/attendance");
    expect(records.status).toBe(200); expect(records.body.total).toBe(1);
    expect(JSON.stringify(records.body)).not.toContain(card.token);
  }
});

test("same-session transfer replaces QR, preserves old attendance and blocks duplicates with the new card", async () => {
  const { admin, chain, student, card } = await setup();
  expect((await post(admin, "/api/attendance/scan", { token: card.token })).status).toBe(201);
  const klass = await Class.create({ name: "Class 10", academicSession: chain.session._id });
  const section = await Section.create({ name: "B", class: klass._id });
  const transfer = await post(admin, `/api/students/${student._id}/enroll`, { class: klass._id, section: section._id, academicSession: chain.session._id });
  expect(transfer.status).toBe(201);
  const current = (await admin.agent.get(`/api/student-cards/${student._id}`)).body.card;
  expect(current.token).not.toBe(card.token); expect(current.version).toBe(2); expect(current.className).toBe("Class 10");
  expect(await StudentClassAssignment.countDocuments({ student: student._id, status: "active" })).toBe(1);
  expect(await StudentClassAssignment.countDocuments({ student: student._id, status: "transferred_out" })).toBe(1);
  expect((await post(admin, "/api/attendance/scan", { token: card.token })).status).toBe(409);
  const duplicate = await post(admin, "/api/attendance/scan", { token: current.token });
  expect(duplicate.status).toBe(200); expect(duplicate.body.duplicate).toBe(true);
  expect((await Attendance.findOne()).className).toBe("Class 9");
});

test("failed transfer rolls back placement and card revocation", async () => {
  const { admin, chain, student, card } = await setup();
  const other = await createAcademicChain();
  const transfer = await post(admin, `/api/students/${student._id}/enroll`, { class: chain.klass._id, section: other.section._id, academicSession: chain.session._id });
  expect(transfer.status).toBe(400);
  expect((await admin.agent.get(`/api/student-cards/${student._id}`)).body.card.token).toBe(card.token);
  expect((await post(admin, "/api/attendance/scan", { token: card.token })).status).toBe(201);
});

test("a class transfer racing an old-card scan is serialized and still allows only one daily check-in", async () => {
  const { admin, chain, student, card } = await setup();
  const klass = await Class.create({ name: "Class 10", academicSession: chain.session._id });
  const section = await Section.create({ name: "B", class: klass._id });
  const [transfer, oldScan] = await Promise.all([
    post(admin, `/api/students/${student._id}/enroll`, { class: klass._id, section: section._id, academicSession: chain.session._id }),
    post(admin, "/api/attendance/scan", { token: card.token }),
  ]);
  expect(transfer.status).toBe(201);
  expect([201, 409]).toContain(oldScan.status);
  const current = (await admin.agent.get(`/api/student-cards/${student._id}`)).body.card;
  const newScan = await post(admin, "/api/attendance/scan", { token: current.token });
  expect(newScan.status).toBe(oldScan.status === 201 ? 200 : 201);
  expect(await Attendance.countDocuments({ student: student._id })).toBe(1);
  expect((await post(admin, "/api/attendance/scan", { token: card.token })).status).toBe(409);
});

test("a previous day's attendance does not prevent today's check-in", async () => {
  const { admin, student, card } = await setup();
  const first = await post(admin, "/api/attendance/scan", { token: card.token });
  expect(first.status).toBe(201);
  await Attendance.updateOne({ _id: first.body.record._id }, { day: "2020-01-01" });
  expect((await post(admin, "/api/attendance/scan", { token: card.token })).status).toBe(201);
  expect(await Attendance.countDocuments({ student: student._id })).toBe(2);
});

test("expired, revoked, unknown, inactive and stale-class cards cannot mark attendance; renewal keeps QR", async () => {
  const { admin, chain, student, card } = await setup();
  await StudentCard.updateOne({ _id: card._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  expect((await post(admin, "/api/attendance/scan", { token: card.token })).status).toBe(409);
  const renewed = await post(admin, `/api/student-cards/${student._id}/renew`);
  expect(renewed.status).toBe(200); expect(renewed.body.card.token).toBe(card.token);
  await Student.updateOne({ _id: student._id }, { status: "inactive" });
  expect((await post(admin, "/api/attendance/scan", { token: card.token })).status).toBe(409);
  await Student.updateOne({ _id: student._id }, { status: "active" });
  await StudentCard.updateOne({ _id: card._id }, { section: new mongoose.Types.ObjectId() });
  expect((await post(admin, "/api/attendance/scan", { token: card.token })).status).toBe(409);
  await StudentCard.updateOne({ _id: card._id }, { section: chain.section._id });
  expect((await post(admin, `/api/student-cards/${student._id}/revoke`)).status).toBe(200);
  expect((await post(admin, "/api/attendance/scan", { token: card.token })).status).toBe(409);
  expect((await post(admin, "/api/attendance/scan", { token: "AMS1_" + "a".repeat(43) })).status).toBe(404);
  expect((await post(admin, "/api/attendance/scan", { token: { $ne: null } })).status).toBe(400);
  expect(await Attendance.countDocuments()).toBe(0);
  const replacement = await post(admin, `/api/student-cards/${student._id}/replace`);
  expect(replacement.body.card.token).not.toBe(card.token);
  expect((await post(admin, "/api/attendance/scan", { token: replacement.body.card.token })).status).toBe(201);
});

test("teachers can only view assigned students; parents see only linked children and cannot scan or manage cards", async () => {
  const { admin, chain, student, card } = await setup();
  const teacher = await createTeacherSession(app);
  expect((await post(teacher, "/api/attendance/scan", { token: card.token })).status).toBe(403);
  expect((await teacher.agent.get(`/api/student-cards/${student._id}`)).status).toBe(403);
  await assignTeacher(chain, teacher.staff._id);
  expect((await post(teacher, "/api/attendance/scan", { token: card.token })).status).toBe(403);
  expect((await post(admin, "/api/attendance/scan", { token: card.token })).status).toBe(201);
  const otherChain = await createAcademicChain(); const other = await createEnrolledStudent(otherChain);
  const otherCard = (await post(admin, `/api/student-cards/${other.student._id}/issue`)).body.card;
  await post(admin, "/api/attendance/scan", { token: otherCard.token });
  expect((await teacher.agent.get("/api/attendance")).body.total).toBe(1);
  expect((await teacher.agent.get(`/api/attendance?student=${other.student._id}`)).body.total).toBe(0);
  const parent = await createAndLoginUser(app, { role: "guardian" });
  await User.updateOne({ _id: parent.user._id }, { studentIds: [student._id] });
  const login = await parent.agent.post("/api/auth/login").send({ role: "parent", username: parent.user.email, password: "Password123!" });
  expect(login.status).toBe(200);
  parent.csrfToken = extractCookieValue(login, "ams_csrf");
  const own = await parent.agent.get(`/api/guardian-portal/children/${student._id}/attendance?student=${other.student._id}`);
  expect(own.status).toBe(200); expect(own.body.total).toBe(1); expect(own.body.items[0].student._id).toBe(String(student._id));
  expect(own.body.items[0].card).toBeUndefined();expect(own.body.items[0].recordedBy).toBeUndefined();
  expect((await parent.agent.get(`/api/guardian-portal/children/${other.student._id}/attendance`)).status).toBe(404);
  expect((await parent.agent.get("/api/attendance")).status).toBe(403);
  expect((await post(parent, "/api/attendance/scan", { token: card.token })).status).toBe(403);
  expect((await post(parent, `/api/student-cards/${student._id}/replace`)).status).toBe(403);
});

test("list validates date ranges and malformed identifiers", async () => {
  const { admin } = await setup();
  for (const query of ["day=2026-02-30", "from=invalid", "from=2026-10-31&to=2026-10-01", "student=invalid"]) expect((await admin.agent.get(`/api/attendance?${query}`)).status).toBe(400);
});

test("legacy placement index migrates without losing historical records", async () => {
  const collection = mongoose.connection.collection("placement_index_test");
  await collection.createIndex({ student: 1, academicSession: 1 }, { unique: true });
  const student = new mongoose.Types.ObjectId(), academicSession = new mongoose.Types.ObjectId();
  await collection.insertOne({ student, academicSession, status: "active" });
  await ensureStudentAssignmentIndex(collection);
  await collection.updateOne({ student }, { $set: { status: "transferred_out" } });
  await collection.insertOne({ student, academicSession, status: "active" });
  expect(await collection.countDocuments()).toBe(2);
  await expect(collection.insertOne({ student, academicSession, status: "active" })).rejects.toMatchObject({ code: 11000 });
  await collection.drop();
});

test("absent filter lists the whole eligible roster with pagination and removes students when scanned", async () => {
  const { admin, chain } = await setup(); // This student's card is issued but not scanned.
  const missing = await createEnrolledStudent(chain, { fullName: "A Missing Student" });
  const present = await createEnrolledStudent(chain, { fullName: "Present Student" });
  const card = (await post(admin, `/api/student-cards/${present.student._id}/issue`)).body.card;
  await post(admin, "/api/attendance/scan", { token: card.token });
  const inactive = await createEnrolledStudent(chain);
  await Student.updateOne({ _id: inactive.student._id }, { status: "inactive" });
  const archived = await createEnrolledStudent(chain);
  await Student.updateOne({ _id: archived.student._id }, { archivedAt: new Date() });
  const future = await createEnrolledStudent(chain);
  await StudentClassAssignment.collection.updateOne({ _id: future.assignment._id }, { $set: { createdAt: new Date(Date.now() + 172800000) } });
  const query = `/api/attendance?status=absent&day=${academyDay()}&limit=1`;
  const first = await admin.agent.get(query);
  expect(first.status).toBe(200);expect(first.body.total).toBe(2);expect(first.body.totalPages).toBe(2);
  expect(first.body.items[0].student._id).toBe(String(missing.student._id));
  expect(first.body.items[0].className).toBe(chain.klass.name);expect(first.body.items[0].sectionName).toBe(chain.section.name);
  expect(first.body.items[0].guardianPhone).toBe(missing.guardian.primaryPhone);
  expect(first.body.items[0].status).toBe("absent");expect(first.body.items[0].checkedInAt).toBeNull();
  expect(first.body.items[0].student.guardian).toBeUndefined();expect(first.body.items[0].student.feeDetails).toBeUndefined();
  expect((await admin.agent.get(query + "&page=2")).body.items).toHaveLength(1);
  expect(await Attendance.countDocuments()).toBe(1); // Listing absences never writes attendance.
  const missingCard = (await post(admin, `/api/student-cards/${missing.student._id}/issue`)).body.card;
  await post(admin, "/api/attendance/scan", { token: missingCard.token });
  expect((await admin.agent.get(query)).body.total).toBe(1);
});

test("absent filters enforce teacher scope and let sub-admins see all missing students", async () => {
  const { admin, chain, student, guardian } = await setup();
  const otherChain = await createAcademicChain(); const other = await createEnrolledStudent(otherChain);
  const teacher = await createTeacherSession(app);
  const query = `/api/attendance?status=absent&day=${academyDay()}`;
  expect((await teacher.agent.get(query)).body.total).toBe(0);
  await assignTeacher(chain, teacher.staff._id);
  const scoped = await teacher.agent.get(query);
  expect(scoped.status).toBe(200);expect(scoped.body.total).toBe(1);expect(scoped.body.items[0].student._id).toBe(String(student._id));
  expect(scoped.body.items[0].guardianPhone).toBe(guardian.primaryPhone);
  expect((await teacher.agent.get(query + `&student=${other.student._id}`)).body.total).toBe(0);
  expect((await teacher.agent.get(query + `&class=${otherChain.klass._id}`)).body.total).toBe(0);
  const sub = await createAndLoginUser(app, { role: "subadmin" });
  expect((await sub.agent.get(query)).body.total).toBe(2);
  expect((await admin.agent.get(query + `&class=${otherChain.klass._id}`)).body.total).toBe(1);
});

test("absences follow class transfers, preserve past placements and exclude check-ins made in the old class", async () => {
  const { admin, chain, student, assignment } = await setup();
  const before = new Date(Date.now() - 3 * 86400000);
  await Student.updateOne({ _id: student._id }, { admissionDate: before });
  await StudentClassAssignment.collection.updateOne({ _id: assignment._id }, { $set: { createdAt: before } });
  const klass = await Class.create({ name: "New class", academicSession: chain.session._id });
  const section = await Section.create({ name: "A", class: klass._id });
  const transferred = await post(admin, `/api/students/${student._id}/enroll`, { class: klass._id, section: section._id, academicSession: chain.session._id });
  expect(transferred.status).toBe(201);
  const query = `/api/attendance?status=absent&day=${academyDay()}`;
  expect((await admin.agent.get(query + `&class=${chain.klass._id}`)).body.total).toBe(0);
  const current = await admin.agent.get(query + `&class=${klass._id}`);
  expect(current.body.total).toBe(1);expect(current.body.items[0].className).toBe("New class");
  await StudentClassAssignment.updateOne({ _id: transferred.body._id }, { archivedAt: new Date() });
  expect((await admin.agent.get(query)).body.total).toBe(0); // Never fall back to the transferred-out class.
  await StudentClassAssignment.updateOne({ _id: transferred.body._id }, { archivedAt: null });
  const yesterday = academyDay(new Date(Date.now() - 86400000));
  const historical = await admin.agent.get(`/api/attendance?status=absent&day=${yesterday}`);
  expect(historical.body.items[0].className).toBe("Class 9");
  const currentCard = (await admin.agent.get(`/api/student-cards/${student._id}`)).body.card;
  await post(admin, "/api/attendance/scan", { token: currentCard.token });
  await Attendance.updateOne({ student: student._id }, { class: chain.klass._id });
  expect((await admin.agent.get(query)).body.total).toBe(0);
});

test("absent filters reject future dates and ambiguous ranges", async () => {
  const { admin } = await setup();
  const tomorrow = academyDay(new Date(Date.now() + 86400000));
  for (const query of [`status=absent&day=${tomorrow}`, "status=absent&day=invalid", "status=absent&from=2026-10-01&to=2026-10-30", "status=unknown"]) {
    expect((await admin.agent.get(`/api/attendance?${query}`)).status).toBe(400);
  }
});
