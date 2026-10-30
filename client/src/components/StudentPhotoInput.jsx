import { useState } from "react";
import { Field } from "./FormFields";
import Button from "./Button";
import { safePhotoUrl } from "../lib/attendance";

export default function StudentPhotoInput({ value, onChange }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setError("Choose a JPG, PNG or WebP photo under 8 MB."); return;
    }
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 480 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const photo = canvas.toDataURL("image/jpeg", 0.85);
      if (photo.length > 350000) throw new Error("Please choose a smaller photo.");
      onChange(photo);
    } catch (err) { setError(err.message || "Could not read this photo."); }
    finally { URL.revokeObjectURL(url); setBusy(false); }
  }
  return <div className="mb-4">
    <Field label="Student photo"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={upload} className="block w-full text-sm text-ink-700" /></Field>
    {busy && <p role="status" className="text-sm text-ink-500">Preparing photo…</p>}
    {safePhotoUrl(value) && <div className="flex items-center gap-3"><img src={safePhotoUrl(value)} alt="Student photo preview" className="h-24 w-20 rounded object-cover" /><Button type="button" variant="ghost" onClick={() => onChange("")}>Remove photo</Button></div>}
    {error && <p role="alert" className="mt-2 text-sm text-brick-600">{error}</p>}
  </div>;
}
