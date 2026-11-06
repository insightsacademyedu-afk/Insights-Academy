import { beforeEach, expect, it, vi } from "vitest";
import { exportStudentCards } from "./exportStudentCards";
import { studentsApi } from "../api/students";
import { studentCardsApi } from "../api/attendance";
import { drawStudentCard } from "./drawStudentCard";
import { createCardPdf } from "./cardPdf";

vi.mock("../api/students", () => ({ studentsApi: { list: vi.fn() } }));
vi.mock("../api/attendance", () => ({ studentCardsApi: { get: vi.fn() } }));
vi.mock("./drawStudentCard", () => ({ drawStudentCard: vi.fn().mockResolvedValue() }));
vi.mock("./cardPdf", () => ({ createCardPdf: vi.fn().mockReturnValue(new Blob()) }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("qr") } }));
beforeEach(() => vi.clearAllMocks());

it("loads every student page, skips invalid and transferred cards and downloads one PDF", async () => {
  const student = id => ({ _id: id, fullName: `Student ${id}`, admissionNumber: id });
  studentsApi.list.mockResolvedValueOnce({ items: [student("1"), student("2")], totalPages: 2, total: 4 }).mockResolvedValueOnce({ items: [student("3"), student("4")], totalPages: 2, total: 4 });
  studentCardsApi.get.mockImplementation(async id => ({ student: student(id), card: { token: `AMS1_${id}`, effectiveStatus: id === "2" ? "expired" : "active" }, currentAssignment: { class: { _id: id === "3" ? "another-class" : "class9" } } }));
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({});
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,/9j/2Q==");
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:cards"); static revokeObjectURL = vi.fn(); });
  try {
    const result = await exportStudentCards({ classId: "class9", settings: {} });
    expect(studentsApi.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ class: "class9", page: 2, limit: 100 }));
    expect(drawStudentCard).toHaveBeenCalledTimes(2);
    expect(createCardPdf).toHaveBeenCalledWith(Array(2).fill("data:image/jpeg;base64,/9j/2Q=="));
    expect(click).toHaveBeenCalledOnce();
    expect(result).toEqual({ count: 2, skipped: ["Student 2 (2)", "Student 3 (3)"] });
  } finally { context.mockRestore(); canvas.mockRestore(); click.mockRestore(); vi.unstubAllGlobals(); }
});

it("does not download an empty PDF", async () => {
  studentsApi.list.mockResolvedValue({ items: [], totalPages: 1, total: 0 });
  expect(await exportStudentCards({ settings: {} })).toEqual({ count: 0, skipped: [] });
  expect(createCardPdf).not.toHaveBeenCalled();
});

it("checks only explicitly selected students", async () => {
  studentCardsApi.get.mockResolvedValue({ card: null });
  const students = [{ _id: "2", fullName: "Amina", admissionNumber: "0042" }];
  expect(await exportStudentCards({ settings: {}, students })).toEqual({ count: 0, skipped: ["Amina (0042)"] });
  expect(studentsApi.list).not.toHaveBeenCalled();
  expect(studentCardsApi.get).toHaveBeenCalledExactlyOnceWith("2");
});
