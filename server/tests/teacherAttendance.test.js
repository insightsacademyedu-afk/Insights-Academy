import app from "../app.js";
import TeacherAttendance from "../models/TeacherAttendance.js";
import Staff from "../models/Staff.js";
import User from "../models/User.js";
import { createAcademicChain, createEnrolledStudent } from "./helpers/fixtures.js";
import { createAdminSession, createTeacherSession, createAndLoginUser, withCsrf, extractCookieValue } from "./helpers/authHelpers.js";
import { academyDay } from "../utils/academyDay.js";

const mark = (account, teacher, extra = {}) => withCsrf(account.agent.post("/api/teacher-attendance").send({ teacher, ...extra }), account.csrfToken);

test("admin and subadmin can mark and read; concurrent marks preserve one record and the original recorder", async () => {
  await TeacherAttendance.init();
  const admin = await createAdminSession(app);
  const sub = await createAndLoginUser(app, { role: "subadmin" });
  const teacher = await createTeacherSession(app);
  const responses = await Promise.all([admin, sub].map(account => mark(account, teacher.staff._id, { day: "2000-01-01" })));
  expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
  expect(await TeacherAttendance.countDocuments()).toBe(1);
  expect((await TeacherAttendance.findOne()).day).toBe(academyDay());
  for (const account of [admin, sub]) {
    const list = await account.agent.get("/api/teacher-attendance");
    expect(list.status).toBe(200); expect(list.body.total).toBe(1);
    const picker = await account.agent.get("/api/teacher-attendance/teachers");
    expect(picker.status).toBe(200);
    expect(picker.body.items[0].phone).toBeUndefined();
    expect(picker.body.items[0].basicSalary).toBeUndefined();
  }
});

test("teachers and guardians cannot view teacher records, list teachers or mark attendance", async () => {
  const teacher = await createTeacherSession(app);
  const guardian = await createAndLoginUser(app, { role: "guardian" });
  const { student } = await createEnrolledStudent(await createAcademicChain());
  await User.updateOne({ _id: guardian.user._id }, { studentIds: [student._id] });
  const login = await guardian.agent.post("/api/auth/login").send({ role: "parent", username: guardian.user.email, password: "Password123!" });
  expect(login.status).toBe(200);
  guardian.csrfToken = extractCookieValue(login, "ams_csrf");
  for (const account of [teacher, guardian]) {
    expect((await account.agent.get("/api/teacher-attendance")).status).toBe(403);
    expect((await account.agent.get("/api/teacher-attendance/teachers")).status).toBe(403);
    expect((await mark(account, teacher.staff._id)).status).toBe(403);
  }
  expect(await TeacherAttendance.countDocuments()).toBe(0);
});

test("invalid filters and inactive teachers are rejected; history keeps the name at check-in", async () => {
  const admin = await createAdminSession(app);
  const teacher = await createTeacherSession(app);
  expect((await mark(admin, "invalid")).status).toBe(400);
  for (const query of ["from=2026-02-30", "from=2026-10-31&to=2026-10-01", "teacher=invalid"]) {
    expect((await admin.agent.get(`/api/teacher-attendance?${query}`)).status).toBe(400);
  }
  expect((await mark(admin, teacher.staff._id)).status).toBe(201);
  await Staff.updateOne({ _id: teacher.staff._id }, { fullName: "Updated Name", status: "inactive" });
  expect((await mark(admin, teacher.staff._id)).status).toBe(404);
  const history = await admin.agent.get(`/api/teacher-attendance?teacher=${teacher.staff._id}`);
  expect(history.body.items[0].teacherName).toBe("Test Teacher");
});
