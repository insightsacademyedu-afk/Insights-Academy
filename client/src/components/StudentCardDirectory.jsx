import { useEffect, useState } from "react";
import { classesApi } from "../api/academicSetup";
import { studentsApi } from "../api/students";
import { useAcademy } from "../context/academy";
import { exportStudentCards } from "../lib/exportStudentCards";
import Panel from "./Panel";
import Button from "./Button";
import Pagination from "./Pagination";
import { Field, Select, TextInput } from "./FormFields";

export default function StudentCardDirectory({ onSelect }) {
  const { settings } = useAcademy();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [classError, setClassError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [exportResult, setExportResult] = useState(null);
  const queryKey = JSON.stringify([classId, search, page]);
  const loading = data?.queryKey !== queryKey;
  useEffect(() => {
    let active = true;
    async function load() {
      const items = [];
      let page = 1, totalPages = 1;
      do {
        const result = await classesApi.list({ page, limit: 100, status: "active" });
        items.push(...result.items); totalPages = result.totalPages; page++;
      } while (active && page <= totalPages);
      if (active) setClasses(items);
    }
    load().catch(err => { if (active) setClassError(err.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      studentsApi.list({ page, limit: 20, search, sortBy: "fullName", sortDir: "asc", ...(classId ? { class: classId } : {}) })
        .then(result => { if (active) setData({ ...result, queryKey }); })
        .catch(err => { if (active) setData({ items: [], total: 0, totalPages: 1, queryKey, error: err.message }); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [classId, search, page, queryKey]);
  async function download() {
    setBusy(true); setError(""); setExportResult(null); setProgress("Preparing cards…");
    try {
      const result = await exportStudentCards({ classId, settings, onProgress: (done, total) => setProgress(`Preparing cards: ${done} of ${total}`) });
      setExportResult(result);
    } catch (err) { setError(`PDF could not be completed: ${err.message}`); }
    finally { setBusy(false); setProgress(""); }
  }
  return <div className="mb-6"><Panel title="Find and bulk print student cards">
    <fieldset disabled={busy} className="flex flex-wrap items-end gap-3">
      <Field label="Filter cards by class"><Select value={classId} onChange={event => { setClassId(event.target.value); setPage(1); setExportResult(null); }}><option value="">All classes</option>{classes.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</Select></Field>
      <Field label="Search cards"><TextInput value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Student name or admission number" /></Field>
      <div className="mb-4"><Button onClick={download} disabled={busy}>{busy ? "Creating PDF…" : "Download bulk PDF (A4)"}</Button></div>
    </fieldset>
    <p className="mb-4 text-sm text-ink-600">The PDF includes all valid cards in {classId ? "the selected class" : "all classes"}, across every page, regardless of the name search. A4: 9 cards per page, 54 × 85.6 mm, with cutting borders. Print at Actual size / 100%. Missing and invalid cards are skipped.</p>
    {classError && <p role="alert">Could not load classes: {classError}</p>}
    {(error || (!loading && data?.error)) && <p role="alert">{error || data.error}</p>}
    {progress && <p role="status">{progress}</p>}
    {exportResult && <div role="status"><p>{exportResult.count ? `Downloaded ${exportResult.count} cards on ${Math.ceil(exportResult.count / 9)} A4 pages.` : "No valid cards found to print."} {exportResult.skipped.length} skipped.</p>{exportResult.skipped.length > 0 && <details><summary>Skipped students</summary><ul>{exportResult.skipped.map((name, index) => <li key={index}>{name}</li>)}</ul></details>}</div>}
    {loading ? <p role="status">Loading students…</p> : <>
      <div className="divide-y divide-ink-100">{data.items.map(student => <div key={student._id} className="flex items-center justify-between gap-3 py-2"><span>{student.fullName} <span className="text-sm text-ink-500">({student.admissionNumber})</span></span><Button variant="ghost" onClick={() => onSelect(student)}>View card</Button></div>)}</div>
      {!data.items.length && !data.error && <p>No students match these filters.</p>}
      <Pagination page={page} total={data.total} totalPages={data.totalPages} onChange={setPage} />
    </>}
  </Panel></div>;
}
