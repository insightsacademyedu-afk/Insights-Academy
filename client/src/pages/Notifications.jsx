import { useCallback, useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import Panel from "../components/Panel";
import Button from "../components/Button";
import Pagination from "../components/Pagination";
import { Field, TextInput, TextArea, Select } from "../components/FormFields";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { notificationsApi } from "../api/notifications";

function useNotificationFetch(fetcher, revision) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    fetcher().then(data => { if (active) setState({ fetcher, revision, data, loading: false, error: null }); })
      .catch(error => { if (active) setState({ fetcher, revision, data: null, loading: false, error }); });
    return () => { active = false; };
  }, [fetcher, revision]);
  return state?.fetcher === fetcher && state.revision === revision ? state : { data: null, loading: true, error: null };
}

export default function Notifications() {
  const { user } = useAuth();
  const admin = user.role === "admin";
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [readError, setReadError] = useState("");
  const [reading, setReading] = useState("");
  const fetchHistory = useCallback(() => notificationsApi.list(page), [page]);
  const { data, loading, error } = useNotificationFetch(fetchHistory, revision);
  async function markRead(id) {
    setReadError(""); setReading(id);
    try { await notificationsApi.markRead(id); setRevision(value => value + 1); }
    catch (err) { setReadError(err.message); }
    finally { setReading(""); }
  }
  return <AppLayout title="Notifications">
    <p className="mb-5 text-sm text-ink-600">{admin ? "Share an announcement with all active guardian or staff accounts through their portal." : "Messages from your academy. Use Refresh to check for new notifications."}</p>
    {admin && <Composer onSent={() => { setPage(1); setRevision(value => value + 1); }} />}
    <div className="mb-4 mt-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-lg">{admin ? "Sent notifications" : `Your inbox${data ? ` (${data.unreadCount} unread)` : ""}`}</h2>
      <Button variant="ghost" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</Button>
    </div>
    {(error || readError) && <p role="alert" className="mb-4 text-brick-600">{error?.message || readError}</p>}
    {loading ? <p role="status">Loading notifications...</p> : <div className="space-y-4">
      {!error && !data?.items.length && <Panel><p className="text-sm text-ink-500">{admin ? "No notifications sent yet." : "No notifications yet."}</p></Panel>}
      {data?.items.map(item => <Panel key={item._id} title={item.title}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
          <span>{admin ? `${item.recipientType === "staff" ? "Staff" : "Guardian"} · ${item.recipientCount} portal account(s)` : item.read ? "Read" : "Unread"}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-ink-800 [overflow-wrap:anywhere]">{item.message}</p>
        {!admin && !item.read && <Button className="mt-4" variant="ghost" disabled={!!reading} onClick={() => markRead(item._id)}>{reading === item._id ? "Saving..." : "Mark as read"}</Button>}
      </Panel>)}
    </div>}
    {data && <Pagination page={page} totalPages={data.totalPages} total={data.total} onChange={setPage} />}
  </AppLayout>;
}

function Composer({ onSent }) {
  const toast = useToast();
  const [recipientType, setRecipientType] = useState("guardian");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError(""); setResult(null);
    try {
      const result = await notificationsApi.send({ title, message, recipientType });
      toast.success(`Notification shared with ${result.recipientCount} ${recipientType} portal account(s).`);
      setResult(result); setTitle(""); setMessage(""); onSent();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <Panel title="Share notification"><form onSubmit={submit}>
    <fieldset disabled={saving} className="min-w-0">
      {result && <p role="status" className="mb-4 text-sm text-ink-700">Shared with {result.recipientCount} {result.recipientType === "staff" ? "staff" : "guardian"} portal account(s).</p>}
      {error && <p role="alert" className="mb-4 text-brick-600">{error}</p>}
      <Field label="Send to"><Select value={recipientType} onChange={event => setRecipientType(event.target.value)}>
        <option value="guardian">Guardian</option><option value="staff">Staff</option>
      </Select></Field>
      <Field label="Title" required><TextInput required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></Field>
      <Field label="Message" required><TextArea required rows={5} maxLength={5000} value={message} onChange={event => setMessage(event.target.value)} /></Field>
      <Button type="submit" disabled={saving || !title.trim() || !message.trim()}>{saving ? "Sharing..." : "Share notification"}</Button>
    </fieldset>
  </form></Panel>;
}
