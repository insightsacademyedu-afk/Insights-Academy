import { useEffect, useState } from "react";
import { classesApi } from "../api/academicSetup";
import { studentsApi } from "../api/students";
import { useAcademy } from "../context/academy";
import { exportStudentCards } from "../lib/exportStudentCards";
import Panel from "./Panel";
import Button from "./Button";
import Pagination from "./Pagination";
import { Field, Select, TextInput } from "./FormFields";

export default function StudentCardDirectory({ onSelect, revision = 0 }) {
  const { settings } = useAcademy();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");
  const [cardFilter, setCardFilter] = useState("");
  const [allMatching, setAllMatching] = useState(false);
  const [selection, setSelection] = useState(() => new Map());
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [classError, setClassError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [exportResult, setExportResult] = useState(null);
  const queryKey = JSON.stringify([classId, search, cardFilter, page, revision]);
  const loading = data?.queryKey !== queryKey;
  const selectedCount = allMatching ? Math.max(0, (data?.total ?? 0) - selection.size) : selection.size;
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
      studentsApi.list({
        page, limit: 20, search, cardFilter,
        sortBy: cardFilter === "recent" ? "createdAt" : "fullName",
        sortDir: cardFilter === "recent" ? "desc" : "asc",
        ...(classId ? { class: classId } : {}),
      })
        .then(result => {
          if (!active) return;
          if (page > result.totalPages) setPage(result.totalPages);
          else setData({ ...result, queryKey });
        })
        .catch(err => { if (active) setData({ items: [], total: 0, totalPages: 1, queryKey, error: err.message }); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [classId, search, cardFilter, page, queryKey]);
  function changeFilter(setFilter, value) {
    setFilter(value);
    setPage(1);
    setAllMatching(false);
    setSelection(new Map());
    setExportResult(null);
    setError("");
  }
  function toggleStudent(student) {
    setSelection(previous => {
      const next = new Map(previous);
      if (next.has(student._id)) next.delete(student._id);
      else next.set(student._id, student);
      return next;
    });
  }
  async function download() {
    setBusy(true); setError(""); setExportResult(null); setProgress("Preparing cards…");
    try {
      const result = await exportStudentCards({
        classId, settings,
        ...(allMatching ? { filters: { search, cardFilter }, excludedIds: new Set(selection.keys()) } : { students: [...selection.values()] }),
        onProgress: (done, total) => setProgress(`Preparing cards: ${done} of ${total}`),
      });
      setExportResult(result);
    } catch (err) { setError(`PDF could not be completed: ${err.message}`); }
    finally { setBusy(false); setProgress(""); }
  }
  return <Panel title="Find and bulk print student cards">
    <fieldset disabled={busy} className="min-w-0">
      <Field label="Filter cards by class"><Select value={classId} onChange={event => changeFilter(setClassId, event.target.value)}><option value="">All classes</option>{classes.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</Select></Field>
      <Field label="Search cards"><TextInput value={search} onChange={event => changeFilter(setSearch, event.target.value)} placeholder="Student name or admission number" /></Field>
      <Field label="Filter by card or student status">
        <Select value={cardFilter} onChange={event => changeFilter(setCardFilter, event.target.value)}>
          <option value="">All students</option>
          <option value="recent">Recently added (last 30 days)</option>
          <option value="unissued">Unissued cards</option>
          <option value="expired">Expired cards</option>
        </Select>
      </Field>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allMatching && !selection.size} ref={input => { if (input) input.indeterminate = selectedCount > 0 && (!allMatching || selection.size > 0); }}
            disabled={loading || !data?.total} onChange={event => { setAllMatching(event.target.checked); setSelection(new Map()); }} />
          Select all matching students
        </label>
        <span className="text-ink-600" aria-live="polite">{selectedCount} selected</span>
      </div>
      <div className="mb-3"><Button onClick={download} disabled={busy || loading || !selectedCount}>{busy ? "Creating PDF…" : "Download bulk PDF (A4)"}</Button></div>
    <p className="mb-3 text-xs text-ink-600">Selection spans pages. The PDF includes valid cards for the selected students and skips missing or invalid cards. Print at Actual size / 100% for 9 cards per A4 page.</p>
    {classError && <p role="alert">Could not load classes: {classError}</p>}
    {(error || (!loading && data?.error)) && <p role="alert">{error || data.error}</p>}
    {progress && <p role="status">{progress}</p>}
    {exportResult && <div role="status"><p>{exportResult.count ? `Downloaded ${exportResult.count} cards on ${Math.ceil(exportResult.count / 9)} A4 pages.` : "No valid cards found to print."} {exportResult.skipped.length} skipped.</p>{exportResult.skipped.length > 0 && <details><summary>Skipped students</summary><ul>{exportResult.skipped.map((name, index) => <li key={index}>{name}</li>)}</ul></details>}</div>}
    {loading ? <p role="status">Loading students…</p> : <>
      {data.items.length > 0 && (
        <div role="region" aria-label="Student card results" tabIndex={0} className="max-h-64 divide-y divide-ink-100 overflow-y-auto pr-2 sm:max-h-80 lg:max-h-96">
          {data.items.map(student => (
            <div key={student._id} className="flex items-center justify-between gap-2 py-1.5">
              <label className="flex min-w-0 items-center gap-2 text-sm">
                <input type="checkbox" checked={allMatching !== selection.has(student._id)} onChange={() => toggleStudent(student)} />
                <span className="min-w-0 break-words">{student.fullName} <span className="text-xs text-ink-500">({student.admissionNumber})</span></span>
              </label>
              <Button variant="ghost" className="shrink-0" onClick={() => onSelect(student)}>View card</Button>
            </div>
          ))}
        </div>
      )}
      {!data.items.length && !data.error && <p>No students match these filters.</p>}
      <Pagination page={page} total={data.total} totalPages={data.totalPages} onChange={setPage} />
    </>}
    </fieldset>
  </Panel>;
}
