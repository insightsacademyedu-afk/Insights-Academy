export default function Button({ variant = "primary", className = "", children, ...props }) {
  const variants = {
    primary: "bg-brass-500 text-white hover:bg-primary-hover disabled:opacity-60",
    ghost: "border border-ink-200 text-ink-700 hover:border-ink-300 bg-surface disabled:opacity-60",
    danger: "bg-danger-600 text-white hover:bg-danger-600/90 disabled:opacity-60",
  };

  return (
    <button
      className={`inline-flex min-h-10 max-w-full items-center justify-center gap-1.5 text-center [overflow-wrap:anywhere] [&>svg]:shrink-0 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
