// Barre d'XP du niveau courant (gamification).

export function XpBar({ totalXp, xpToNextLevel, level }) {
  const pct = Math.min(100, Math.round((totalXp / xpToNextLevel) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-bold text-emerald-700">Niveau {level}</span>
        <span className="text-slate-400">
          {totalXp} / {xpToNextLevel} XP
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
