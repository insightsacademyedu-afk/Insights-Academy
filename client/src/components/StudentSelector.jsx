import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { studentsApi } from "../api/students";

export default function StudentSelector({ value, onChange }) {
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState({ query: "", items: [], error: "" });
  const [open, setOpen] = useState(false);
  const results = lookup.query === query ? lookup.items : [];

  useEffect(() => {
    if (!query.trim() || value?._id) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      studentsApi
        .list({ search: query, limit: 8 })
        .then((res) => { if (!cancelled) setLookup({ query, items: res.items, error: "" }); })
        .catch(() => { if (!cancelled) setLookup({ query, items: [], error: "Could not load students. Please try again." }); });
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query, value?._id]);

  if (value) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-800">
        <span className="font-medium text-ink-900">{value.fullName}</span>
        <span className="text-ink-400">({value.admissionNumber})</span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
          className="ml-1 text-ink-400 hover:text-ink-900"
          aria-label="Clear student filter"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full sm:w-64" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <input
        aria-label="Search students"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Filter by student…"
        className="w-full rounded-md border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-950 outline-none focus:border-ink-700 focus:ring-2 focus:ring-ink-700/10"
      />
      {open && lookup.query === query && lookup.error && <p role="alert" className="mt-2 text-xs text-brick-600">{lookup.error}</p>}
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-ink-200 bg-surface shadow-lg shadow-ink-950/10">
          {results.map((s) => (
            <button
              key={s._id}
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                onChange(s);
                setQuery("");
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-100"
            >
              <div className="font-medium text-ink-900">{s.fullName}</div>
              <div className="text-xs text-ink-500">{s.admissionNumber}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
