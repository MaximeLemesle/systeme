// Barre d'XP du niveau courant (gamification).

export function XpBar({ totalXp, xpToNextLevel, level }) {
  const pct = Math.min(100, Math.round((totalXp / Math.max(1, xpToNextLevel)) * 100));
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span
          className="flex h-[30px] w-[30px] items-center justify-center bg-[#d9a441] font-display text-[15px] text-[#3a2600]"
          style={{ transform: "rotate(-4deg)" }}
        >
          {level}
        </span>
        <span className="text-[13px] font-bold uppercase text-[#2b211d]">Niveau</span>
        <span className="ml-auto text-xs font-semibold text-[#8a6f5f]">
          {totalXp} / {xpToNextLevel} XP
        </span>
      </div>
      <div className="relative h-3 overflow-hidden bg-[#f3e6d8]">
        <div
          className="relative h-full bg-linear-to-r from-[#c8532f] to-[#d9a441] transition-all duration-500"
          style={{ width: `${pct}%` }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg,rgba(255,255,255,0.25) 0 6px, transparent 6px 12px)",
            }}
          />
        </div>
      </div>
      <div className="mt-1.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a6f5f]">
        {pct}% vers le prochain niveau
      </div>
    </div>
  );
}
