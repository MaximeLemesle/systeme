// Service IA — appelé UNIQUEMENT côté backend.
// Trois usages : proposer des objectifs, raffiner un objectif libre, générer un plan d'action.
// Toujours sortie JSON validée avec Zod ; 1 retry si invalide, sinon erreur propagée (502 côté route).
const { SuggestionsOut, RefineOut, TasksOut } = require("../validation/schemas");
const { env } = require("../config/env");

const PROVIDER = env.AI_PROVIDER;
// Un LLM local peut être lent, mais au-delà on abandonne pour ne pas laisser la requête pendue.
const LLM_TIMEOUT_MS = 150_000;

// Appel LLM générique renvoyant un objet JSON parsé.
async function callLlmJson(system, user) {
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
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
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
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Mistral ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// Valide la sortie ; 1 retry si le JSON ne respecte pas le schéma.
async function generateValidated(system, user, schema) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callLlmJson(system, user);
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

// Descriptions lisibles des types d'objectif de course (pour guider le LLM si besoin).
const TYPE_LABELS = {
  endurance: "Endurance : courir plus longtemps sans s'arrêter (durée ou distance continue)",
  chrono: "Chrono : atteindre un temps cible sur une distance (ex : 5 km en 30 min)",
  distance: "Distance : augmenter la distance parcourue (ex : réussir son premier 10 km)",
  regularite: "Régularité : courir régulièrement (ex : 3 sorties par semaine pendant 1 mois)",
};

function domaineLabel(domaine) {
  if (!domaine) return "Progression personnelle";
  if (typeof domaine === "string") return domaine;
  return [domaine.name, domaine.description].filter(Boolean).join(" — ");
}

function extraContext(objectiveType) {
  return objectiveType && TYPE_LABELS[objectiveType] ? ` Type visé : ${TYPE_LABELS[objectiveType]}.` : "";
}

// Propose 3 objectifs SMART adaptés au domaine et au niveau.
async function suggestObjectives({ domaine, niveau = "débutant", objectiveType = null }) {
  const system = `Tu es un coach expert en pratique délibérée. ${FR_RULE} ${JSON_RULE}`;
  const user = `Date du jour : ${today()}.
Domaine : ${domaineLabel(domaine)}.
Niveau de l'utilisateur : ${niveau}.${extraContext(objectiveType)}
Propose EXACTEMENT 3 objectifs SMART progressifs (du plus accessible au plus ambitieux), réalistes, mesurables et adaptés à ce domaine.
Sois CONCIS : "title" max 12 mots, "metric_label" 1 à 3 mots (ex : "distance", "temps", "projet", "morceau").
Format STRICT : {"objectifs":[{"title","metric_label","unit","target_value","difficulty","deadline_suggeree"}]}.
"difficulty" ∈ facile|moyen|difficile. "deadline_suggeree" au format YYYY-MM-DD (échéance réaliste à partir d'aujourd'hui).`;
  return (await generateValidated(system, user, SuggestionsOut)).objectifs;
}

// Transforme un objectif libre en objectif SMART.
async function refineObjective({ domaine, objectifBrut, niveau = "débutant", objectiveType = null }) {
  const system = `Tu es un coach qui transforme un objectif vague en objectif SMART réaliste. ${FR_RULE} ${JSON_RULE}`;
  const user = `Date du jour : ${today()}.
Domaine : ${domaineLabel(domaine)}.
Niveau de l'utilisateur : ${niveau}.${extraContext(objectiveType)}
Objectif brut de l'utilisateur : "${objectifBrut}".
Reformule-le en objectif SMART cohérent et atteignable pour ce domaine. Sois CONCIS (titre max 14 mots).
Format STRICT : {"title","metric_label","unit","start_value","target_value","difficulty","deadline","faisabilite"}.
"difficulty" ∈ facile|moyen|difficile. "deadline" au format YYYY-MM-DD. "faisabilite" : 1 phrase courte et honnête.`;
  return await generateValidated(system, user, RefineOut);
}

// Génère un plan de tâches ordonnées jusqu'à l'objectif.
async function generateTasks({ domaine, objectif, niveau = "débutant" }) {
  const system = `Tu es un coach expert en pratique délibérée qui construit des plans progressifs, concrets et sûrs. ${FR_RULE} ${JSON_RULE}`;
  const user = `Domaine : ${domaineLabel(domaine)}.
Niveau de l'utilisateur : ${niveau}. Objectif : ${JSON.stringify(objectif)}.
Construis un plan SIMPLE de 5 à 10 tâches ORDONNÉES, progressives, qui mènent à l'objectif. La dernière tâche doit représenter l'objectif final ou une validation concrète.
Pour chaque tâche, donne un titre court et une description avec un peu de détail (durée, intensité ou livrable, et 1 conseil concret).
"category" vaut "general" par défaut. Si le domaine est la course à pied, tu peux utiliser : footing | fractionne | sortie_longue | recuperation | objectif.
Format STRICT : {"taches":[{"order_index","title","description","category","est_duration_min"}]}.
"order_index" commence à 1. "est_duration_min" = durée estimée en minutes.`;
  return (await generateValidated(system, user, TasksOut)).taches;
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

module.exports = { suggestObjectives, refineObjective, generateTasks, warmupLlm };
