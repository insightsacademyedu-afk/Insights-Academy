import { expect, it } from "vitest";
import { createCardPdf, CARD_SHEET } from "./cardPdf";

it("keeps full-size cards within A4 margins and puts the tenth card on a second page", async () => {
  const { columns, rows, cardWidth, cardHeight, gap, width, height } = CARD_SHEET;
  expect(columns * cardWidth + (columns - 1) * gap + 20).toBeLessThan(width);
  expect(rows * cardHeight + (rows - 1) * gap + 20).toBeLessThan(height);
  const blob = createCardPdf(Array(10).fill("data:image/jpeg;base64,/9j/2Q=="));
  const reader = new FileReader();
  const text = await new Promise(resolve => { reader.onload = () => resolve(reader.result); reader.readAsText(blob); });
  expect(text).toContain("/Count 2");
  expect(text.match(/\/Subtype \/Image/g)).toHaveLength(10);
  expect(text).toContain("/MediaBox [0 0 595.2756 841.8898]");
  const start = Number(text.match(/startxref\n(\d+)/)[1]);
  // The sample contains non-ASCII JPEG bytes; use the original bytes for offsets.
  const bytes = await new Promise(resolve => { reader.onload = () => resolve(new Uint8Array(reader.result)); reader.readAsArrayBuffer(blob); });
  expect(String.fromCharCode(...bytes.slice(start, start + 4))).toBe("xref");
});
