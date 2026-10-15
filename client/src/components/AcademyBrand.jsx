export default function AcademyBrand({ dark = false, compact = false, className = "" }) {
  return <div className={`academy-brand ${compact ? "academy-brand--compact" : ""} ${dark ? "academy-brand--dark" : ""} ${className}`} role="img" aria-label="Insights Academy">
    <svg className="academy-brand__mark" viewBox="0 0 540 560" aria-hidden="true">
      <path fill="currentColor" d="M270 0 422 315 359 360 270 174 181 360 118 315Z" />
      <circle fill="#e8794d" cx="270" cy="371" r="42" />
      <path fill="#e8794d" d="M105 342 65 425C148 446 216 489 264 546 243 459 188 399 105 342ZM435 342 475 425C392 446 324 489 276 546 297 459 352 399 435 342Z" />
      <path fill="currentColor" d="M50 458 2 558H250C191 514 126 478 50 458ZM490 458 538 558H290C349 514 414 478 490 458Z" />
    </svg>
    <span className="academy-brand__wordmark"><span className="academy-brand__name">INSIGHTS</span><span className="academy-brand__academy">ACADEMY</span></span>
  </div>;
}
