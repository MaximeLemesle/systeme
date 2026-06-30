// Composants UI réutilisables — thème clair, simple et lisible (Tailwind).

export function Card({ className = "", children, ...props }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Button({ variant = "primary", className = "", ...props }) {
  const variants = {
    primary:
      "bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed",
    ghost:
      "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300",
    success: "bg-amber-500 hover:bg-amber-400 text-white disabled:opacity-50",
    danger: "bg-rose-600 hover:bg-rose-500 text-white",
  };
  return (
    <button
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export function Input(props) {
  return <input {...props} className={`${inputCls} ${props.className || ""}`} />;
}

export function Textarea(props) {
  return <textarea {...props} className={`${inputCls} ${props.className || ""}`} />;
}

export function Select(props) {
  return <select {...props} className={`${inputCls} ${props.className || ""}`} />;
}

export function Spinner({ className = "" }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500 ${className}`}
    />
  );
}

// Bandeau de chargement pour les appels IA (lents avec un modèle local).
export function AiLoader({ label = "L'IA réfléchit…" }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <Spinner />
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-xs text-emerald-600">
          Modèle local — cela peut prendre jusqu'à ~1–2 min.
        </div>
      </div>
    </div>
  );
}

export function ErrorMsg({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {children}
    </div>
  );
}

export function Badge({ children, color = "slate" }) {
  const colors = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    sky: "bg-sky-100 text-sky-700",
    violet: "bg-violet-100 text-violet-700",
    teal: "bg-teal-100 text-teal-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors[color] || colors.slate}`}>
      {children}
    </span>
  );
}
