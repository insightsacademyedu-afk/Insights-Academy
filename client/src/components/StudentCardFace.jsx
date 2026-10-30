import { cardDate, safePhotoUrl } from "../lib/attendance";

export default function StudentCardFace({ person, card, settings, qr }) {
  const photo = safePhotoUrl(person.photoUrl);
  const academyName = settings.academyName || "Insights Academy";
  const insights = /^insights\s+academy$/i.test(academyName.trim());
  return <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border border-[#e2e7e9] bg-white px-5 pb-4 pt-5 text-center font-sans text-[#0c4956] shadow-sm" aria-label="Student identity card">
    <header className="border-b-2 border-[#e8794d] pb-4">
      <img src="/branding/insights-mark.svg" alt={`${academyName} logo`} className="mx-auto h-20 w-auto" />
      {insights ? <div className="mt-2"><p className="text-2xl font-bold tracking-wide">INSIGHTS</p><p className="mt-0.5 text-sm tracking-[0.15em] text-[#e8794d]">ACADEMY</p></div> : <p className="mt-2 break-words text-xl font-semibold">{academyName}</p>}
    </header>
    <p className="mb-4 mt-4 text-[11px] font-semibold tracking-[0.14em]">STUDENT IDENTITY CARD</p>
    {photo ? <img src={photo} alt={person.fullName} className="mx-auto h-28 w-24 rounded-md border border-[#d8dfe2] object-cover" /> : <div className="mx-auto flex h-28 w-24 items-center justify-center rounded-md border border-[#d8dfe2] bg-[#f0f2f3] text-xs text-[#697d83]">No photo</div>}
    <div className="mt-3 min-w-0 break-words">
      <h2 className="text-2xl font-bold leading-tight">{person.fullName}</h2>
      <p className="mt-1 text-sm">Student ID: {person.admissionNumber}</p>
      <p className="mt-1 font-medium">{card.className} / {card.sectionName}</p>
      <p className="mt-0.5 text-xs">Academic session: {card.sessionName}</p>
    </div>
    <div className="mt-3"><p className="text-xs text-[#697d83]">Guardian phone</p><p className="mt-0.5 text-sm font-medium">{person.guardian?.primaryPhone || "—"}</p></div>
    {qr && <img src={qr} alt="Student attendance QR code" className="mx-auto mt-1 h-28 w-28" />}
    <div className="mt-1 space-y-0.5 text-[11px]"><p>Issued {cardDate(card.issuedAt)}</p><p>Valid through {cardDate(new Date(new Date(card.expiresAt).getTime() - 1))}</p></div>
    <footer className="mt-3 flex items-center gap-2 text-[10px] text-[#697d83]"><span className="h-px flex-1 bg-[#0c4956]" /><span className={card.effectiveStatus === "active" ? "" : "text-[#a34331]"}>{card.effectiveStatus.replaceAll("_", " ")} · v{card.version}</span><span className="h-px flex-1 bg-[#0c4956]" /></footer>
  </div>;
}
