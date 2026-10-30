import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import AppLayout from "../components/AppLayout";
import StudentSelector from "../components/StudentSelector";
import StudentPhotoInput from "../components/StudentPhotoInput";
import Panel from "../components/Panel";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { Field, TextInput } from "../components/FormFields";
import { studentCardsApi } from "../api/attendance";
import { studentsApi } from "../api/students";
import { useAcademy } from "../context/academy";
import { cardDate, safePhotoUrl } from "../lib/attendance";
import { exportStudentCard } from "../lib/exportStudentCard";

export default function StudentCards() {
  const [params, setParams] = useSearchParams();
  const id = params.get("student") || "";
  return <AppLayout title="Student cards">
    <p className="mb-4 text-sm text-ink-600">Cards are valid for one year. A class transfer replaces the card and invalidates its old QR immediately.</p>
    <StudentCardWorkspace key={id} id={id} onSelect={student => setParams(student ? { student: student._id } : {})} />
  </AppLayout>;
}

function StudentCardWorkspace({ id, onSelect }) {
  const { settings } = useAcademy();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [qrImage, setQrImage] = useState(null);
  const [editing, setEditing] = useState(null);
  const [action, setAction] = useState("");
  useEffect(() => {
    if (!id) return;
    let active = true;
    studentCardsApi.get(id).then(value => { if (active) setData(value); }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  const token = data?.card?.token;
  const qr = token && qrImage?.token === token ? qrImage.url : "";
  useEffect(() => {
    let active = true;
    if (token) QRCode.toDataURL(token, { width: 400, margin: 4, errorCorrectionLevel: "M" }).then(url => { if (active) setQrImage({ token, url }); }).catch(() => { if (active) setError("Could not generate QR. Refresh and try again."); });
    return () => { active = false; };
  }, [token]);
  async function performAction() {
    setBusy(true); setError("");
    try { setData(await studentCardsApi.action(id, action)); setAction(""); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await studentsApi.update(id, { fullName: editing.fullName.trim(), photoUrl: editing.photoUrl, guardian: { primaryPhone: editing.phone.trim() } }); setData(await studentCardsApi.get(id)); setEditing(null); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function exportCard(print) {
    setBusy(true);setError("");
    try { await exportStudentCard({ ...data, settings, qr }, print); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const { student, card } = data || {};
  const valid = card?.effectiveStatus === "active";
  return <div className="space-y-5">
    <StudentSelector value={student || null} onChange={onSelect} />
    {!id && <p className="text-sm text-ink-500">Select a student to view, issue or edit their card.</p>}
    {loading && <p role="status">Loading card…</p>}
    {error && <p role="alert" className="text-sm text-brick-600">{error}</p>}
    {student && <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div>
        {card ? <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-xl border border-ink-200 bg-white text-center text-[#1e2a44] shadow-sm" aria-label="Student identity card">
          <div className="border-b-4 border-[#b07f22] bg-[#1e2a44] px-5 py-4 text-white"><div className="font-display text-xl">{settings.academyName}</div><div className="mt-1 text-xs tracking-widest">STUDENT IDENTITY CARD</div></div>
          <div className="p-5">
            <div className="flex flex-col items-center gap-4">
              {safePhotoUrl(student.photoUrl) ? <img src={safePhotoUrl(student.photoUrl)} alt={student.fullName} className="h-28 w-24 shrink-0 rounded-md object-cover" /> : <div className="flex h-28 w-24 shrink-0 items-center justify-center rounded-md bg-[#f4f2ec] text-sm text-[#55658a]">No photo</div>}
              <div className="min-w-0"><h2 className="font-display text-2xl">{student.fullName}</h2><p className="mt-1 text-sm">Student ID: {student.admissionNumber}</p><p className="mt-2 font-medium">{card.className} / {card.sectionName}</p><p className="text-xs text-[#55658a]">{card.sessionName}</p></div>
            </div>
            <div className="mt-5 flex flex-col items-center gap-3"><div><p className="text-xs text-[#55658a]">Guardian phone</p><p className="mt-1">{student.guardian?.primaryPhone || "—"}</p></div>{qr && <img src={qr} alt="Student attendance QR code" className="h-32 w-32" />}<p className="text-xs text-[#55658a]">Issued {cardDate(card.issuedAt)}</p></div>
          </div>
          <div className="flex flex-col items-center gap-2 border-t border-[#dbd6c8] px-5 py-3 text-xs"><span>Valid through {cardDate(new Date(new Date(card.expiresAt).getTime() - 1))}</span><strong className={valid ? "text-[#3f6b4a]" : "text-[#a34331]"}>{card.effectiveStatus.replaceAll("_", " ")} · v{card.version}</strong></div>
        </div> : <Panel title="No card issued"><p className="text-sm text-ink-600">Issue a card for this student's current class placement.</p></Panel>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" disabled={busy || !valid || !qr} onClick={() => exportCard(false)}>Download card</Button>
          <Button variant="ghost" disabled={busy || !valid || !qr} onClick={() => exportCard(true)}>Print card / PDF</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setEditing({ fullName: student.fullName, phone: student.guardian?.primaryPhone || "", photoUrl: student.photoUrl || "" })}>Edit card details</Button>
        </div>
      </div>
      <div className="space-y-5">
        <Panel title="Card management">
          <p className="mb-4 text-sm text-ink-600">Student ID stays the same. The QR stays static for this card. Transfers and replacements issue a new QR and revoke the previous card.</p>
          <div className="flex flex-wrap gap-2">
            {!card && <Button disabled={busy} onClick={() => setAction("issue")}>Issue card</Button>}
            {card?.status === "active" && <><Button disabled={busy} onClick={() => setAction("renew")}>Renew for 1 year</Button><Button variant="danger" disabled={busy} onClick={() => setAction("revoke")}>Revoke card</Button></>}
            {card && <Button variant="ghost" disabled={busy} onClick={() => setAction("replace")}>Replace card</Button>}
          </div>
          <p className="mt-4 text-xs text-ink-500">To change class or section, use Enroll / transfer in Students. A new card will be issued automatically.</p>
        </Panel>
        {data.history.length > 0 && <Panel title="Card history"><ul className="space-y-3 text-sm">{data.history.map(item => <li key={item._id} className="border-b border-ink-100 pb-2"><p>Version {item.version} · {item.className} / {item.sectionName}</p><p className="text-xs text-ink-500">{item.status === "revoked" ? `Revoked · ${item.revokeReason.replaceAll("_", " ")}` : new Date(item.expiresAt) <= new Date() ? "Expired" : "Current card"} · Issued {cardDate(item.issuedAt)}</p></li>)}</ul></Panel>}
      </div>
    </div>}
    {editing && <Modal open onClose={() => { if (!busy) setEditing(null); }} title="Edit card details" width="max-w-lg"><form onSubmit={save}>
      <p className="mb-4 text-sm text-ink-600">Changes also update the student profile and guardian contact. Student ID and QR stay unchanged.</p>
      <Field label="Student name" required><TextInput required maxLength={120} value={editing.fullName} onChange={event => setEditing({ ...editing, fullName: event.target.value })} /></Field>
      <Field label="Guardian phone" required><TextInput required type="tel" maxLength={30} value={editing.phone} onChange={event => setEditing({ ...editing, phone: event.target.value })} /></Field>
      <StudentPhotoInput value={editing.photoUrl} onChange={photoUrl => setEditing({ ...editing, photoUrl })} />
      {error && <p role="alert" className="mb-3 text-sm text-brick-600">{error}</p>}
      <Button disabled={busy}>{busy ? "Saving…" : "Save card details"}</Button>
    </form></Modal>}
    {action && <Modal open onClose={() => { if (!busy) setAction(""); }} title={`${action[0].toUpperCase() + action.slice(1)} student card`}>
      <p className="mb-5 text-sm text-ink-600">{{ issue: "Issue a card valid for one year for the current class?", renew: "Extend this card's validity by one year? The QR stays the same.", replace: "Invalidate the current card and issue a replacement with a new QR, valid for one year?", revoke: "Invalidate this card immediately? It will no longer mark attendance." }[action]}</p>
      {error && <p role="alert" className="mb-3 text-sm text-brick-600">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setAction("")}>Cancel</Button><Button disabled={busy} onClick={performAction}>{busy ? "Working…" : "Confirm"}</Button></div>
    </Modal>}
  </div>;
}
