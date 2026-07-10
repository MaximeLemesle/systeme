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
      <div className="mb-4 rounded-lg border-2 border-[#3d2d18]/10 bg-[#fff8e8]/85 p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-black text-[#18212a]">Route de quête</span>
          <span className="font-black text-[#7d705e]">
            {doneCount} / {total} séances
          </span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded-lg border-2 border-[#3d2d18]/15 bg-[#ead9b8] shadow-inner">
          <div
            className="meter-scan relative h-full overflow-hidden rounded-md bg-gradient-to-r from-[#1f6f5f] via-[#3477a8] to-[#d89b2b] transition-all duration-500 after:absolute after:inset-y-0 after:w-16 after:bg-white/35 after:blur-sm"
            style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Le chemin */}
      <div className="relative mx-auto max-w-lg overflow-hidden rounded-lg border-2 border-[#3d2d18]/10 bg-[#f8efd9] px-4 py-5">
        <div className="absolute inset-0 opacity-70" style={{
          backgroundImage:
            "linear-gradient(135deg, transparent 0 48%, rgba(31,111,95,.12) 48% 49%, transparent 49% 100%), linear-gradient(45deg, transparent 0 58%, rgba(52,119,168,.12) 58% 59%, transparent 59% 100%)",
        }} />
        {/* Route centrale */}
        <div
          className="absolute left-1/2 top-8 bottom-8 w-2 -translate-x-1/2 rounded-full border border-[#3d2d18]/10"
          style={{
            backgroundImage: "linear-gradient(to bottom, #d89b2b 0 45%, transparent 45% 100%)",
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
              node = `${meta.node} border-[#163f36]/20 text-white shadow-lg shadow-emerald-950/20`;
            } else if (isCurrent) {
              node = "bg-[#fffaf0] text-[#1f6f5f] border-4 border-[#d89b2b] shadow-lg shadow-amber-900/15 pulse-ring";
            } else {
              node = "bg-[#ead9b8] text-[#8a785e] border-2 border-[#3d2d18]/10";
            }

            const size = isObjectif ? "h-20 w-20 text-3xl" : "h-16 w-16 text-xl";

            return (
              <div key={s.id}>
                {isNewWeek && !isObjectif && (
                  <div className="my-1 flex justify-center">
                    <span className="rounded-full bg-[#172126]/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#f0c66b]">
                      Semaine {s.weekIndex}
                    </span>
                  </div>
                )}
                <div className={`flex ${align}`}>
                  <div className="flex flex-col items-center" style={{ width: isObjectif ? "auto" : "42%" }}>
                    <button
                      onClick={() => onSelect(s.id)}
                      className={`flex items-center justify-center rounded-lg font-black transition-transform hover:scale-105 ${size} ${node} ${
                        selected ? "ring-4 ring-[#d89b2b]/35" : ""
                      }`}
                      title={s.title}
                    >
                      {isObjectif ? "🏆" : isDone ? "✓" : isLocked ? "🔒" : s.orderIndex}
                    </button>
                    <span
                      className={`mt-1.5 rounded-md bg-[#fffaf0]/85 px-2 py-1 text-center text-xs font-black shadow-sm ${
                        isCurrent ? "text-[#1f6f5f]" : "text-[#8a785e]"
                      }`}
                    >
                      {isObjectif ? "Arrivée" : isCurrent ? "Checkpoint actif" : `${meta.emoji}`}
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
