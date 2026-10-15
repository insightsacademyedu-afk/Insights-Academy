import Student from "../models/Student.js";
import StudentClassAssignment from "../models/StudentClassAssignment.js";
import Test from "../models/Test.js";
import TestResult from "../models/TestResult.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import { buildListQuery, paginatedResponse } from "../utils/listQuery.js";
import { summarize } from "../utils/grading.js";
import { sumMoney } from "../utils/money.js";

export async function listChildren(req, res, next) {
  try {
    const items = await Student.find({ _id: { $in: req.user.studentIds }, archivedAt: null })
      .select("fullName admissionNumber status").sort({ fullName: 1 });
    res.json({ items });
  } catch (error) { next(error); }
}

export async function requireChild(req, res, next) {
  try {
    const student = await Student.findOne({ $and: [{ _id: req.params.id }, { _id: { $in: req.user.studentIds } }], archivedAt: null })
      .select("fullName admissionNumber status");
    if (!student) return res.status(404).json({ message: "Child not found" });
    req.portalChild = student;
    next();
  } catch (error) { next(error); }
}

export async function childOverview(req, res, next) {
  try {
    const student = req.portalChild;
    const [placement, invoices] = await Promise.all([
      StudentClassAssignment.findOne({ student: student._id, status: "active", archivedAt: null }).sort({ createdAt: -1 })
        .select("class section academicSession rollNumber").populate("class section academicSession", "name"),
      FeeInvoice.find({ student: student._id }).select("totalAmount amountPaid status").lean(),
    ]);
    const outstanding = invoices.filter(invoice => invoice.status !== "waived")
      .reduce((total, invoice) => sumMoney(total, Math.max(0, sumMoney(invoice.totalAmount, -invoice.amountPaid))), 0);
    res.json({ student, placement, outstanding });
  } catch (error) { next(error); }
}

export async function childTests(req, res, next) {
  try {
    const student = req.portalChild._id;
    const { page, limit, skip } = buildListQuery(req.query);
    const ownTests = await TestResult.find({ student, archivedAt: null }).distinct("test");
    const publishedTests = await Test.find({ _id: { $in: ownTests }, status: "finalized", archivedAt: null }).distinct("_id");
    const filter = { student, test: { $in: publishedTests }, archivedAt: null };
    const [results, total] = await Promise.all([
      TestResult.find(filter).select("test marksObtained remarks").sort({ createdAt: -1 }).skip(skip).limit(limit).populate({
        path: "test", match: { status: "finalized", archivedAt: null }, select: "title subject academicSession testDate maxMarks passingMarks",
        populate: [{ path: "subject", select: "name" }, { path: "academicSession", select: "name" }],
      }).lean(),
      TestResult.countDocuments(filter),
    ]);
    const items = results.filter(result => result.test).map(result => ({ ...result,
      summary: summarize(result.marksObtained, result.test.maxMarks, result.test.passingMarks),
    }));
    res.json(paginatedResponse(items, total, page, limit));
  } catch (error) { next(error); }
}

export async function childInvoices(req, res, next) {
  try {
    const filter = { student: req.portalChild._id };
    const { page, limit, skip } = buildListQuery(req.query);
    const [items, total] = await Promise.all([
      FeeInvoice.find(filter).select("period invoiceType totalAmount amountPaid dueDate status academicSession")
        .populate("academicSession", "name").sort({ dueDate: -1, _id: -1 }).skip(skip).limit(limit),
      FeeInvoice.countDocuments(filter),
    ]);
    res.json(paginatedResponse(items, total, page, limit));
  } catch (error) { next(error); }
}

export async function childPayments(req, res, next) {
  try {
    const filter = { student: req.portalChild._id };
    const { page, limit, skip } = buildListQuery(req.query);
    const [items, total] = await Promise.all([
      FeePayment.find(filter).select("amount method receiptNumber paidAt").sort({ paidAt: -1, _id: -1 }).skip(skip).limit(limit),
      FeePayment.countDocuments(filter),
    ]);
    res.json(paginatedResponse(items, total, page, limit));
  } catch (error) { next(error); }
}
