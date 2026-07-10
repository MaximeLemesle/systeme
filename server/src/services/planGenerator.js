// Générateur de plan d'entraînement — 100 % DÉTERMINISTE, côté serveur, zéro LLM
// (voir docs/adr/0001). Deux recettes selon l'archétype de l'objectif :
//  - "chrono"     : temps cible sur une distance connue → l'ALLURE progresse
//                   (interpolation VMA courante → VMA cible sur la durée du plan).
//  - "completion" : couvrir une distance jamais faite → le VOLUME progresse
//                   (sortie longue croissante, marche/course pour les grands débutants).
// Chaque séance porte un `spec` JSON (source de vérité structurée) dont dérivent
// targetLabel et estDurationMin ; `spec.f` (fraction de progression 0..1) permet au
// recalibrage de recalculer les allures des séances restantes après une perf loggée.

const T = require("./templates");

const MIN_WEEKS = 3;
const MAX_WEEKS = 20; // ~4-5 mois, couvre un premier 5 km comme un premier marathon
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// La sortie longue ne dépasse jamais ce plafond absolu (au-delà, elle coûte plus
// qu'elle ne rapporte — même les plans marathon plafonnent vers 30-32 km).
const LONG_RUN_HARD_CAP_KM = 32;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
function lerp(a, b, f) {
  return a + (b - a) * f;
}
function round1(v) {
  return Math.round(v * 10) / 10;
}
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Nombre de semaines du plan : bornes [3 .. 20], indépendant de la fréquence
// (une fréquence élevée ne doit pas tronquer un plan long par rapport à l'échéance).
function planWeeks(deadline, frequency) {
  const freq = clamp(Math.round(num(frequency) || 3), 2, 5);
  const raw = deadline ? Math.round((new Date(deadline).getTime() - Date.now()) / WEEK_MS) : 8;
  return { weeks: clamp(raw, MIN_WEEKS, MAX_WEEKS), freq };
}

// Distance du test de référence : la distance de l'objectif, ou 2 km si objectif ≥ 10 km.
function testDistance(targetKm) {
  return targetKm >= 10 ? 2 : targetKm;
}

// VMA cible d'un objectif chrono (celle qui permet le temps cible sur la distance).
function chronoTargetVma(objectif) {
  return T.vmaFromPerf(num(objectif.targetDistanceKm), num(objectif.targetValue));
}

// VMA courante : depuis l'estimation courante (recalibrée), sinon le temps de départ,
// sinon l'amorce par niveau déclaré (corrigée dès la première perf loggée).
function chronoCurrentVma(objectif) {
  const dist = num(objectif.targetDistanceKm);
  const ref = num(objectif.currentValue) ?? num(objectif.startValue);
  return ref ? T.vmaFromPerf(dist, ref) : T.defaultVma(objectif.niveau);
}

// ---------- Instanciation d'une séance depuis un template + contexte ----------
// `f` ∈ [0,1] : position dans le plan (0 = début, 1 = objectif). ctx = { vmaStart, vmaTarget, objectif }.

function buildSpec(templateKey, f, ctx) {
  const { vmaStart, vmaTarget, objectif } = ctx;
  const vma = lerp(vmaStart, vmaTarget, f);
  const targetKm = num(objectif.targetDistanceKm);

  switch (templateKey) {
    case "test_reference": {
      const d = testDistance(targetKm);
      return { template: templateKey, f, distanceKm: d, paceSecPerKm: T.racePace(vmaStart, d) };
    }
    case "ef":
      return {
        template: templateKey,
        f,
        durationMin: Math.round(30 + 15 * f),
        paceSecPerKm: T.paceAtVma(vma, T.TEMPLATES.ef.vmaPct),
      };
    case "vo2_court":
      return {
        template: templateKey,
        f,
        sets: 2,
        reps: 6 + Math.round(4 * f), // 2×(6×30/30) → 2×(10×30/30)
        effortSec: 30,
        recoverySec: 30,
        paceSecPerKm: T.paceAtVma(vma, T.TEMPLATES.vo2_court.vmaPct),
      };
    case "seuil":
      return {
        template: templateKey,
        f,
        reps: 3,
        effortMin: 6 + Math.round(3 * f), // 3×6 min → 3×9 min
        recoveryMin: 2,
        paceSecPerKm: T.paceAtVma(vma, T.TEMPLATES.seuil.vmaPct),
      };
    case "allure_specifique":
      return {
        template: templateKey,
        f,
        reps: 3,
        repDistanceKm: clamp(round1(targetKm / 4), 1, 3),
        recoveryMin: 2,
        // L'allure de course cible, interpolée : c'est la progression visible.
        paceSecPerKm: T.racePace(vma, targetKm),
      };
    case "sortie_longue":
      return {
        template: templateKey,
        f,
        // Chrono : la sortie longue est en durée (50 → 80 min). Complétion : gérée à part.
        distanceKm: round1(((50 + 30 * f) * 60) / T.paceAtVma(vma, T.TEMPLATES.sortie_longue.vmaPct)),
        paceSecPerKm: T.paceAtVma(vma, T.TEMPLATES.sortie_longue.vmaPct),
      };
    case "objectif": {
      const isChrono = objectif.archetype === "chrono";
      return {
        template: templateKey,
        f: 1,
        distanceKm: targetKm,
        targetTimeSec: isChrono ? num(objectif.targetValue) : null,
        paceSecPerKm: isChrono ? Math.round(num(objectif.targetValue) / targetKm) : null,
      };
    }
    default:
      throw new Error(`Template inconnu : ${templateKey}`);
  }
}

// Séance complète (ligne Tache prête à persister) depuis un spec.
function toSeance(spec, weekIndex, orderIndex) {
  const meta = T.TEMPLATES[spec.template];
  return {
    orderIndex,
    weekIndex,
    templateKey: spec.template,
    title: `S${weekIndex} — ${meta.label}`,
    description: meta.advice,
    spec: JSON.stringify(spec),
    targetLabel: T.renderLabel(spec),
    estDurationMin: T.estimateDurationMin(spec),
  };
}

// ---------- Recette CHRONO ----------
// Semaine type : ef + séance qualité + sortie longue (selon fréquence). La qualité
// alterne vo2_court/seuil sur les 2 premiers tiers, puis allure_specifique sur le
// dernier tiers. Dernière semaine allégée : ef courte + objectif.

const CHRONO_WEEK_SLOTS = {
  2: ["quality", "sortie_longue"],
  3: ["ef", "quality", "sortie_longue"],
  4: ["ef", "quality", "ef", "sortie_longue"],
  5: ["ef", "quality", "seuil", "ef", "sortie_longue"],
};

function chronoQuality(weekIndex, weeks) {
  if (weekIndex > (2 * weeks) / 3) return "allure_specifique";
  return weekIndex % 2 === 1 ? "vo2_court" : "seuil";
}

function generateChrono(objectif) {
  const { weeks, freq } = planWeeks(objectif.deadline, objectif.frequency);
  const ctx = {
    vmaStart: chronoCurrentVma(objectif),
    vmaTarget: chronoTargetVma(objectif),
    objectif,
  };
  const seances = [];
  let order = 1;

  for (let w = 1; w < weeks; w++) {
    const f = w / weeks;
    const slots = [...CHRONO_WEEK_SLOTS[freq]];
    // Sans temps de référence : la toute première séance mesure le niveau de départ.
    if (w === 1 && num(objectif.startValue) === null) slots[0] = "test_reference";
    for (const slot of slots) {
      const key = slot === "quality" ? chronoQuality(w, weeks) : slot;
      seances.push(toSeance(buildSpec(key, f, ctx), w, order++));
    }
  }

  // Dernière semaine allégée : une ef courte puis le jour J.
  const efSpec = buildSpec("ef", 1, ctx);
  efSpec.durationMin = 25;
  seances.push(toSeance(efSpec, weeks, order++));
  seances.push(toSeance(buildSpec("objectif", 1, ctx), weeks, order++));
  return seances;
}

// ---------- Recette COMPLÉTION ----------
// Que du volume : séances de base (marche/course pour les grands débutants, sinon ef)
// + une sortie longue hebdo qui croît géométriquement (~+10 %/sem) jusqu'au plafond :
// 100 % de la cible si ≤ 5 km, sinon 90 % (plafond absolu 32 km).

// Échelle marche/course : une entrée par semaine de la phase (ratio course/marche qui monte).
const WALK_RUN_LADDER = [
  { reps: 8, runSec: 60, walkSec: 60 },
  { reps: 6, runSec: 120, walkSec: 60 },
  { reps: 5, runSec: 180, walkSec: 60 },
  { reps: 4, runSec: 300, walkSec: 60 },
];

function longRunCap(targetKm) {
  if (targetKm <= 5) return targetKm;
  return Math.min(round1(targetKm * 0.9), LONG_RUN_HARD_CAP_KM);
}

// Distances de sortie longue : progression géométrique de `base` vers `cap`
// sur `count` sorties, jamais décroissante, jamais > cap, jamais +12 %/sortie
// (règle de progression sûre : un plan trop court n'atteint pas forcément le
// plafond avant le jour J, plutôt que de forcer un dernier bond dangereux).
function longRunLadder(base, cap, count) {
  if (count <= 0) return [];
  if (count === 1) return [Math.min(base, cap)];
  const ratio = Math.min(1.12, Math.pow(cap / base, 1 / (count - 1)));
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(round1(Math.min(cap, base * Math.pow(ratio, i))));
  }
  return out;
}

function generateCompletion(objectif) {
  const { weeks, freq } = planWeeks(objectif.deadline, objectif.frequency);
  const targetKm = num(objectif.targetDistanceKm);
  const startKm = num(objectif.currentValue) ?? num(objectif.startValue) ?? 0;
  const vma = T.defaultVma(objectif.niveau);
  const ctx = { vmaStart: vma, vmaTarget: vma, objectif };

  // Phase marche/course : grands débutants (jamais couru 2 km en continu),
  // sur la première moitié du plan (bornée par l'échelle disponible).
  const walkRunWeeks =
    startKm < 2 ? Math.min(Math.ceil((weeks - 1) / 2), WALK_RUN_LADDER.length) : 0;

  const base = Math.max(startKm, round1(targetKm * 0.2), 1.5);
  const ladder = longRunLadder(Math.min(base, longRunCap(targetKm)), longRunCap(targetKm), weeks - 1);

  const seances = [];
  let order = 1;
  for (let w = 1; w < weeks; w++) {
    const f = w / weeks;
    for (let slot = 0; slot < freq - 1; slot++) {
      if (w <= walkRunWeeks) {
        const spec = { template: "marche_course", f, ...WALK_RUN_LADDER[w - 1] };
        seances.push(toSeance(spec, w, order++));
      } else {
        seances.push(toSeance(buildSpec("ef", f, ctx), w, order++));
      }
    }
    const spec = {
      template: "sortie_longue",
      f,
      distanceKm: ladder[w - 1],
      paceSecPerKm: T.paceAtVma(vma, T.TEMPLATES.sortie_longue.vmaPct),
    };
    seances.push(toSeance(spec, w, order++));
  }

  // Dernière semaine allégée : ef courte + la distance complète.
  const efSpec = buildSpec("ef", 1, ctx);
  efSpec.durationMin = 25;
  seances.push(toSeance(efSpec, weeks, order++));
  seances.push(toSeance(buildSpec("objectif", 1, ctx), weeks, order++));
  return seances;
}

// ---------- API du service ----------

// Génère le plan complet d'un objectif (lignes Tache prêtes à persister).
function generatePlan(objectif) {
  if (objectif.archetype === "chrono") return generateChrono(objectif);
  return generateCompletion(objectif);
}

// Recalibrage : recalcule les cibles des séances restantes (`a_faire`) après une perf
// loggée. La STRUCTURE du plan ne bouge pas ; seuls les chiffres se resserrent entre
// l'estimation courante et la cible. Les séances faites gardent leurs valeurs
// historiques (trace de progression). Retourne [{ id, spec, targetLabel, estDurationMin }].
function recalibrate(objectif, taches) {
  const remaining = taches.filter((t) => t.status === "a_faire" && t.spec);
  if (remaining.length === 0) return [];

  const updates = [];

  if (objectif.archetype === "chrono") {
    const vmaNow = chronoCurrentVma(objectif);
    const vmaTarget = chronoTargetVma(objectif);
    // Renormalise f sur la portion restante : la 1re séance restante part de
    // l'estimation COURANTE, la dernière vise toujours la cible.
    const f0 = Math.min(...remaining.map((t) => JSON.parse(t.spec).f ?? 0));
    for (const t of remaining) {
      const spec = JSON.parse(t.spec);
      const fRel = f0 >= 1 ? 1 : clamp(((spec.f ?? 0) - f0) / (1 - f0), 0, 1);
      const vma = lerp(vmaNow, vmaTarget, fRel);
      const targetKm = num(objectif.targetDistanceKm);
      switch (spec.template) {
        case "ef":
        case "sortie_longue":
        case "vo2_court":
        case "seuil":
          spec.paceSecPerKm = T.paceAtVma(vma, T.TEMPLATES[spec.template].vmaPct);
          break;
        case "allure_specifique":
          spec.paceSecPerKm = T.racePace(vma, targetKm);
          break;
        default:
          continue; // test_reference / objectif : cibles fixes
      }
      updates.push({
        id: t.id,
        spec: JSON.stringify(spec),
        targetLabel: T.renderLabel(spec),
        estDurationMin: T.estimateDurationMin(spec),
      });
    }
    return updates;
  }

  // Complétion : si le coureur a déjà couru plus loin que prévu, on remonte
  // l'échelle des sorties longues restantes depuis sa distance max réelle.
  const currentKm = num(objectif.currentValue) ?? 0;
  const cap = longRunCap(num(objectif.targetDistanceKm));
  const longs = remaining
    .map((t) => ({ t, spec: JSON.parse(t.spec) }))
    .filter(({ spec }) => spec.template === "sortie_longue")
    .sort((a, b) => a.t.orderIndex - b.t.orderIndex);
  if (longs.length === 0) return [];

  const base = clamp(Math.max(currentKm, longs[0].spec.distanceKm), 1.5, cap);
  const ladder = longRunLadder(base, cap, longs.length);
  longs.forEach(({ t, spec }, i) => {
    if (ladder[i] <= spec.distanceKm) return; // jamais de régression
    spec.distanceKm = ladder[i];
    updates.push({
      id: t.id,
      spec: JSON.stringify(spec),
      targetLabel: T.renderLabel(spec),
      estDurationMin: T.estimateDurationMin(spec),
    });
  });
  return updates;
}

module.exports = { generatePlan, recalibrate, planWeeks };
