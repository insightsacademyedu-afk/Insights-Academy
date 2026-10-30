import { cardDate, safePhotoUrl } from "../lib/attendance";
import StudentCardFace from "./StudentCardFace";

// Shared print-like theme for both types of academy card.
export default function IdentityCard({ person, card, settings, qr, employee = false, employeeId }) {
  if (!employee) return <StudentCardFace person={person} card={card} settings={settings} qr={qr} />;
  const photo = safePhotoUrl(person.photoUrl);
  return <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-xl border border-[#dbd6c8] bg-white text-center text-[#1e2a44] shadow-sm" aria-label={employee ? "Teacher employee identity card" : "Student identity card"}>
    <div className="border-b-4 border-[#b07f22] bg-[#1e2a44] px-5 py-4 text-white"><div className="font-display text-xl">{settings.academyName}</div><div className="mt-1 text-xs tracking-widest">{employee ? "EMPLOYEE" : "STUDENT"} IDENTITY CARD</div></div>
    <div className="p-5">
      <div className="flex flex-col items-center gap-4">
        {photo ? <img src={photo} alt={person.fullName} className="h-28 w-24 shrink-0 rounded-md object-cover" /> : <div className="flex h-28 w-24 shrink-0 items-center justify-center rounded-md bg-[#f4f2ec] text-sm text-[#55658a]">No photo</div>}
        <div className="min-w-0 w-full break-words"><h2 className="font-display text-2xl">{person.fullName}</h2>
          {employee ? <><p className="mt-2 font-medium">{person.cardDesignation || person.designation?.title || "Teacher"}</p><p className="mt-2 break-all text-xs text-[#55658a]">Employee ID: {employeeId}</p></> : <><p className="mt-1 text-sm">Student ID: {person.admissionNumber}</p><p className="mt-2 font-medium">{card.className} / {card.sectionName}</p><p className="text-xs text-[#55658a]">{card.sessionName}</p></>}
        </div>
      </div>
      <div className="mt-5 flex flex-col items-center gap-3">
        {!employee && <div><p className="text-xs text-[#55658a]">Guardian phone</p><p className="mt-1">{person.guardian?.primaryPhone || "—"}</p></div>}
        {qr && <img src={qr} alt={employee ? "Teacher attendance QR code" : "Student attendance QR code"} className="h-32 w-32" />}
        <p className="text-xs text-[#55658a]">Issued {cardDate(card.issuedAt)}</p>
      </div>
    </div>
    <div className="flex flex-col items-center gap-2 border-t border-[#dbd6c8] px-5 py-3 text-xs"><span>Valid through {cardDate(new Date(new Date(card.expiresAt).getTime() - 1))}</span><strong className={card.effectiveStatus === "active" ? "text-[#3f6b4a]" : "text-[#a34331]"}>{card.effectiveStatus.replaceAll("_", " ")} · v{card.version}</strong></div>
  </div>;
}
