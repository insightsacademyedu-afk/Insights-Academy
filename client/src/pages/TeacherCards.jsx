import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import AppLayout from "../components/AppLayout";
import IdentityCard from "../components/IdentityCard";
import StudentPhotoInput from "../components/StudentPhotoInput";
import Panel from "../components/Panel";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { Field, TextInput, Select } from "../components/FormFields";
import { teacherCardsApi, teacherAttendanceApi } from "../api/attendance";
import { useAcademy } from "../context/academy";
import { cardDate } from "../lib/attendance";
import { exportStudentCard } from "../lib/exportStudentCard";

export default function TeacherCards() {
  const [params, setParams] = useSearchParams();
  const id = params.get("teacher") || "";
  const [search, setSearch] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => teacherAttendanceApi.teachers({ search, limit: 100 }).then(result => { if (active) { setTeachers(result.items); setError(""); } }).catch(err => { if (active) setError(err.message); }), 200);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);
  return <AppLayout title="Teacher employee cards">
    <p className="mb-5 text-sm text-ink-600">Employee cards are valid for one year. Edit the name, designation and photo without changing the employee ID or QR.</p>
    <div className="flex flex-wrap gap-3">
      <Field label="Search teachers"><TextInput value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name" /></Field>
      <Field label="Teacher"><Select value={id} onChange={event => setParams(event.target.value ? { teacher: event.target.value } : {})}><option value="">Select a teacher</option>{id && !teachers.some(item => item._id === id) && <option value={id}>Selected teacher</option>}{teachers.map(item => <option key={item._id} value={item._id}>{item.fullName}</option>)}</Select></Field>
    </div>
    {error && <p role="alert" className="mb-4 text-sm text-brick-600">{error}</p>}
    {id ? <Workspace key={id} id={id} /> : <p className="text-sm text-ink-500">Select a teacher to issue or edit their employee card.</p>}
  </AppLayout>;
}

function Workspace({ id }) {
  const { settings } = useAcademy();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [qrImage, setQrImage] = useState(null);
  const [editing, setEditing] = useState(null);
  const [action, setAction] = useState("");
  useEffect(() => {
    let active = true;
    teacherCardsApi.get(id).then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id]);
  const token = data?.card?.token;
  const qr = qrImage?.token === token ? qrImage?.url : "";
  useEffect(() => {
    let active = true;
    if (token) QRCode.toDataURL(token, { width: 400, margin: 4, errorCorrectionLevel: "M" }).then(url => { if (active) setQrImage({ token, url }); }).catch(() => { if (active) setError("Could not generate QR. Refresh and retry."); });
    return () => { active = false; };
  }, [token]);
  async function performAction() {
    setBusy(true); setError("");
    try { setData(await teacherCardsApi.action(id, action)); setAction(""); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { setData(await teacherCardsApi.update(id, editing)); setEditing(null); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function exportCard(print) {
    setBusy(true); setError("");
    try { await exportStudentCard({ ...data, settings, qr }, print); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const { teacher, card, employeeId, history } = data || {};
  const valid = card?.effectiveStatus === "active";
  return <div className="space-y-5">
    {error && <p role="alert" className="text-sm text-brick-600">{error}</p>}
    {!data && !error && <p role="status">Loading card…</p>}
    {teacher && <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div>
        {card ? <IdentityCard employee person={teacher} employeeId={employeeId} card={card} settings={settings} qr={qr} /> : <Panel title="No card issued"><p className="text-sm text-ink-600">Issue an employee card for this teacher.</p></Panel>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" disabled={busy || !valid || !qr} onClick={() => exportCard(false)}>Download card</Button>
          <Button variant="ghost" disabled={busy || !valid || !qr} onClick={() => exportCard(true)}>Print card / PDF</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setEditing({ fullName: teacher.fullName, cardDesignation: teacher.cardDesignation || teacher.designation?.title || "Teacher", photoUrl: teacher.photoUrl || "" })}>Edit card details</Button>
        </div>
      </div>
      <div className="space-y-5">
        <Panel title="Card management">
          <p className="mb-4 text-sm text-ink-600">Only admin and subadmin can manage cards and mark teacher attendance. Replacing a card invalidates its old QR.</p>
          <div className="flex flex-wrap gap-2">
            {!card && <Button disabled={busy || teacher.status !== "active"} onClick={() => setAction("issue")}>Issue card</Button>}
            {card?.status === "active" && <><Button disabled={busy || teacher.status !== "active"} onClick={() => setAction("renew")}>Renew for 1 year</Button><Button variant="danger" disabled={busy} onClick={() => setAction("revoke")}>Revoke card</Button></>}
            {card && <Button variant="ghost" disabled={busy || teacher.status !== "active"} onClick={() => setAction("replace")}>Replace card</Button>}
          </div>
        </Panel>
        {history?.length > 0 && <Panel title="Card history"><ul className="space-y-3 text-sm">{history.map(item => <li key={item._id} className="border-b border-ink-100 pb-2">Version {item.version} · {item.status} · Issued {cardDate(item.issuedAt)}</li>)}</ul></Panel>}
      </div>
    </div>}
    {editing && <Modal open onClose={() => { if (!busy) setEditing(null); }} title="Edit employee card details" width="max-w-lg"><form onSubmit={save}>
      <p className="mb-4 text-sm text-ink-600">Name and photo update the teacher profile. Designation here is the editable card label.</p>
      <Field label="Teacher name" required><TextInput required maxLength={120} value={editing.fullName} onChange={event => setEditing({ ...editing, fullName: event.target.value })} /></Field>
      <Field label="Designation" required><TextInput required maxLength={120} value={editing.cardDesignation} onChange={event => setEditing({ ...editing, cardDesignation: event.target.value })} /></Field>
      <StudentPhotoInput value={editing.photoUrl} onChange={photoUrl => setEditing({ ...editing, photoUrl })} />
      {error && <p role="alert" className="mb-3 text-sm text-brick-600">{error}</p>}
      <Button disabled={busy}>{busy ? "Saving…" : "Save card details"}</Button>
    </form></Modal>}
    {action && <Modal open onClose={() => { if (!busy) setAction(""); }} title={`${action[0].toUpperCase() + action.slice(1)} employee card`}>
      <p className="mb-5 text-sm text-ink-600">{{ issue: "Issue an employee card valid for one year?", renew: "Extend validity by one year? The QR stays the same.", replace: "Invalidate the current QR and issue a replacement card valid for one year?", revoke: "Invalidate this employee card immediately?" }[action]}</p>
      {error && <p role="alert" className="mb-3 text-sm text-brick-600">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setAction("")}>Cancel</Button><Button disabled={busy} onClick={performAction}>{busy ? "Working…" : "Confirm"}</Button></div>
    </Modal>}
  </div>;
}
