import request from "supertest";
import app from "../app.js";
import User from "../models/User.js";
import Staff from "../models/Staff.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import { createAdminSession, createAndLoginUser, createTeacherSession, extractCookieValue, withCsrf } from "./helpers/authHelpers.js";
import { createAcademicChain, createEnrolledStudent } from "./helpers/fixtures.js";

const account = { username: "reception", displayName: "Student Office", email: "office@example.com", password: "OfficePassword123!", status: "active" };
const subSession = () => createAndLoginUser(app, { role: "subadmin" });

test("sub-admin can change its own password and sign out without gaining settings access", async () => {
  const sub = await subSession();
  const changed = await withCsrf(sub.agent.post("/api/auth/change-password").send({
    currentPassword: "Password123!", newPassword: "NewOfficePassword123!", confirmPassword: "NewOfficePassword123!",
  }), sub.csrfToken);
  expect(changed.status).toBe(200);
  expect((await sub.agent.get("/api/auth/me")).status).toBe(200);
  const login = await sub.agent.post("/api/auth/login").send({ username: sub.user.username, password: "NewOfficePassword123!", role: "subadmin" });
  expect(login.status).toBe(200);
  expect((await withCsrf(sub.agent.post("/api/auth/logout"), sub.csrfToken)).status).toBe(200);
  expect((await sub.agent.get("/api/auth/me")).status).toBe(401);
});

test("only the main admin can create, reset and deactivate a separate sub-admin login", async () => {
  const admin = await createAdminSession(app);
  const created = await withCsrf(admin.agent.post("/api/sub-admins").send({ ...account, role: "admin" }), admin.csrfToken);
  expect(created.status).toBe(201);
  expect(JSON.stringify(created.body)).not.toContain("password");
  const id = created.body._id;
  expect((await User.findById(id)).role).toBe("subadmin");
  const agent = request.agent(app);
  expect((await agent.post("/api/auth/login").send({ username: account.username, password: account.password, role: "admin" })).status).toBe(401);
  const login = await agent.post("/api/auth/login").send({ username: account.username, password: account.password, role: "subadmin" });
  expect(login.status).toBe(200);
  const token = extractCookieValue(login, "ams_csrf");
  expect((await agent.get("/api/sub-admins")).status).toBe(403);
  expect((await withCsrf(agent.post("/api/sub-admins").send(account), token)).status).toBe(403);
  expect((await withCsrf(agent.put(`/api/sub-admins/${admin.user._id}`).send(account), token)).status).toBe(403);
  const saved = await withCsrf(admin.agent.put(`/api/sub-admins/${id}`).send({ ...account, password: "ChangedPassword123!" }), admin.csrfToken);
  expect(saved.status).toBe(200);
  expect((await agent.get("/api/auth/me")).status).toBe(401);
  expect((await agent.post("/api/auth/login").send({ username: account.username, password: account.password, role: "subadmin" })).status).toBe(401);
  expect((await agent.post("/api/auth/login").send({ username: account.username, password: "ChangedPassword123!", role: "subadmin" })).status).toBe(200);
  expect((await withCsrf(admin.agent.put(`/api/sub-admins/${id}`).send({ ...account, password: "", status: "inactive" }), admin.csrfToken)).status).toBe(200);
  expect((await agent.get("/api/auth/me")).status).toBe(403);
  const teacher = await createTeacherSession(app);
  expect((await teacher.agent.get("/api/sub-admins")).status).toBe(403);
  expect((await request(app).get("/api/sub-admins")).status).toBe(401);
});

test("sub-admin registration and academic lookups work without granting account or setup administration", async () => {
  const sub = await subSession();
  const chain = await createAcademicChain();
  for (const path of ["academic-sessions", "classes", "sections", "subjects", "settings"]) {
    expect((await sub.agent.get(`/api/${path}`)).status).toBe(200);
    expect((await withCsrf(sub.agent.post(`/api/${path}`).send({ name: "Blocked" }), sub.csrfToken)).status).toBe(403);
  }
  const created = await withCsrf(sub.agent.post("/api/students").send({
    fullName: "Registered Student", gender: "female", dob: "2015-01-01",
    guardian: { fullName: "Student Parent", primaryPhone: "03005551234" },
    feeDetails: { monthlyTuition: 8500 },
    enrollment: { class: chain.klass._id, section: chain.section._id, academicSession: chain.session._id },
  }), sub.csrfToken);
  expect(created.status).toBe(201);
  const id = created.body.student._id;
  const students = await sub.agent.get("/api/students");
  expect(students.status).toBe(200);
  expect(students.body.items).toHaveLength(1);
  expect(students.body.items[0]).not.toHaveProperty("feeDetails");
  expect(students.body.items[0]).not.toHaveProperty("totalPayable");
  const detail = await sub.agent.get(`/api/students/${id}`);
  expect(detail.status).toBe(200);
  expect(detail.body.student.feeDetails.monthlyTuition).toBe(8500);
  expect(detail.body).not.toHaveProperty("parentPortals");
  expect((await withCsrf(sub.agent.put(`/api/students/${id}`).send({ fullName: "Updated Student" }), sub.csrfToken)).status).toBe(200);
  expect((await withCsrf(sub.agent.delete(`/api/students/${id}`).send({}), sub.csrfToken)).status).toBe(403);
  expect((await withCsrf(sub.agent.post(`/api/students/${id}/parent-login/reset-password`).send({}), sub.csrfToken)).status).toBe(403);
  const report = await sub.agent.get("/api/reports/students");
  expect(report.status).toBe(200);
  expect(report.body.items[0]).not.toHaveProperty("feeDetails");
  expect(report.body.items[0]).not.toHaveProperty("totalPayable");
  expect((await sub.agent.get("/api/reports/students?format=csv")).status).toBe(200);
});

test("sub-admin can create tests, enter marks, finalize and view academic reports", async () => {
  const sub = await subSession();
  const chain = await createAcademicChain();
  const { student } = await createEnrolledStudent(chain);
  const teacher = await Staff.create({ fullName: "Academic Teacher", status: "active", salary: { baseSalary: 90000 } });
  const teachers = await sub.agent.get("/api/tests/teachers");
  expect(teachers.status).toBe(200);
  expect(Object.keys(teachers.body.items[0]).sort()).toEqual(["_id", "fullName"]);
  const created = await withCsrf(sub.agent.post("/api/tests").send({ title: "Office Test", class: chain.klass._id,
    section: chain.section._id, subject: chain.subject._id, academicSession: chain.session._id,
    maxMarks: 100, passingMarks: 40, testDate: "2026-10-15", createdBy: teacher._id }), sub.csrfToken);
  expect(created.status).toBe(201);
  const id = created.body._id || created.body.test?._id;
  expect(id).toBeTruthy();
  expect((await sub.agent.get(`/api/tests/${id}/roster`)).status).toBe(200);
  expect((await withCsrf(sub.agent.post(`/api/tests/${id}/marks`).send({ entries: [{ student: student._id, marksObtained: 75 }] }), sub.csrfToken)).status).toBe(200);
  expect((await withCsrf(sub.agent.post(`/api/tests/${id}/finalize`).send({}), sub.csrfToken)).status).toBe(200);
  expect((await sub.agent.get(`/api/tests/${id}`)).status).toBe(200);
  expect((await sub.agent.get(`/api/dashboard/tests/${id}/grade-distribution`)).body.totalStudents).toBe(1);
});

test("invoice lists and fee reports are scoped to one student, including CSV exports", async () => {
  const sub = await subSession();
  const chain = await createAcademicChain();
  const first = (await createEnrolledStudent(chain, { fullName: "Selected Student" })).student;
  const second = (await createEnrolledStudent(chain, { fullName: "Other Student" })).student;
  const invoices = [];
  for (const [student, amount] of [[first, 5000], [second, 99000]]) {
    const invoice = await FeeInvoice.create({ student: student._id, academicSession: chain.session._id,
      period: "2026-10", monthlyTuition: amount, totalAmount: amount, amountPaid: 1000, dueDate: "2026-10-31", status: "partially_paid" });
    invoices.push(invoice);
    await FeePayment.create({ invoice: invoice._id, student: student._id, amount: 1000, method: "cash", receiptNumber: String(student._id), receivedBy: sub.user._id });
  }
  for (const endpoint of ["/api/fees/invoices", "/api/reports/fee-collection", "/api/reports/outstanding-fees"]) {
    expect((await sub.agent.get(endpoint)).status).toBe(403);
    expect((await sub.agent.get(`${endpoint}?format=csv`)).status).toBe(403);
    expect((await sub.agent.get(`${endpoint}?student=all`)).status).toBe(403);
    const response = await sub.agent.get(`${endpoint}?student=${first._id}`);
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(String(response.body.items[0].student._id)).toBe(String(first._id));
    expect(JSON.stringify(response.body)).not.toContain(String(second._id));
    if (endpoint.includes("outstanding")) expect(response.body.totalOutstanding).toBe(4000);
    if (endpoint.includes("collection")) expect(response.body.total).toBe(1000);
    if (endpoint.includes("reports")) {
      const csv = await sub.agent.get(`${endpoint}?student=${first._id}&format=csv`);
      expect(csv.status).toBe(200);
      expect(csv.text).toContain("Selected Student");
      expect(csv.text).not.toContain("Other Student");
    }
  }
  expect((await sub.agent.get(`/api/fees/invoices/${invoices[0]._id}`)).status).toBe(200);
  expect((await sub.agent.get(`/api/fees/students/${first._id}/summary`)).status).toBe(200);
  for (const [method, endpoint] of [["post", "/api/fees/payments"], ["post", "/api/fees/invoices"],
    ["post", "/api/fees/invoices/bulk-generate"], ["patch", `/api/fees/invoices/${invoices[0]._id}/waive`]]) {
    expect((await withCsrf(sub.agent[method](endpoint).send({}), sub.csrfToken)).status).toBe(403);
  }
});

test("financial totals and administration remain forbidden even through direct API requests", async () => {
  const sub = await subSession();
  for (const endpoint of ["/api/dashboard/admin-summary", "/api/dashboard/teacher-summary", "/api/reports/expenses",
    "/api/expenses", "/api/expense-categories", "/api/salaries", "/api/staff", "/api/teacher-assignments/mine",
    "/api/guardians", "/api/guardian-portal/children", "/api/archive", "/api/sub-admins"]) {
    expect((await sub.agent.get(endpoint)).status).toBe(403);
  }
  for (const endpoint of ["/api/backups/create", "/api/backups/inspect", "/api/backups/restore"]) {
    expect((await withCsrf(sub.agent.post(endpoint).send({}), sub.csrfToken)).status).toBe(403);
  }
  expect((await withCsrf(sub.agent.put("/api/settings").send({ academyName: "Blocked" }), sub.csrfToken)).status).toBe(403);
  expect((await sub.agent.get("/api/reports/fee-collection?student[$ne]=x")).status).toBe(400);
  expect((await sub.agent.get("/api/reports/fee-collection?student=000000000000000000000001&student=000000000000000000000002")).status).toBe(400);
});
