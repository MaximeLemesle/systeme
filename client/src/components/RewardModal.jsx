// Écran de récompense affiché après une étape terminée ou un objectif validé.
import { Button } from "./ui";

// Confettis déterministes : éventail de trajectoires depuis le badge central.
const CONFETTI_COLORS = ["#f0c66b", "#d95f45", "#4d9f6d", "#53b6ae", "#7150a4", "#3477a8"];
const CONFETTI = Array.from({ length: 16 }, (_, i) => ({
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  cx: `${Math.round(Math.sin((i / 16) * Math.PI * 2) * (70 + (i % 3) * 45))}px`,
  cy: `${Math.round(Math.cos((i / 16) * Math.PI * 2) * (55 + (i % 4) * 35)) - 40}px`,
  cr: `${120 + i * 47}deg`,
  cd: `${(i % 5) * 0.06}s`,
}));

export default function RewardModal({ reward, onClose }) {
  if (!reward) return null;
  const { xpEarned, leveledUp, newLevels = [], title } = reward;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="reward-burst game-panel relative w-full max-w-sm overflow-hidden rounded-lg border-2 border-[#f0c66b]/30 bg-[#172126] p-6 text-center text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={{ background: c.color, "--cx": c.cx, "--cy": c.cy, "--cr": c.cr, "--cd": c.cd }}
          />
        ))}
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-lg border-b-4 border-[#9b6818] bg-[#d89b2b] text-4xl font-black text-[#2b2114] shadow-lg shadow-amber-900/20">
          {leveledUp ? "↑" : "+"}
        </div>
        <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-[#f0c66b]">
          Récompense
        </div>
        <h3 className="mb-1 text-2xl font-black">{title || "Bravo !"}</h3>
        <p className="mb-4 text-5xl font-black text-[#f0c66b]">+{xpEarned} XP</p>
        {leveledUp && (
          <div className="mb-4 rounded-lg border border-[#f0c66b]/25 bg-[#f0c66b]/15 px-3 py-2 text-sm font-black text-[#ffe2a0]">
            Niveau{newLevels.length > 1 ? "x" : ""} {newLevels.join(", ")} débloqué{newLevels.length > 1 ? "s" : ""}
          </div>
        )}
        <Button onClick={onClose} className="w-full">
          Continuer la campagne
        </Button>
      </div>
    </div>
  );
}
