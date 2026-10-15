import request from "supertest";
import mongoose from "mongoose";
import app from "../app.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import Test from "../models/Test.js";
import TestResult from "../models/TestResult.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import { createAdminSession, createTeacherSession, extractCookieValue, withCsrf } from "./helpers/authHelpers.js";
import { createAcademicChain, createEnrolledStudent } from "./helpers/fixtures.js";
import { ensureUserEmailIndex } from "../utils/userEmailIndex.js";

const initialPassword = "Parent12";
async function setupFamily() {
  const admin = await createAdminSession(app);
  const chain = await createAcademicChain();
  const own = await createEnrolledStudent(chain, { fullName: "Own Child" });
  const sibling = await createEnrolledStudent(chain, { fullName: "Sibling" });
  const other = await createEnrolledStudent(chain, { fullName: "Another Family" });
  return { admin, chain, own, sibling, other };
}
async function createParent(admin, children, overrides = {}) {
  const response = await withCsrf(admin.agent.post("/api/guardians").send({
    displayName: "Parent One", email: "parent@gmail.com", phone: "0300-1234567",
    studentIds: children.map(child => String(child.student._id)), password: initialPassword,
    ...overrides,
  }), admin.csrfToken);
  expect(response.status).toBe(201);
  expect(response.body.passwordHash).toBeUndefined();
  return response.body;
}
async function parentSession(identifier = "parent@gmail.com", password = initialPassword) {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({ role: "parent", username: identifier, password });
  expect(response.status).toBe(200);
  return { agent, csrfToken: extractCookieValue(response, "ams_csrf"), user: response.body.user };
}

test("guardian email and phone login show only explicitly linked children and finalized reports", async () => {
  const { admin, chain, own, sibling, other } = await setupFamily();
  await createParent(admin, [own, sibling], { role: "admin", staffId: admin.user._id });
  for (const identifier of [" PARENT@GMAIL.COM ", "03001234567", "+92 300 1234567"]) {
    const parent = await parentSession(identifier);
    expect(parent.user.role).toBe("guardian");
  }
  const parent = await parentSession();
  const children = await parent.agent.get(`/api/guardian-portal/children?studentId=${other.student._id}`);
  expect(children.body.items.map(child => child.fullName).sort()).toEqual(["Own Child", "Sibling"]);
  expect(children.body.items[0].guardian).toBeUndefined();
  const teacher = await createTeacherSession(app);
  const makeTest = (title, status) => Test.create({ title, status, class: chain.klass._id, section: chain.section._id,
    subject: chain.subject._id, academicSession: chain.session._id, createdBy: teacher.staff._id,
    maxMarks: 100, passingMarks: 40, testDate: new Date() });
  const published = await makeTest("Published report", "finalized");
  const draft = await makeTest("Private draft", "draft");
  await TestResult.create({ test: published._id, student: own.student._id, marksObtained: 85, remarks: "Well done" });
  await TestResult.create({ test: draft._id, student: own.student._id, marksObtained: 22 });
  await TestResult.create({ test: published._id, student: other.student._id, marksObtained: 99 });
  const reports = await parent.agent.get(`/api/guardian-portal/children/${own.student._id}/tests`);
  expect(reports.status).toBe(200);
  expect(reports.body.total).toBe(1);
  expect(reports.body.items[0].summary).toMatchObject({ percentage: 85, grade: "A", passed: true });
  expect(reports.body.items[0].test.title).toBe("Published report");
  expect(reports.body.items[0].amendments).toBeUndefined();
  expect(reports.body.items[0].test.createdBy).toBeUndefined();
});

test("fee history is scoped, paginated and excludes internal staff notes", async () => {
  const { admin, chain, own, other } = await setupFamily();
  await createParent(admin, [own]);
  const parent = await parentSession();
  const invoice = await FeeInvoice.create({ student: own.student._id, academicSession: chain.session._id,
    period: "2026-10", monthlyTuition: 1000, totalAmount: 1000, amountPaid: 400, dueDate: "2026-10-20", notes: "PRIVATE NOTE" });
  await FeeInvoice.create({ student: other.student._id, academicSession: chain.session._id,
    period: "2026-10", monthlyTuition: 9000, totalAmount: 9000, dueDate: "2026-10-20" });
  await FeePayment.create({ student: own.student._id, invoice: invoice._id, amount: 400, method: "cash",
    receiptNumber: "PARENT-001", receivedBy: admin.user._id, notes: "PRIVATE PAYMENT NOTE" });
  const invoices = await parent.agent.get(`/api/guardian-portal/children/${own.student._id}/invoices?limit=1`);
  expect(invoices.status).toBe(200);
  expect(invoices.body.total).toBe(1);
  expect(invoices.body.items[0].totalAmount).toBe(1000);
  expect(invoices.body.items[0].notes).toBeUndefined();
  const payments = await parent.agent.get(`/api/guardian-portal/children/${own.student._id}/payments`);
  expect(payments.body.items).toHaveLength(1);
  expect(payments.body.items[0].receiptNumber).toBe("PARENT-001");
  expect(payments.body.items[0].receivedBy).toBeUndefined();
  expect(payments.body.items[0].notes).toBeUndefined();
  const overview = await parent.agent.get(`/api/guardian-portal/children/${own.student._id}`);
  expect(overview.body.outstanding).toBe(600);
  expect(overview.body.student.cnicOrBForm).toBeUndefined();
  expect(overview.body.student.address).toBeUndefined();
});

test("guardians cannot request another family's child or use any academy management APIs", async () => {
  const { admin, own, other } = await setupFamily();
  await createParent(admin, [own]);
  const parent = await parentSession();
  for (const suffix of ["", "/tests", "/invoices", "/payments"]) {
    expect((await parent.agent.get(`/api/guardian-portal/children/${other.student._id}${suffix}`)).status).toBe(404);
  }
  for (const path of ["/api/students", `/api/students/${own.student._id}`, "/api/tests", "/api/fees/invoices",
    "/api/staff", "/api/guardians", "/api/settings", "/api/dashboard/teacher-summary", "/api/teacher-assignments/mine",
    "/api/reports/students", "/api/archive", "/api/classes", "/api/salaries"]) {
    expect((await parent.agent.get(path)).status).toBe(403);
  }
  expect((await withCsrf(parent.agent.put(`/api/students/${own.student._id}`).send({ fullName: "Hacked" }), parent.csrfToken)).status).toBe(403);
  expect((await withCsrf(parent.agent.post("/api/fees/payments").send({ amount: 1 }), parent.csrfToken)).status).toBe(403);
  expect((await withCsrf(parent.agent.post("/api/guardians").send({ role: "admin" }), parent.csrfToken)).status).toBe(403);
  expect((await Student.findById(own.student._id)).fullName).toBe("Own Child");
  expect((await admin.agent.get("/api/guardian-portal/children")).status).toBe(403);
  const teacher = await createTeacherSession(app);
  expect((await teacher.agent.get("/api/guardians")).status).toBe(403);
  expect((await teacher.agent.get("/api/guardian-portal/children")).status).toBe(403);
});

test("multiple phone-only accounts are supported and duplicate login identifiers are rejected", async () => {
  const { admin, own, other } = await setupFamily();
  await createParent(admin, [own], { email: "" });
  await createParent(admin, [other], { email: "", phone: "03111234567" });
  await parentSession("+923111234567");
  const duplicate = await withCsrf(admin.agent.post("/api/guardians").send({ displayName: "Duplicate", phone: "+923001234567",
    password: initialPassword, studentIds: [String(other.student._id)] }), admin.csrfToken);
  expect(duplicate.status).toBe(409);
  const invalid = await withCsrf(admin.agent.post("/api/guardians").send({ displayName: "No contact", password: initialPassword,
    studentIds: [String(own.student._id)] }), admin.csrfToken);
  expect(invalid.status).toBe(400);
  const unlinked = await withCsrf(admin.agent.post("/api/guardians").send({ displayName: "No child", phone: "03211234567",
    password: initialPassword, studentIds: [] }), admin.csrfToken);
  expect(unlinked.status).toBe(400);
});

test("guardians change their own passwords and administrators reset forgotten passwords", async () => {
  const { admin, own } = await setupFamily();
  const account = await createParent(admin, [own]);
  const parent = await parentSession();
  const otherSession = await parentSession();
  const change = await withCsrf(parent.agent.post("/api/auth/change-password").send({ currentPassword: initialPassword,
    newPassword: "ParentChanged123!", confirmPassword: "ParentChanged123!" }), parent.csrfToken);
  expect(change.status).toBe(200);
  expect((await parent.agent.get("/api/auth/me")).status).toBe(200);
  expect((await otherSession.agent.get("/api/auth/me")).status).toBe(401);
  const forgotten = await request(app).post("/api/auth/request-password-reset").send({ email: "parent@gmail.com" });
  expect(forgotten.status).toBe(200);
  expect((await User.findById(account._id).select("+passwordResetTokenHash")).passwordResetTokenHash).toBeNull();
  const reset = await withCsrf(admin.agent.post(`/api/guardians/${account._id}/reset-password`).send({ password: "Reset123" }), admin.csrfToken);
  expect(reset.status).toBe(200);
  expect((await parent.agent.get("/api/auth/me")).status).toBe(401);
  await parentSession("03001234567", "Reset123");
  expect((await withCsrf(admin.agent.post(`/api/guardians/${admin.user._id}/reset-password`).send({ password: "MustNotChange123!" }), admin.csrfToken)).status).toBe(404);
});

test("changing child assignments or revoking access immediately invalidates guardian sessions", async () => {
  const { admin, own, other } = await setupFamily();
  const account = await createParent(admin, [own]);
  const parent = await parentSession();
  const change = await withCsrf(admin.agent.put(`/api/guardians/${account._id}`).send({ displayName: "Parent One", email: "parent@gmail.com",
    phone: "03001234567", studentIds: [String(other.student._id)], status: "active", role: "admin" }), admin.csrfToken);
  expect(change.status).toBe(200);
  expect((await parent.agent.get("/api/auth/me")).status).toBe(401);
  const updatedSession = await parentSession();
  expect((await updatedSession.agent.get(`/api/guardian-portal/children/${own.student._id}`)).status).toBe(404);
  expect((await updatedSession.agent.get(`/api/guardian-portal/children/${other.student._id}`)).status).toBe(200);
  expect((await withCsrf(admin.agent.post(`/api/guardians/${account._id}/revoke-login`), admin.csrfToken)).status).toBe(200);
  expect((await updatedSession.agent.get("/api/auth/me")).status).toBe(403);
});

test("archived children disappear without granting access to matching guardian contact records", async () => {
  const { admin, own, other } = await setupFamily();
  await createParent(admin, [own]);
  const parent = await parentSession();
  await Student.findByIdAndUpdate(own.student._id, { archivedAt: new Date() });
  expect((await parent.agent.get("/api/guardian-portal/children")).body.items).toEqual([]);
  expect((await parent.agent.get(`/api/guardian-portal/children/${own.student._id}/tests`)).status).toBe(404);
  expect((await parent.agent.get(`/api/guardian-portal/children/${other.student._id}/tests`)).status).toBe(404);
});

test("legacy email index migration keeps existing emails unique while allowing phone-only accounts", async () => {
  const collection = mongoose.connection.collection("guardian_index_migration_test");
  await collection.createIndex({ email: 1 }, { unique: true, name: "email_1" });
  await collection.insertOne({ email: "existing@example.com" });
  await ensureUserEmailIndex(collection);
  await collection.insertMany([{ phone: "03001234567" }, { phone: "03111234567" }]);
  await expect(collection.insertOne({ email: "existing@example.com" })).rejects.toMatchObject({ code: 11000 });
  expect((await collection.indexes()).some(index => index.name === "email_1")).toBe(false);
  expect(await collection.countDocuments()).toBe(3);
});
