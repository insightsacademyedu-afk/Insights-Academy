import { useEffect, useState } from "react";
import { attendanceApi } from "../api/attendance";
import { sectionsApi } from "../api/academicSetup";
import { attendanceTime } from "../lib/attendance";
import Button from "./Button";
import DataTable from "./DataTable";
import Pagination from "./Pagination";
import { Field, Select } from "./FormFields";

export default function ManualStudentAttendance({ classes, initialClass = "", onSaved }) {
  const [klass, setKlass] = useState(initialClass);
  const [section, setSection] = useState("");
  const [sections, setSections] = useState({ key: "", items: [] });
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [roster, setRoster] = useState({ items: [], total: 0, totalPages: 1 });
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const key = JSON.stringify([klass, section, page, reload]);
  const loading = Boolean(klass) && roster.key !== key;
  const rows = klass && !loading ? roster.items : [];
  const available = rows.filter(row => !row.attendance).map(row => row._id);
  const sectionItems = sections.key === klass ? sections.items : [];

  useEffect(() => {
    if (!klass) return;
    let active = true;
    sectionsApi.list({ class: klass, status: "active", limit: 100 }).then(result => { if (active) setSections({ key: klass, items: result.items }); })
      .catch(err => { if (active) setSections({ key: klass, items: [], error: err.message }); });
    return () => { active = false; };
  }, [klass]);
  useEffect(() => {
    if (!klass) return;
    let active = true;
    attendanceApi.roster({ class: klass, ...(section ? { section } : {}), page, limit: 25 }).then(result => { if (active) setRoster({ ...result, key }); })
      .catch(err => { if (active) setRoster({ key, items: [], total: 0, totalPages: 1, error: err.message }); });
    return () => { active = false; };
  }, [klass, section, page, reload, key]);

  function clearSelection() { setSelected([]); setError(""); setMessage(""); }
  function changePage(value) { setPage(value); clearSelection(); }
  async function save() {
    if (busy || loading || !selected.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await attendanceApi.mark({ class: klass, ...(section ? { section } : {}), students: selected, day: roster.day });
      setMessage(result.message); setSelected([]); setReload(value => value + 1); onSaved?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const columns = [
    { key: "select", header: "Select", render: row => <label className="inline-flex p-2"><input type="checkbox" aria-label={`Select ${row.student.fullName}`} checked={selected.includes(row._id)} disabled={busy || Boolean(row.attendance)} onChange={event => setSelected(ids => event.target.checked ? [...ids, row._id] : ids.filter(id => id !== row._id))} /></label> },
    { key: "student", header: "Student", render: row => <><p>{row.student.fullName}</p><p className="text-xs text-ink-500">{row.student.admissionNumber}</p></> },
    { key: "sectionName", header: "Section" },
    { key: "attendance", header: "Today's status", render: row => row.attendance ? <span className="text-moss-600">Present · {attendanceTime(row.attendance.checkedInAt)} PKT</span> : <span className="text-ink-500">Not marked</span> },
  ];
  return <div className="space-y-4">
    <p className="text-sm text-ink-600">Choose a class, select students who are present, and save today's attendance. A QR card is not required. Students without a check-in remain in the Absent filter.</p>
    <div className="flex flex-wrap gap-3">
      <Field label="Class for manual attendance"><Select value={klass} disabled={busy} onChange={event => { setKlass(event.target.value); setSection(""); setPage(1); clearSelection(); }}><option value="">Select a class</option>{classes.map(item => <option key={item._id} value={item._id}>{item.name}{item.academicSession?.name ? ` · ${item.academicSession.name}` : ""}</option>)}</Select></Field>
      <Field label="Section for manual attendance"><Select value={section} disabled={!klass || busy || sections.key !== klass} onChange={event => { setSection(event.target.value); setPage(1); clearSelection(); }}><option value="">All sections</option>{sectionItems.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</Select></Field>
    </div>
    {sections.key === klass && sections.error && <p role="alert" className="text-sm text-brick-600">{sections.error}</p>}
    {klass && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-ink-600">{!loading && roster.day ? `Today: ${roster.day} · Asia/Karachi` : "Loading class roster…"}</span><Button variant="ghost" disabled={busy || loading} onClick={() => { clearSelection(); setReload(value => value + 1); }}>Refresh roster</Button></div>
      {!loading && roster.error && <p role="alert" className="text-sm text-brick-600">{roster.error}</p>}
      <label className="inline-flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" checked={available.length > 0 && available.every(id => selected.includes(id))} disabled={busy || loading || !available.length} onChange={event => setSelected(event.target.checked ? available : [])} />Select unmarked students on this page</label>
      <DataTable columns={columns} rows={rows} loading={loading} emptyMessage="No active students enrolled in this class and section." />
      {!loading && <Pagination page={page} total={roster.total} totalPages={roster.totalPages} onChange={value => { if (!busy) changePage(value); }} />}
      {error && <p role="alert" className="text-sm text-brick-600">{error}</p>}
      {message && <p role="status" className="text-sm text-moss-600">{message}</p>}
      <Button disabled={busy || loading || !selected.length || !roster.day} onClick={save}>{busy ? "Saving attendance…" : `Mark selected present (${selected.length})`}</Button>
    </>}
  </div>;
}
