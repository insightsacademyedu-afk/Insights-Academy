import { useEffect, useState } from "react";
import AttendanceScanner from "../components/AttendanceScanner";
import AppLayout from "../components/AppLayout";
import Panel from "../components/Panel";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import Pagination from "../components/Pagination";
import { Field, TextInput, Select } from "../components/FormFields";
import { teacherAttendanceApi } from "../api/attendance";
import { attendanceTime, todayInKarachi } from "../lib/attendance";

const columns = [
  { key: "teacherName", header: "Teacher" },
  { key: "designation", header: "Designation at check-in" },
  { key: "day", header: "Date (PKT)" },
  { key: "status", header: "Status", render: () => "Present" },
  { key: "checkedInAt", header: "Check-in (PKT)", render: row => attendanceTime(row.checkedInAt) },
  { key: "recordedBy", header: "Recorded by", render: row => row.recordedBy?.displayName || row.recordedBy?.username || "—" },
];

export default function TeacherAttendance() {
  const [search, setSearch] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [teacher, setTeacher] = useState("");
  const [from, setFrom] = useState(todayInKarachi);
  const [to, setTo] = useState(todayInKarachi);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [records, setRecords] = useState({ items: [], total: 0, totalPages: 1 });
  const queryKey = JSON.stringify([page, from, to, teacher, reload]);
  const loading = records.queryKey !== queryKey;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      teacherAttendanceApi.teachers({ search, limit: 100 }).then(result => { if (active) setTeachers(result.items); }).catch(err => { if (active) setError(err.message); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);
  useEffect(() => {
    let active = true;
    teacherAttendanceApi.list({ page, limit: 20, from, to, teacher }).then(result => { if (active) { setRecords({ ...result, queryKey }); setError(""); } }).catch(err => { if (active) { setError(err.message); setRecords({ items: [], total: 0, totalPages: 1, queryKey }); } });
    return () => { active = false; };
  }, [page, from, to, teacher, reload, queryKey]);
  async function mark() {
    setBusy(true); setError(""); setMessage("");
    try { const result = await teacherAttendanceApi.mark(teacher); setMessage(result.message); setReload(value => value + 1); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <AppLayout title="Teacher attendance">
    <p className="mb-5 text-sm text-ink-600">Only admin and subadmin can mark and view teacher attendance. One check-in per teacher per day, using Pakistan time.</p>
    <div className="space-y-5">
      <Panel title="Scan student or teacher card"><AttendanceScanner onSaved={() => setReload(value => value + 1)} /></Panel>
      <Panel title="Mark today's attendance">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search teachers"><TextInput value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name" /></Field>
          <Field label="Teacher"><Select value={teacher} onChange={event => { setTeacher(event.target.value); setPage(1); setMessage(""); }}><option value="">Select a teacher</option>{teachers.map(item => <option key={item._id} value={item._id}>{item.fullName}{(item.cardDesignation || item.designation?.title) ? ` — ${item.cardDesignation || item.designation.title}` : ""}</option>)}</Select></Field>
          <div className="mb-4"><Button disabled={!teacher || busy} onClick={mark}>{busy ? "Saving…" : "Mark present today"}</Button></div>
        </div>
        {message && <p role="status" className="text-sm text-moss-600">{message}</p>}
      </Panel>
      {error && <p role="alert" className="text-sm text-brick-600">{error}</p>}
      <Panel title="Teacher attendance records" action={<Button variant="ghost" disabled={loading} onClick={() => setReload(value => value + 1)}>Refresh</Button>}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From"><TextInput type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></Field>
          <Field label="To"><TextInput type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></Field>
          <div className="mb-4 flex flex-wrap gap-2"><Button variant="ghost" onClick={() => { setTeacher(""); setPage(1); }}>All teachers</Button><Button variant="ghost" onClick={() => { setFrom(""); setTo(""); setPage(1); }}>All dates</Button></div>
        </div>
        <DataTable columns={columns} rows={loading || error ? [] : records.items} loading={loading} emptyMessage="No check-ins found. Unmarked teachers are not automatically counted as absent." />
        {!loading && !error && <Pagination page={page} total={records.total} totalPages={records.totalPages} onChange={setPage} />}
      </Panel>
    </div>
  </AppLayout>;
}
