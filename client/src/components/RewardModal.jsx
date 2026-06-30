// Écran de récompense affiché après une étape terminée ou un objectif validé.
import { Button } from "./ui";

export default function RewardModal({ reward, onClose }) {
  if (!reward) return null;
  const { xpEarned, leveledUp, newLevels = [], title } = reward;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-pop w-full max-w-sm overflow-hidden rounded-lg border border-white/15 bg-[#172126] p-6 text-center text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-lg bg-[#d89b2b] text-2xl shadow-lg shadow-amber-900/20">
          {leveledUp ? "↑" : "+"}
        </div>
        <h3 className="mb-1 text-lg font-black">{title || "Bravo !"}</h3>
        <p className="mb-4 text-4xl font-black text-[#f0c66b]">+{xpEarned} XP</p>
        {leveledUp && (
          <p className="mb-4 rounded-lg border border-[#f0c66b]/25 bg-[#f0c66b]/15 px-3 py-2 text-sm font-semibold text-[#ffe2a0]">
            Niveau{newLevels.length > 1 ? "x" : ""} {newLevels.join(", ")} atteint·s
          </p>
        )}
        <Button onClick={onClose} className="w-full">
          Continuer
        </Button>
      </div>
    </div>
  );
}
