// Composants UI réutilisables — thème cockpit clair et dense.

export function Card({ className = "", children, ...props }) {
  return (
    <div
      className={`rounded-lg border border-slate-200/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Button({ variant = "primary", className = "", ...props }) {
  const variants = {
    primary:
      "bg-[#15615f] text-white shadow-lg shadow-teal-900/15 hover:bg-[#0f4f4d] disabled:opacity-50 disabled:cursor-not-allowed",
    ghost:
      "border border-slate-300 bg-white/75 text-slate-700 hover:border-[#15615f]/40 hover:bg-white",
    success: "bg-[#d89b2b] text-white shadow-lg shadow-amber-900/15 hover:bg-[#c8891f] disabled:opacity-50",
    danger: "bg-[#b84040] text-white shadow-lg shadow-rose-900/15 hover:bg-[#963535]",
  };
  return (
    <button
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition duration-150 hover:-translate-y-0.5 active:translate-y-0 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#15615f] focus:ring-2 focus:ring-[#15615f]/15";

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
    <div className="flex items-center gap-3 rounded-lg border border-[#356c9f]/25 bg-[#356c9f]/10 px-4 py-3 text-sm text-[#244d73]">
      <Spinner />
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-xs text-[#356c9f]">
          Modèle local — cela peut prendre jusqu'à ~1–2 min.
        </div>
      </div>
    </div>
  );
}

export function ErrorMsg({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {children}
    </div>
  );
}

export function Badge({ children, color = "slate" }) {
  const colors = {
    slate: "bg-slate-100 text-slate-600 border-slate-200",
    green: "bg-[#15615f]/10 text-[#15615f] border-[#15615f]/20",
    amber: "bg-[#d89b2b]/15 text-[#8b5d12] border-[#d89b2b]/25",
    sky: "bg-[#356c9f]/15 text-[#285179] border-[#356c9f]/25",
    violet: "bg-[#7657a8]/15 text-[#5a4380] border-[#7657a8]/25",
    teal: "bg-[#1d8a83]/15 text-[#14625d] border-[#1d8a83]/25",
    coral: "bg-[#f26a4f]/15 text-[#a33f2f] border-[#f26a4f]/25",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold ${colors[color] || colors.slate}`}>
      {children}
    </span>
  );
}
