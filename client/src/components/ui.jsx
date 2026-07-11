// Composants UI réutilisables — thème aventure / quêtes.
import { useEffect, useState } from "react";

export function Card({ className = "", children, ...props }) {
  return (
    <div
      className={`game-panel rounded-lg border-2 border-[#2b211d]/15 bg-(--panel) p-5 backdrop-blur ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Button({ variant = "primary", className = "", ...props }) {
  const variants = {
    primary:
      "quest-shine border-b-4 border-[#7a2a15] bg-[#c8532f] text-white shadow-lg shadow-black/15 hover:bg-[#a83f22] disabled:border-b-2 disabled:opacity-50 disabled:cursor-not-allowed",
    ghost:
      "border-2 border-[#2b211d]/15 bg-[#faf5ee]/85 text-[#2b211d] hover:border-[#c8532f]/35 hover:bg-white",
    success:
      "quest-shine border-b-4 border-[#8a6423] bg-[#d9a441] text-[#2b1c0a] shadow-lg shadow-amber-900/15 hover:bg-[#c39030] disabled:border-b-2 disabled:opacity-50",
    danger:
      "border-b-4 border-[#5c2015] bg-[#b0392a] text-white shadow-lg shadow-rose-900/15 hover:bg-[#963224]",
  };
  return (
    <button
      className={`rounded-lg px-4 py-2.5 text-sm font-black uppercase tracking-wide transition duration-150 hover:-translate-y-0.5 active:translate-y-0.5 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#8a6f5f]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[#8a6f5f]">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border-2 border-[#2b211d]/15 bg-[#faf5ee]/95 px-3 py-2.5 text-[#2b211d] outline-none transition placeholder:text-[#a89787] focus:border-[#c8532f] focus:bg-white focus:ring-2 focus:ring-[#c8532f]/15";

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
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#e8d9c8] border-t-[#c8532f] ${className}`}
    />
  );
}

// Messages qui tournent pendant la génération IA — l'attente paraît plus courte.
const AI_TIPS = [
  "Analyse de la distance et de l'échéance…",
  "Vérification de la fréquence disponible…",
  "Structuration de l'objectif SMART…",
  "Préparation de la prochaine question…",
];

// Bandeau de chargement pour les appels IA (modèle local : ~15-30 s).
export function AiLoader({ label = "L'IA réfléchit…" }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const tip = AI_TIPS[Math.floor(seconds / 4) % AI_TIPS.length];

  return (
    <div className="game-panel flex items-center gap-3 rounded-lg border-2 border-[#3477a8]/25 bg-[#e9f3fb]/85 px-4 py-3 text-sm text-[#244d73]">
      <Spinner />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-black">{label}</span>
          <span className="shrink-0 rounded-md bg-[#3477a8]/15 px-2 py-0.5 text-xs font-black tabular-nums text-[#285179]">
            {seconds}s
          </span>
        </div>
        <div className="text-xs text-[#356c9f]">{tip}</div>
      </div>
    </div>
  );
}

export function ErrorMsg({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-lg border-2 border-[#b0392a]/25 bg-[#fbe6de] px-3 py-2 text-sm font-semibold text-[#7a2a1c]">
      {children}
    </div>
  );
}

export function Badge({ children, color = "slate" }) {
  const colors = {
    slate: "bg-[#f3e6d8] text-[#6b5644] border-[#e8d9c8]",
    green: "bg-[#3f8f5a]/15 text-[#1f6f45] border-[#3f8f5a]/25",
    amber: "bg-[#d9a441]/18 text-[#6b4a1a] border-[#d9a441]/35",
    sky: "bg-[#3477a8]/15 text-[#285179] border-[#3477a8]/25",
    violet: "bg-[#7150a4]/15 text-[#563d7d] border-[#7150a4]/25",
    teal: "bg-[#3f8f5a]/15 text-[#1f6f45] border-[#3f8f5a]/25",
    coral: "bg-[#b0392a]/15 text-[#7a2a1c] border-[#b0392a]/25",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-black ${colors[color] || colors.slate}`}>
      {children}
    </span>
  );
}
