export default function Panel({ title, action, children, className = "" }) {
  return (
    <div className={`min-w-0 rounded-lg border border-ink-200 bg-paper-50 ${className}`}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <h3 className="font-display text-base text-ink-900">{title}</h3>
          {action}
        </div>
      )}
      <div className="min-w-0 p-4 sm:p-5">{children}</div>
    </div>
  );
}
