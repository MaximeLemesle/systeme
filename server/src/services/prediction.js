// Service de prédiction — 100 % déterministe, calculé CÔTÉ SERVEUR (anti-triche). Aucun appel LLM.
// Mono-course : deux modèles selon l'archétype de l'objectif (voir CONTEXT.md) —
//  - "chrono"     : temps cible sur une distance connue. currentValue/startValue/targetValue en
//                   SECONDES. Chaque perf réelle (distance + temps) est convertie en temps
//                   équivalent sur la distance cible via la formule de Riegel ; on garde le
//                   MEILLEUR (temps le plus bas).
//  - "completion" : couvrir une distance jamais faite. currentValue/startValue/targetValue en KM.
//                   currentValue = la PLUS LONGUE distance de séance loggée (pauses marche
//                   incluses — on ne distingue pas les portions courues des portions marchées).

const RIEGEL_EXPONENT = 1.06;

// Convertit un Decimal Prisma / string / number en Number, ou null si non exploitable.
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Temps prédit (s) sur une distance cible à partir d'une perf réelle (formule de Riegel).
// T_cible = T × (D_cible / D)^1.06
function riegelSeconds({ distanceKm, durationSec, targetDistanceKm }) {
  const d = num(distanceKm);
  const t = num(durationSec);
  const dt = num(targetDistanceKm);
  if (!(d > 0) || !(t > 0) || !(dt > 0)) return null;
  return t * Math.pow(dt / d, RIEGEL_EXPONENT);
}

// Nouvelle estimation courante après une perf loggée.
// perf = { distanceKm?, durationSec? }.
// Retourne { currentValue, predictedFromPerf } ou null si la perf est inexploitable pour l'archétype.
function updateEstimate(objectif, perf = {}) {
  const prev = num(objectif.currentValue);

  if (objectif.archetype === "chrono") {
    const predicted = riegelSeconds({
      distanceKm: perf.distanceKm,
      durationSec: perf.durationSec,
      targetDistanceKm: objectif.targetDistanceKm,
    });
    if (predicted === null) return null;
    const next = prev === null ? predicted : Math.min(prev, predicted); // temps : meilleur = plus bas
    return { currentValue: Math.round(next), predictedFromPerf: Math.round(predicted) };
  }

  // Complétion : la distance de la séance compte en entier (pauses marche incluses).
  const dist = num(perf.distanceKm);
  if (dist === null) return null;
  const next = prev === null ? dist : Math.max(prev, dist); // distance : meilleur = plus grand
  return { currentValue: next, predictedFromPerf: dist };
}

// La cible de l'objectif est-elle atteinte avec l'estimation courante ?
// chrono : temps équivalent ≤ cible. completion : distance loggée ≥ cible.
function isTargetReached(objectif) {
  const cur = num(objectif.currentValue);
  const target = num(objectif.targetValue);
  if (cur === null || target === null) return false;
  return objectif.archetype === "chrono" ? cur <= target : cur >= target;
}

// Formatte un temps en secondes → "M:SS" (ou "H:MM:SS" au-delà d'une heure).
function fmtTime(totalSec) {
  const s = Math.max(0, Math.round(num(totalSec) ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Message lisible de l'estimation courante (ex : "5 km en 24:00", "12 km"). null si inconnue.
function formatEstimate(objectif) {
  const cur = num(objectif.currentValue);
  if (cur === null) return null;
  const d = num(objectif.targetDistanceKm);
  if (objectif.archetype === "chrono") {
    const dist = d ? `${d} km` : objectif.metricLabel || "objectif";
    return `${dist} en ${fmtTime(cur)}`;
  }
  return `${cur} km parcourus en continu`;
}

// Objet de prédiction renvoyé par l'API après une perf (à afficher côté client).
function predictionPayload(objectif) {
  return {
    archetype: objectif.archetype,
    currentValue: num(objectif.currentValue),
    targetValue: num(objectif.targetValue),
    targetDistanceKm: num(objectif.targetDistanceKm),
    metricLabel: objectif.metricLabel,
    estimateLabel: formatEstimate(objectif),
    targetReached: isTargetReached(objectif),
  };
}

module.exports = {
  num,
  riegelSeconds,
  updateEstimate,
  isTargetReached,
  fmtTime,
  formatEstimate,
  predictionPayload,
};
