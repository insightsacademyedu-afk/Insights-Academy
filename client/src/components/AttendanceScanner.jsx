import { useEffect, useRef, useState } from "react";
import Button from "./Button";
import { Field, TextInput } from "./FormFields";
import { attendanceApi } from "../api/attendance";
import { attendanceTime, safePhotoUrl } from "../lib/attendance";

export default function AttendanceScanner({ onSaved }) {
  const video = useRef(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const inFlight = useRef(false);
  const last = useRef({ token: "", at: 0 });
  const mounted = useRef(true);
  const savedCallback = useRef(onSaved);
  useEffect(() => { savedCallback.current = onSaved; }, [onSaved]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function submitToken(value, fromCamera = false) {
    value = value.trim();
    if (!value || inFlight.current) return;
    if (fromCamera && last.current.token === value && Date.now() - last.current.at < 4000) return;
    last.current = { token: value, at: Date.now() };
    inFlight.current = true; setBusy(true); setError(""); setResult(null);
    try {
      const saved = await attendanceApi.scan(value);
      if (!mounted.current) return;
      setResult(saved); setToken(""); savedCallback.current?.();
    } catch (err) { if (mounted.current) setError(err.message || "Attendance could not be saved. Check your connection and retry."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  useEffect(() => {
    if (!running) return;
    let cancelled = false, controls;
    const element = video.current;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires HTTPS or localhost and a supported browser. You can also use a USB QR scanner below.");
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, element,
          decoded => { if (decoded && !cancelled) void submitToken(decoded.getText(), true); });
        if (cancelled) controls.stop();
      } catch (err) {
        if (!cancelled) { setError(err.name === "NotAllowedError" ? "Camera permission denied. Allow camera access or use a USB QR scanner below." : err.message || "Could not start the camera."); setRunning(false); }
      }
    }
    void start();
    return () => { cancelled = true; controls?.stop(); const stream = element?.srcObject; stream?.getTracks?.().forEach(track => track.stop()); };
  }, [running]);

  return <div className="space-y-4">
    <p className="text-sm text-ink-600">Scan the current card to mark Present once today. Attendance is confirmed only after the server saves it.</p>
    <video ref={video} muted playsInline autoPlay aria-label="QR scanner camera" className={running ? "aspect-video w-full max-w-xl rounded-lg bg-black object-cover" : "hidden"} />
    <Button type="button" variant={running ? "ghost" : "primary"} onClick={() => { setError(""); setRunning(value => !value); }}>{running ? "Stop camera" : "Start camera"}</Button>
    <form onSubmit={event => { event.preventDefault(); void submitToken(token); }} className="max-w-xl">
      <Field label="USB scanner or QR token"><TextInput value={token} onChange={event => setToken(event.target.value)} maxLength={200} autoComplete="off" placeholder="Scan into this field or paste the card QR token" /></Field>
      <Button disabled={busy || !token.trim()}>{busy ? "Saving attendance…" : "Mark attendance"}</Button>
    </form>
    {busy && <p role="status" className="text-sm text-ink-500">Checking card and saving attendance…</p>}
    {error && <p role="alert" className="rounded-md border border-brick-600/30 bg-brick-100 p-3 text-sm text-brick-600">{error}</p>}
    {result && <div role="status" className="flex flex-wrap items-center gap-4 rounded-lg border border-moss-600/30 bg-moss-100 p-4 text-moss-600">
      {safePhotoUrl(result.student.photoUrl) && <img src={safePhotoUrl(result.student.photoUrl)} alt={result.student.fullName} className="h-20 w-16 rounded object-cover" />}
      <div><p className="font-medium">{result.message}</p><p>{result.student.fullName} · {result.student.admissionNumber}</p><p className="text-sm">{result.record.className} / {result.record.sectionName} · {attendanceTime(result.record.checkedInAt)} PKT</p></div>
    </div>}
  </div>;
}
