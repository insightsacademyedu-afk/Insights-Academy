// ISO ID-1 cards, upright: nine full-size cards fit within A4 printer margins.
export const CARD_SHEET = { width: 210, height: 297, cardWidth: 54, cardHeight: 85.6, columns: 3, rows: 3, gap: 5 };

export function createCardPdf(images) {
  if (!images.length) throw new Error("No printable cards found.");
  const encode = value => new TextEncoder().encode(value);
  const objects = [];
  const add = value => { objects.push(value); return objects.length; };
  const stream = (dictionary, bytes) => [encode(`<< ${dictionary} /Length ${bytes.length} >>\nstream\n`), bytes, encode("\nendstream")];
  add(null); add(null);
  const pageIds = [];
  const pt = mm => (mm * 72 / 25.4).toFixed(4);
  const { width, height, cardWidth, cardHeight, columns, rows, gap } = CARD_SHEET;
  const left = (width - columns * cardWidth - (columns - 1) * gap) / 2;
  const top = (height - rows * cardHeight - (rows - 1) * gap) / 2;
  for (let start = 0; start < images.length; start += columns * rows) {
    const batch = images.slice(start, start + columns * rows);
    const resources = [], commands = [];
    batch.forEach((image, index) => {
      const binary = atob(image.split(",")[1]);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      const imageId = add(stream("/Type /XObject /Subtype /Image /Width 638 /Height 1011 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode", bytes));
      resources.push(`/Card${index} ${imageId} 0 R`);
      const x = left + (index % columns) * (cardWidth + gap);
      const y = height - top - Math.floor(index / columns) * (cardHeight + gap) - cardHeight;
      commands.push(`q ${pt(cardWidth)} 0 0 ${pt(cardHeight)} ${pt(x)} ${pt(y)} cm /Card${index} Do Q`);
      commands.push(`0.7 G 0.25 w ${pt(x)} ${pt(y)} ${pt(cardWidth)} ${pt(cardHeight)} re S`);
    });
    const contentId = add(stream("", encode(commands.join("\n"))));
    pageIds.push(add([encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(width)} ${pt(height)}] /Resources << /XObject << ${resources.join(" ")} >> >> /Contents ${contentId} 0 R >>`)]));
  }
  objects[0] = [encode("<< /Type /Catalog /Pages 2 0 R >>")];
  objects[1] = [encode(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] >>`)];
  const chunks = [encode("%PDF-1.4\n")], offsets = [0];
  let size = chunks[0].length;
  objects.forEach((parts, index) => {
    offsets.push(size);
    const object = [encode(`${index + 1} 0 obj\n`), ...parts, encode("\nendobj\n")];
    object.forEach(part => { chunks.push(part); size += part.length; });
  });
  chunks.push(encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`));
  return new Blob(chunks, { type: "application/pdf" });
}
