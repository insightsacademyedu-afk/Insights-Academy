import { cardDate, safePhotoUrl } from "./attendance";

// Render the actual logo and QR assets locally, rather than a design-preview image.
export async function drawStudentCard(ctx, { student, card, settings, qr }, loadImage) {
  const blue = "#0c4956", orange = "#e8794d", muted = "#697d83";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 638, 1011);
  const logo = await loadImage(new URL("/branding/insights-mark.svg", window.location.origin).href);
  ctx.drawImage(logo, 247, 30, 144, 149);
  const academyName = settings.academyName || "Insights Academy";
  ctx.fillStyle = blue;
  if (/^insights\s+academy$/i.test(academyName.trim())) {
    ctx.font = "bold 45px Arial"; ctx.fillText("INSIGHTS", 319, 216, 558);
    ctx.fillStyle = orange; ctx.font = "25px Arial"; ctx.fillText("ACADEMY", 319, 247, 558);
  } else {
    ctx.font = "bold 35px Arial"; ctx.fillText(academyName, 319, 230, 558);
  }
  ctx.fillStyle = orange; ctx.fillRect(40, 268, 558, 3);
  ctx.fillStyle = blue; ctx.font = "bold 23px Arial"; ctx.fillText("STUDENT IDENTITY CARD", 319, 301, 558);
  ctx.fillStyle = "#f0f2f3"; ctx.fillRect(244, 322, 150, 180);
  const photoUrl = safePhotoUrl(student.photoUrl);
  if (photoUrl) {
    const photo = await loadImage(photoUrl);
    const scale = Math.max(150 / photo.width, 180 / photo.height);
    ctx.save(); ctx.beginPath(); ctx.rect(244, 322, 150, 180); ctx.clip();
    ctx.drawImage(photo, 244 + (150 - photo.width * scale) / 2, 322 + (180 - photo.height * scale) / 2, photo.width * scale, photo.height * scale); ctx.restore();
  } else { ctx.fillStyle = muted; ctx.font = "18px Arial"; ctx.fillText("No photo", 319, 418); }
  ctx.fillStyle = blue; ctx.font = "bold 32px Arial";
  let nameLine = "", remainingName = "";
  for (const word of student.fullName.trim().split(/\s+/)) {
    const candidate = nameLine ? `${nameLine} ${word}` : word;
    if (!remainingName && (!nameLine || ctx.measureText(candidate).width <= 558)) nameLine = candidate;
    else remainingName = remainingName ? `${remainingName} ${word}` : word;
  }
  ctx.fillText(nameLine, 319, remainingName ? 531 : 549, 558);
  if (remainingName) ctx.fillText(remainingName, 319, 565, 558);
  ctx.font = "22px Arial"; ctx.fillText(`Student ID: ${student.admissionNumber}`, 319, 594, 558);
  ctx.font = "24px Arial"; ctx.fillText(`${card.className} / ${card.sectionName}`, 319, 627, 558);
  ctx.font = "18px Arial"; ctx.fillText(`Academic session: ${card.sessionName}`, 319, 657, 558);
  ctx.fillStyle = muted; ctx.fillText("Guardian phone", 319, 687);
  ctx.fillStyle = blue; ctx.font = "24px Arial"; ctx.fillText(student.guardian?.primaryPhone || "—", 319, 716, 558);
  const qrImage = await loadImage(qr); ctx.drawImage(qrImage, 221, 724, 196, 196);
  ctx.font = "17px Arial"; ctx.fillText(`Issued: ${cardDate(card.issuedAt)}`, 319, 942, 558);
  ctx.fillText(`Valid through: ${cardDate(new Date(new Date(card.expiresAt).getTime() - 1))}`, 319, 966, 558);
  ctx.fillStyle = blue; ctx.fillRect(40, 990, 120, 1); ctx.fillRect(478, 990, 120, 1);
  ctx.fillStyle = muted; ctx.font = "13px Arial"; ctx.fillText(`${card.effectiveStatus?.replaceAll("_", " ") || card.status} · v${card.version}`, 319, 994, 290);
}
