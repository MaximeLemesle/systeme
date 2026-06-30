// Barre d'XP du niveau courant (gamification).

export function XpBar({ totalXp, xpToNextLevel, level }) {
  const pct = Math.min(100, Math.round((totalXp / xpToNextLevel) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-bold text-[#15615f]">Niveau {level}</span>
        <span className="text-slate-400">
          {totalXp} / {xpToNextLevel} XP
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
        <div
          className="meter-scan relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#15615f] via-[#2f8a73] to-[#d89b2b] transition-all duration-500 after:absolute after:inset-y-0 after:w-16 after:bg-white/30 after:blur-sm"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
