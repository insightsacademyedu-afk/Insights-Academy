import { cardDate, safePhotoUrl } from "./attendance";

const loadImage = src => new Promise((resolve, reject) => {
  const image = new Image(); image.crossOrigin = "anonymous";
  image.onload = () => resolve(image); image.onerror = () => reject(new Error("Could not load the card photo. Upload the photo again, then retry.")); image.src = src;
});

export async function exportStudentCard({ student, card, settings, qr }, print = false) {
  // Open synchronously from the click so print windows are not blocked after image loading.
  const popup = print ? window.open("", "_blank", "width=750,height=550") : null;
  if (print && !popup) throw new Error("Allow pop-ups to print this card.");
  try {
    const canvas = document.createElement("canvas"); canvas.width = 1011; canvas.height = 638;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1011, 638);
    ctx.fillStyle = "#1e2a44"; ctx.fillRect(0, 0, 1011, 122);
    ctx.fillStyle = "#ffffff"; ctx.font = "38px Georgia"; ctx.fillText(settings.academyName || "Academy Management", 40, 57, 930);
    ctx.font = "20px Arial"; ctx.fillText("STUDENT IDENTITY CARD", 42, 95);
    ctx.fillStyle = "#b07f22"; ctx.fillRect(0, 122, 1011, 7);
    const photoUrl = safePhotoUrl(student.photoUrl);
    ctx.fillStyle = "#f4f2ec"; ctx.fillRect(40, 161, 155, 190);
    if (photoUrl) {
      const photo = await loadImage(photoUrl);
      const scale = Math.max(155 / photo.width, 190 / photo.height);
      ctx.save();ctx.beginPath();ctx.rect(40, 161, 155, 190);ctx.clip();ctx.drawImage(photo, 40+(155-photo.width*scale)/2, 161+(190-photo.height*scale)/2, photo.width*scale, photo.height*scale);ctx.restore();
    } else { ctx.fillStyle="#55658a";ctx.font="20px Arial";ctx.fillText("No photo", 73, 262); }
    ctx.fillStyle = "#1e2a44"; ctx.font="38px Georgia";ctx.fillText(student.fullName, 225, 205, 720);
    ctx.font="24px Arial";ctx.fillText(`Student ID: ${student.admissionNumber}`,225,250,720);
    ctx.fillText(`${card.className} / ${card.sectionName}`,225,293,720);
    ctx.fillStyle="#55658a";ctx.font="20px Arial";ctx.fillText(card.sessionName,225,333,720);
    ctx.fillText("Guardian phone",40,405);ctx.fillStyle="#1e2a44";ctx.font="28px Arial";ctx.fillText(student.guardian?.primaryPhone || "—",40,446,620);
    ctx.fillStyle="#55658a";ctx.font="21px Arial";ctx.fillText(`Issued: ${cardDate(card.issuedAt)}`,40,505,620);
    ctx.fillText(`Valid through: ${cardDate(new Date(new Date(card.expiresAt).getTime()-1))}`,40,547,620);
    const qrImage = await loadImage(qr);ctx.drawImage(qrImage,735,357,235,235);
    ctx.fillStyle="#55658a";ctx.font="18px Arial";ctx.fillText(`Card version ${card.version} · Valid only for the printed class`,40,603,670);
    const url = canvas.toDataURL("image/png");
    if (print) {
      popup.document.title="Student identity card";
      const style=popup.document.createElement("style");style.textContent="@page{size:A4;margin:15mm}body{margin:20px}img{width:85.6mm;height:54mm;object-fit:contain}@media print{body{margin:0}}";popup.document.head.appendChild(style);
      const image=popup.document.createElement("img");image.alt="Student identity card";image.src=url;popup.document.body.appendChild(image);await image.decode();popup.focus();popup.print();
    } else {
      const link=document.createElement("a");link.href=url;link.download=`student-card-${student.admissionNumber.replace(/[^a-zA-Z0-9_-]/g,"-")}-v${card.version}.png`;link.click();
    }
  } catch(error) { popup?.close(); throw error; }
}
