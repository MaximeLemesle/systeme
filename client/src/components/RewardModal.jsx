// Écran de récompense affiché après une séance terminée ou un objectif validé.
import { Button } from "./ui";

export default function RewardModal({ reward, onClose }) {
  if (!reward) return null;
  const { xpEarned, leveledUp, newLevels = [], title } = reward;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="animate-pop w-full max-w-sm rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-5xl">{leveledUp ? "🎉" : "✨"}</div>
        <h3 className="mb-1 text-lg font-bold text-slate-800">{title || "Bravo !"}</h3>
        <p className="mb-4 text-3xl font-extrabold text-emerald-600">+{xpEarned} XP</p>
        {leveledUp && (
          <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
            Niveau{newLevels.length > 1 ? "x" : ""} {newLevels.join(", ")} atteint·s 🆙
          </p>
        )}
        <Button onClick={onClose} className="w-full">
          Continuer
        </Button>
      </div>
    </div>
  );
}
