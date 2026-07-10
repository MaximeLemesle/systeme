// Service IA — appelé UNIQUEMENT côté backend.
// Seul usage : l'intake conversationnel qui recueille les paramètres de l'objectif
// de course à pied. Le plan lui-même est calculé de façon déterministe par
// services/planGenerator.js (voir docs/adr/0001) — jamais par le LLM.
const { IntakeOut } = require("../validation/schemas");
const { env } = require("../config/env");

const PROVIDER = env.AI_PROVIDER;
// Un LLM local peut être lent, mais au-delà on abandonne pour ne pas laisser la requête pendue.
const LLM_TIMEOUT_MS = 150_000;

// Appel LLM générique multi-messages renvoyant un objet JSON parsé.
// `messages` inclut déjà le rôle "system" et tout le transcript.
async function chatJson(messages) {
  if (PROVIDER === "ollama") {
    const res = await fetch(`${env.OLLAMA_URL}/api/chat`, {
      method: "POST",
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        format: "json",
        stream: false,
        keep_alive: "10m", // garde le modèle chargé entre les appels
        options: {
          temperature: 0.2, // sorties plus déterministes = JSON plus fiable & moins bavard
          num_predict: 1100, // borne la génération (anti-emballement)
        },
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    return JSON.parse(data.message.content);
  }

  // Mistral cloud (fallback optionnel)
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Mistral ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// Valide la sortie d'un transcript complet ; 1 retry si le JSON ne respecte pas le schéma.
async function generateValidatedChat(messages, schema) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await chatJson(messages);
      return schema.parse(raw);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`IA: sortie invalide (${lastErr?.message || "inconnue"})`);
}

const JSON_RULE =
  "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans backticks.";
const FR_RULE =
  "IMPORTANT : rédige absolument TOUT le texte (titres, descriptions, labels, conseils) en FRANÇAIS correct et naturel. Aucun mot en anglais.";

const today = () => new Date().toISOString().slice(0, 10);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Nombre de jours minimum réaliste avant l'échéance, selon l'ampleur du changement visé
// (règle de progression progressive : plus l'écart start→target est grand, plus il faut de temps).
// Sans valeurs numériques exploitables, on retombe sur un minimum raisonnable de 3 semaines.
function minRealisticDays(startValue, targetValue) {
  const s = Number(startValue);
  const t = Number(targetValue);
  if (!Number.isFinite(s) || !Number.isFinite(t) || s === 0) return 21;
  const pctChange = Math.abs((t - s) / s) * 100;
  const weeks = Math.min(52, Math.max(3, Math.ceil(pctChange * 1.5) + 2));
  return weeks * 7;
}

// Garantit une échéance dans le FUTUR et réaliste par rapport à l'ampleur du changement demandé.
// Les petits modèles locaux ignorent parfois la consigne de date (ex : renvoient la date du jour) —
// on ne peut pas compter sur le LLM pour ça, donc on la recalcule nous-mêmes si besoin (déterministe).
function ensureRealisticDeadline(deadline, startValue, targetValue) {
  const minDays = minRealisticDays(startValue, targetValue);
  const floor = new Date(Date.now() + minDays * ONE_DAY_MS);
  const proposed = deadline ? new Date(deadline) : null;
  const isValid = proposed && !Number.isNaN(proposed.getTime());
  if (isValid && proposed.getTime() >= floor.getTime()) return deadline;
  return floor.toISOString().slice(0, 10);
}

// Répare/normalise la proposition d'objectif d'un petit modèle local (peu fiable sur les consignes fines).
// Pour l'archétype "chrono" : déduit la distance de référence si absente, et met les temps en SECONDES.
function normalizeIntakeObjectif(obj) {
  if (!obj) return obj;
  const o = { ...obj };
  if (o.archetype === "chrono") {
    if (o.target_distance_km == null) {
      const m = `${o.title || ""} ${o.metric_label || ""}`.match(/(\d+(?:[.,]\d+)?)\s*km/i);
      if (m) o.target_distance_km = Number(m[1].replace(",", "."));
    }
    // Un temps de 5 km ne peut pas être < 300 s : une valeur si petite est en minutes → on convertit.
    const toSec = (v) => (v != null && v > 0 && v < 300 ? Math.round(v * 60) : v);
    o.target_value = toSec(o.target_value);
    if (o.start_value != null) o.start_value = toSec(o.start_value);
    o.unit = "s";
  } else {
    o.unit = "km";
  }
  o.deadline = ensureRealisticDeadline(o.deadline, o.start_value, o.target_value);
  return o;
}

// Recueil conversationnel (multi-tours) des infos SMART avant de créer l'objectif de course.
// Le LLM pose au plus 4 questions puis propose un objectif SMART complet.
// `messages` = transcript [{role:"user"|"assistant", content}]. Sortie JSON validée par IntakeOut.
async function intakeConversation({ niveau = "débutant", messages }) {
  const system = `Tu es un coach de course à pied qui recueille, EN CONVERSATION, les informations nécessaires pour bâtir un objectif SMART et un plan d'entraînement. ${FR_RULE} ${JSON_RULE}
Date du jour : ${today()}. Domaine : course à pied. Niveau de l'utilisateur : ${niveau}.
Règles de conduite :
- Pose AU PLUS 4 questions, UNE seule à la fois, pour clarifier : (1) l'ARCHÉTYPE — un temps cible sur une distance ("aller plus vite sur 5 km") ou juste réussir à couvrir une distance jamais faite ("finir un marathon", "mon premier 2 km") ; (2) la distance de référence (km) ; (3) si archétype temps cible : le temps visé, et le temps actuel sur cette distance (ou "jamais chronométré") ; (4) l'échéance et la fréquence hebdomadaire souhaitée (2 à 5 séances/semaine).
- Dès que tu as assez d'infos, propose directement l'objectif SMART final (ne pose pas de question superflue).
Réponds TOUJOURS avec un objet JSON de forme EXACTE :
{"done": <true|false>, "assistant": "<ton message en français>", "objectif": <null ou objet>}
- Tant que tu poses une question : "done"=false, "objectif"=null, "assistant"=ta question.
- Quand tu proposes l'objectif : "done"=true, "assistant"=court récapitulatif, "objectif"={"title","metric_label","unit","start_value","target_value","target_distance_km","difficulty","deadline","archetype","frequency","faisabilite"}.
- "archetype" ∈ chrono|completion. "chrono" = temps cible sur une distance ; "completion" = couvrir une distance jamais faite (pas de temps cible).
- "target_distance_km" = distance de référence en km (nombre), TOUJOURS requise.
- Si "chrono" : "target_value" = temps CIBLE en SECONDES, "start_value" = temps ACTUEL en secondes (ou null si jamais chronométré), "unit" = "s".
- Si "completion" : "target_value" = "target_distance_km" (même valeur, en km), "start_value" = plus longue distance déjà courue en continu (ou null si jamais essayé), "unit" = "km".
- "frequency" = nombre entier de séances par semaine (2 à 5).
- "difficulty" ∈ facile|moyen|difficile. "deadline" au format YYYY-MM-DD : une date FUTURE (JAMAIS la date du jour ni une date passée), laissant assez de temps pour progresser réellement.`;
  // Garde-fou anti-boucle : après 3 réponses de l'utilisateur, on force la proposition finale
  // (les petits modèles locaux ont tendance à reposer des questions à l'infini).
  const userTurns = messages.filter((m) => m.role === "user").length;
  const full = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  if (userTurns >= 3) {
    full.push({
      role: "system",
      content:
        "Tu as maintenant assez d'informations. Tu DOIS répondre avec \"done\": true et un \"objectif\" complet. Ne pose plus AUCUNE question. Si une info manque, choisis une valeur raisonnable par défaut.",
    });
  }
  const out = await generateValidatedChat(full, IntakeOut);
  if (out.done && out.objectif) out.objectif = normalizeIntakeObjectif(out.objectif);
  return out;
}

// Précharge le modèle en mémoire (appelé au boot) : le premier appel IA d'un
// utilisateur n'attend plus le chargement à froid (~5-20 s selon le modèle).
async function warmupLlm() {
  if (PROVIDER !== "ollama") return;
  try {
    await fetch(`${env.OLLAMA_URL}/api/chat`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        stream: false,
        keep_alive: "30m",
        options: { num_predict: 1 },
        messages: [{ role: "user", content: "ok" }],
      }),
    });
    console.log(`IA préchargée (${env.OLLAMA_MODEL})`);
  } catch {
    console.warn("IA non préchargée (Ollama indisponible) — elle chargera au premier appel.");
  }
}

module.exports = { intakeConversation, warmupLlm };
