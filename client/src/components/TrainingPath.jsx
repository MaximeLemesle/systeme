// Parcours visuel : des étapes reliées par un chemin, du départ à l'objectif.
// - étape faite  → pastille colorée avec ✓
// - étape courante → pastille blanche entourée, halo pulsé
// - étape verrouillée → pastille grise
// - dernière étape (objectif) → trophée 🏆
// Les étapes sont groupées par semaine (weekIndex) avec un séparateur.
import { templateMeta } from "../lib/templates";

export default function TrainingPath({ seances: steps, selectedId, onSelect }) {
  const doneCount = steps.filter((s) => s.status === "fait").length;
  const currentIndex = steps.findIndex((s) => s.status !== "fait");
  const total = steps.length;

  return (
    <div>
      {/* Progression globale */}
      <div className="mb-4 rounded-lg border-2 border-[#2b211d]/10 bg-[#faf5ee]/85 p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-black text-[#2b211d]">Parcours d'entraînement</span>
          <span className="font-black text-[#8a6f5f]">
            {doneCount} / {total} séances
          </span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded-lg border-2 border-[#2b211d]/15 bg-[#e8d9c8] shadow-inner">
          <div
            className="meter-scan relative h-full overflow-hidden rounded-md bg-gradient-to-r from-[#c8532f] via-[#3477a8] to-[#d9a441] transition-all duration-500 after:absolute after:inset-y-0 after:w-16 after:bg-white/35 after:blur-sm"
            style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Le chemin */}
      <div className="relative mx-auto max-w-lg overflow-hidden rounded-lg border-2 border-[#7a2a15]/30 bg-[#a83f22] px-4 py-5">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-45deg, rgba(255,255,255,0.06) 0 14px, transparent 14px 28px)",
          }}
        />
        {/* Route centrale */}
        <div
          className="absolute left-1/2 top-8 bottom-8 w-2 -translate-x-1/2 rounded-full border border-[#2b211d]/10"
          style={{
            backgroundImage: "linear-gradient(to bottom, #d9a441 0 45%, transparent 45% 100%)",
            backgroundSize: "100% 34px",
            animation: "route-dash 2.4s linear infinite",
          }}
        />

        <div className="relative z-10 flex flex-col gap-5">
          {steps.map((s, i) => {
            const isDone = s.status === "fait";
            const isCurrent = i === currentIndex;
            const isLocked = currentIndex !== -1 && i > currentIndex;
            const isObjectif = s.templateKey === "objectif" || i === total - 1;
            const meta = templateMeta(isObjectif ? "objectif" : s.templateKey);
            const selected = s.id === selectedId;
            const isNewWeek = i === 0 || s.weekIndex !== steps[i - 1].weekIndex;

            // Alternance gauche / droite autour de la colonne ; objectif centré.
            const align = isObjectif
              ? "justify-center"
              : i % 2 === 0
                ? "justify-start"
                : "justify-end";

            let node;
            if (isDone) {
              node = `${meta.node} border-[#6e2415]/20 text-white shadow-lg shadow-black/20`;
            } else if (isCurrent) {
              node = "bg-[#faf5ee] text-[#c8532f] border-4 border-[#d9a441] shadow-lg shadow-amber-900/15 pulse-ring";
            } else {
              node = "bg-[#e8d9c8] text-[#8a6f5f] border-2 border-[#2b211d]/10";
            }

            const size = isObjectif ? "h-20 w-20 text-3xl" : "h-16 w-16 text-xl";

            return (
              <div key={s.id}>
                {isNewWeek && !isObjectif && (
                  <div className="my-1 flex justify-center">
                    <span className="rounded-full bg-[#1c1410]/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#ffd98a]">
                      Semaine {s.weekIndex}
                    </span>
                  </div>
                )}
                <div className={`flex ${align}`}>
                  <div className="flex flex-col items-center" style={{ width: isObjectif ? "auto" : "42%" }}>
                    <button
                      onClick={() => onSelect(s.id)}
                      className={`flex items-center justify-center rounded-lg font-black transition-transform hover:scale-105 ${size} ${node} ${
                        selected ? "ring-4 ring-[#d9a441]/35" : ""
                      }`}
                      title={s.title}
                    >
                      {isObjectif ? "🏆" : isDone ? "✓" : isLocked ? "🔒" : s.orderIndex}
                    </button>
                    <span
                      className={`mt-1.5 rounded-md bg-[#faf5ee]/85 px-2 py-1 text-center text-xs font-black shadow-sm ${
                        isCurrent ? "text-[#c8532f]" : "text-[#8a6f5f]"
                      }`}
                    >
                      {isObjectif ? "Arrivée" : isCurrent ? "Séance du jour" : `${meta.emoji}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
