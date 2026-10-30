import { cardDate, safePhotoUrl } from "./attendance";

const loadImage = src => new Promise((resolve, reject) => {
  const image = new Image(); image.crossOrigin = "anonymous";
  image.onload = () => resolve(image); image.onerror = () => reject(new Error("Could not load the card photo. Upload the photo again, then retry.")); image.src = src;
});

export async function exportStudentCard({ student, card, settings, qr }, print = false) {
  // Open synchronously from the click so print windows are not blocked after image loading.
  const popup = print ? window.open("", "_blank", "width=550,height=750") : null;
  if (print && !popup) throw new Error("Allow pop-ups to print this card.");
  try {
    const canvas = document.createElement("canvas"); canvas.width = 638; canvas.height = 1011;
    const ctx = canvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 638, 1011);
    ctx.fillStyle = "#1e2a44"; ctx.fillRect(0, 0, 638, 140);
    ctx.fillStyle = "#ffffff"; ctx.font = "36px Georgia"; ctx.fillText(settings.academyName || "Academy Management", 319, 62, 558);
    ctx.font = "20px Arial"; ctx.fillText("STUDENT IDENTITY CARD", 319, 104);
    ctx.fillStyle = "#b07f22"; ctx.fillRect(0, 140, 638, 7);
    const photoUrl = safePhotoUrl(student.photoUrl);
    ctx.fillStyle = "#f4f2ec"; ctx.fillRect(234, 170, 170, 205);
    if (photoUrl) {
      const photo = await loadImage(photoUrl);
      const scale = Math.max(170 / photo.width, 205 / photo.height);
      ctx.save();ctx.beginPath();ctx.rect(234, 170, 170, 205);ctx.clip();ctx.drawImage(photo, 234+(170-photo.width*scale)/2, 170+(205-photo.height*scale)/2, photo.width*scale, photo.height*scale);ctx.restore();
    } else { ctx.fillStyle="#55658a";ctx.font="20px Arial";ctx.fillText("No photo", 319, 278); }
    ctx.fillStyle = "#1e2a44"; ctx.font="38px Georgia";
    const words = student.fullName.trim().split(/\s+/);
    let nameLine = "", remainingName = "";
    for (const word of words) {
      const candidate = nameLine ? `${nameLine} ${word}` : word;
      if (!remainingName && (!nameLine || ctx.measureText(candidate).width <= 558)) nameLine = candidate;
      else remainingName = remainingName ? `${remainingName} ${word}` : word;
    }
    ctx.fillText(nameLine, 319, remainingName ? 416 : 433, 558);
    if (remainingName) ctx.fillText(remainingName, 319, 457, 558);
    ctx.font="24px Arial";ctx.fillText(`Student ID: ${student.admissionNumber}`,319,494,558);
    ctx.fillText(`${card.className} / ${card.sectionName}`,319,533,558);
    ctx.fillStyle="#55658a";ctx.font="20px Arial";ctx.fillText(card.sessionName,319,566,558);
    ctx.fillText("Guardian phone",319,607);ctx.fillStyle="#1e2a44";ctx.font="26px Arial";ctx.fillText(student.guardian?.primaryPhone || "—",319,639,558);
    const qrImage = await loadImage(qr);ctx.drawImage(qrImage,201,650,236,236);
    ctx.fillStyle="#55658a";ctx.font="20px Arial";ctx.fillText(`Issued: ${cardDate(card.issuedAt)}`,319,920,558);
    ctx.fillText(`Valid through: ${cardDate(new Date(new Date(card.expiresAt).getTime()-1))}`,319,951,558);
    ctx.font="17px Arial";ctx.fillText(`Card version ${card.version} · Valid only for the printed class`,319,986,558);
    const url = canvas.toDataURL("image/png");
    if (print) {
      popup.document.title="Student identity card";
      const style=popup.document.createElement("style");style.textContent="@page{size:A4;margin:15mm}body{margin:20px}img{width:54mm;height:85.6mm;object-fit:contain}@media print{body{margin:0}}";popup.document.head.appendChild(style);
      const image=popup.document.createElement("img");image.alt="Student identity card";image.src=url;popup.document.body.appendChild(image);await image.decode();popup.focus();popup.print();
    } else {
      const link=document.createElement("a");link.href=url;link.download=`student-card-${student.admissionNumber.replace(/[^a-zA-Z0-9_-]/g,"-")}-v${card.version}.png`;link.click();
    }
  } catch(error) { popup?.close(); throw error; }
}
