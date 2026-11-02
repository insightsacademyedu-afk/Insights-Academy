import QRCode from "qrcode";
import { studentsApi } from "../api/students";
import { studentCardsApi } from "../api/attendance";
import { drawStudentCard } from "./drawStudentCard";
import { createCardPdf } from "./cardPdf";

const loadImage = src => new Promise((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("Could not load a card image. Check the photo and try again."));
  image.src = src;
});

export async function exportStudentCards({ classId, settings, onProgress = () => {} }) {
  const images = [], skipped = [];
  let page = 1, totalPages = 1, processed = 0;
  do {
    const result = await studentsApi.list({ page, limit: 100, status: "active", sortBy: "_id", sortDir: "asc", ...(classId ? { class: classId } : {}) });
    totalPages = result.totalPages;
    for (const student of result.items) {
      const data = await studentCardsApi.get(student._id);
      // A transfer during export must not place another class's card in this batch.
      if (data.card?.effectiveStatus !== "active" || !data.card.token || (classId && String(data.currentAssignment?.class?._id) !== classId)) {
        skipped.push(`${student.fullName} (${student.admissionNumber})`);
      } else {
        const qr = await QRCode.toDataURL(data.card.token, { width: 400, margin: 4, errorCorrectionLevel: "M" });
        const canvas = document.createElement("canvas");
        canvas.width = 638; canvas.height = 1011;
        await drawStudentCard(canvas.getContext("2d"), { ...data, settings, qr }, loadImage);
        images.push(canvas.toDataURL("image/jpeg", 0.95));
      }
      onProgress(++processed, result.total);
    }
    page++;
  } while (page <= totalPages);
  if (!images.length) return { count: 0, skipped };
  const url = URL.createObjectURL(createCardPdf(images));
  const link = document.createElement("a");
  link.href = url; link.download = "student-cards-A4.pdf";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { count: images.length, skipped };
}
