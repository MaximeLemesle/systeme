// Barre d'XP du niveau courant (gamification).

export function XpBar({ totalXp, xpToNextLevel, level }) {
  const pct = Math.min(100, Math.round((totalXp / Math.max(1, xpToNextLevel)) * 100));
  return (
    <div className="rounded-lg border-2 border-[#3d2d18]/10 bg-[#fff7e5]/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="inline-flex items-center gap-2 font-black text-[#1f6f5f]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border-b-4 border-[#9b6818] bg-[#d89b2b] text-[#2b2114] shadow-sm">
            {level}
          </span>
          Niveau
        </span>
        <span className="font-bold text-[#7d705e]">
          {totalXp} / {xpToNextLevel} XP
        </span>
      </div>
      <div className="h-5 w-full overflow-hidden rounded-lg border-2 border-[#3d2d18]/15 bg-[#ead9b8] shadow-inner">
        <div
          className="meter-scan relative h-full overflow-hidden rounded-md bg-gradient-to-r from-[#1f6f5f] via-[#4d9f6d] to-[#d89b2b] transition-all duration-500 after:absolute after:inset-y-0 after:w-16 after:bg-white/35 after:blur-sm"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-right text-[11px] font-black uppercase tracking-[0.12em] text-[#8a785e]">
        {pct}% vers le prochain niveau
      </div>
    </div>
  );
}
