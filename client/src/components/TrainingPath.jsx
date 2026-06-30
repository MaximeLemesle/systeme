// Parcours visuel : des étapes reliées par un chemin, du départ à l'objectif.
// - étape faite  → pastille colorée avec ✓
// - étape courante → pastille blanche entourée, halo pulsé
// - étape verrouillée → pastille grise
// - dernière étape (objectif) → trophée 🏆
import { categoryMeta } from "../lib/categories";

export default function TrainingPath({ seances: steps, selectedId, onSelect }) {
  const doneCount = steps.filter((s) => s.status === "fait").length;
  const currentIndex = steps.findIndex((s) => s.status !== "fait");
  const total = steps.length;

  return (
    <div>
      {/* Progression globale */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-black text-slate-700">Plan d'action</span>
          <span className="font-semibold text-slate-400">
            {doneCount} / {total} étapes
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#15615f] via-[#356c9f] to-[#d89b2b] transition-all duration-500"
            style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Le chemin */}
      <div className="relative mx-auto max-w-sm rounded-lg bg-slate-50/70 px-4 py-4">
        {/* Colonne centrale en pointillés */}
        <div className="absolute left-1/2 top-6 bottom-6 -translate-x-1/2 border-l-2 border-dashed border-slate-300" />

        <div className="relative z-10 flex flex-col gap-5">
          {steps.map((s, i) => {
            const isDone = s.status === "fait";
            const isCurrent = i === currentIndex;
            const isLocked = currentIndex !== -1 && i > currentIndex;
            const isObjectif = s.category === "objectif" || i === total - 1;
            const meta = categoryMeta(isObjectif ? "objectif" : s.category);
            const selected = s.id === selectedId;

            // Alternance gauche / droite autour de la colonne ; objectif centré.
            const align = isObjectif
              ? "justify-center"
              : i % 2 === 0
                ? "justify-start"
                : "justify-end";

            // Style de la pastille selon l'état.
            let node;
            if (isDone) {
              node = `${meta.node} text-white shadow-lg shadow-slate-900/15`;
            } else if (isCurrent) {
              node = "bg-white text-[#15615f] border-4 border-[#15615f] shadow-lg shadow-teal-900/15 pulse-ring";
            } else {
              node = "bg-slate-100 text-slate-400 border border-slate-200";
            }

            const size = isObjectif ? "h-20 w-20 text-3xl" : "h-16 w-16 text-xl";

            return (
              <div key={s.id} className={`flex ${align}`}>
                <div className="flex flex-col items-center" style={{ width: isObjectif ? "auto" : "40%" }}>
                  <button
                    onClick={() => onSelect(s.id)}
                    className={`flex items-center justify-center rounded-full font-bold transition-transform hover:scale-105 ${size} ${node} ${
                      selected ? "ring-4 ring-emerald-200" : ""
                    }`}
                    title={s.title}
                  >
                    {isObjectif ? "🏆" : isDone ? "✓" : isLocked ? "🔒" : s.orderIndex}
                  </button>
                  <span
                    className={`mt-1.5 text-center text-xs font-medium ${
                      isCurrent ? "text-[#15615f]" : "text-slate-400"
                    }`}
                  >
                    {isObjectif ? "Objectif" : isCurrent ? "Étape du jour" : `${meta.emoji}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
