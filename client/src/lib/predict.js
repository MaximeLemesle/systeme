// Formatage / parsing des estimations et perfs côté client (miroir léger de services/prediction.js).

// Secondes → "M:SS" (ou "H:MM:SS" au-delà d'une heure).
export function fmtTime(totalSec) {
  const s = Math.max(0, Math.round(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// "mm:ss" / "h:mm:ss" / "90" → secondes (ou null si invalide).
export function parseTime(str) {
  if (str === null || str === undefined || str === "") return null;
  const parts = String(str).trim().split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec > 0 ? Math.round(sec) : null;
}

// Estimation courante lisible depuis un objectif (currentValue). null si inconnue.
// chrono : temps équivalent sur la distance cible. completion : plus longue distance courue.
export function estimateLabel(obj) {
  if (!obj || obj.currentValue === null || obj.currentValue === undefined) return null;
  const cur = Number(obj.currentValue);
  if (!Number.isFinite(cur)) return null;
  if (obj.archetype === "chrono") {
    const d = Number(obj.targetDistanceKm);
    const dist = d ? `${d} km` : obj.metricLabel || "objectif";
    return `${dist} en ${fmtTime(cur)}`;
  }
  return `${cur} km parcourus en continu`;
}

// Cible de l'objectif, lisible (indépendant de l'estimation courante).
export function targetLabel(obj) {
  if (!obj) return null;
  const target = Number(obj.targetValue);
  if (!Number.isFinite(target)) return null;
  const d = Number(obj.targetDistanceKm);
  if (obj.archetype === "chrono") {
    return `${d ? `${d} km` : obj.metricLabel || "objectif"} en ${fmtTime(target)}`;
  }
  return `${d || target} km en continu`;
}

// La cible est-elle atteinte avec l'estimation courante ? (mémo côté client, le
// serveur reste seul juge — voir prediction.payload().targetReached).
export function isTargetReached(obj) {
  if (!obj) return false;
  const cur = Number(obj.currentValue);
  const target = Number(obj.targetValue);
  if (!Number.isFinite(cur) || !Number.isFinite(target)) return false;
  return obj.archetype === "chrono" ? cur <= target : cur >= target;
}
