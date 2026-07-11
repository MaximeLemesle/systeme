// Écran de récompense affiché après une étape terminée ou un objectif validé.
import { Button } from "./ui";
import { formatDuration } from "../lib/time";

// Confettis déterministes : éventail de trajectoires depuis le badge central.
const CONFETTI_COLORS = ["#ffd98a", "#b0392a", "#3f8f5a", "#e8935f", "#7150a4", "#3477a8"];
const CONFETTI = Array.from({ length: 16 }, (_, i) => ({
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  cx: `${Math.round(Math.sin((i / 16) * Math.PI * 2) * (70 + (i % 3) * 45))}px`,
  cy: `${Math.round(Math.cos((i / 16) * Math.PI * 2) * (55 + (i % 4) * 35)) - 40}px`,
  cr: `${120 + i * 47}deg`,
  cd: `${(i % 5) * 0.06}s`,
}));

export default function RewardModal({ reward, onClose }) {
  if (!reward) return null;
  const { xpEarned, leveledUp, newLevels = [], title, predictionSeconds } = reward;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="reward-burst game-panel relative w-full max-w-sm overflow-hidden rounded-lg border-2 border-[#ffd98a]/30 bg-[#1c1410] p-6 text-center text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={{ background: c.color, "--cx": c.cx, "--cy": c.cy, "--cr": c.cr, "--cd": c.cd }}
          />
        ))}
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-lg border-b-4 border-[#8a6423] bg-[#d9a441] text-4xl font-black text-[#2b1c0a] shadow-lg shadow-amber-900/20">
          {leveledUp ? "↑" : "+"}
        </div>
        <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-[#ffd98a]">
          Récompense
        </div>
        <h3 className="mb-1 font-display text-3xl">{title || "Bravo !"}</h3>
        <p className="mb-4 text-5xl font-black text-[#ffd98a]">+{xpEarned} XP</p>
        {leveledUp && (
          <div className="mb-4 rounded-lg border border-[#ffd98a]/25 bg-[#ffd98a]/15 px-3 py-2 text-sm font-black text-[#ffd98a]">
            Niveau{newLevels.length > 1 ? "x" : ""} {newLevels.join(", ")} débloqué{newLevels.length > 1 ? "s" : ""}
          </div>
        )}
        {predictionSeconds && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-black text-slate-100">
            Prédiction actuelle : {formatDuration(predictionSeconds)}
          </div>
        )}
        <Button onClick={onClose} className="w-full">
          Continuer l'entraînement
        </Button>
      </div>
    </div>
  );
}
