import app from "../app.js";
import TeacherAttendance from "../models/TeacherAttendance.js";
import Attendance from "../models/Attendance.js";
import TeacherCard from "../models/TeacherCard.js";
import { createAcademicChain, createEnrolledStudent } from "./helpers/fixtures.js";
import { createAdminSession, createTeacherSession, createAndLoginUser, withCsrf } from "./helpers/authHelpers.js";

const post = (account, path, body = {}) => withCsrf(account.agent.post(path).send(body), account.csrfToken);

test("one scan endpoint accepts both card types, deduplicates across portals and keeps access restrictions", async () => {
  await Promise.all([TeacherAttendance.init(), Attendance.init()]);
  const admin = await createAdminSession(app);
  const sub = await createAndLoginUser(app, { role: "subadmin" });
  const teacher = await createTeacherSession(app);
  const { student } = await createEnrolledStudent(await createAcademicChain());
  const studentCard = (await post(admin, `/api/student-cards/${student._id}/issue`)).body.card;
  const employeeCard = (await post(admin, `/api/teacher-cards/${teacher.staff._id}/issue`)).body.card;
  const scan = (account, token) => post(account, "/api/attendance/scan", { token });
  expect((await scan(admin, studentCard.token)).status).toBe(201);
  const saved = await scan(sub, employeeCard.token);
  expect(saved.status).toBe(201);
  expect(saved.body.teacher.fullName).toBe(teacher.staff.fullName);
  expect((await post(admin, "/api/teacher-attendance/scan", { token: employeeCard.token })).body.duplicate).toBe(true);
  expect((await scan(admin, studentCard.token)).body.duplicate).toBe(true);
  expect(await Attendance.countDocuments()).toBe(1);
  expect(await TeacherAttendance.countDocuments()).toBe(1);
  expect((await scan(teacher, employeeCard.token)).status).toBe(403);
  expect((await scan(teacher, studentCard.token)).status).toBe(403);
  expect((await scan(admin, "AMT1_invalid")).status).toBe(400);
  await TeacherCard.updateOne({ _id: employeeCard._id }, { expiresAt: new Date(0) });
  expect((await scan(admin, employeeCard.token)).status).toBe(409);
  await post(admin, `/api/teacher-cards/${teacher.staff._id}/renew`);
  await post(admin, `/api/teacher-cards/${teacher.staff._id}/revoke`);
  expect((await scan(admin, employeeCard.token)).status).toBe(409);
});
