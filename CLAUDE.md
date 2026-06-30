# CLAUDE.md — Système d'évolution

> Dépose ce fichier à la racine du repo. Claude Code le lit automatiquement.
> Il sert de **contexte durable** (stack, modèle, conventions) **et** de **brief de démarrage** (section « Premières tâches » à la fin).

---

## 1. Le projet en deux phrases

**Système d'évolution** est une application web qui aide n'importe qui à progresser vite dans un domaine (sport, code, musique…) en appliquant la **pratique délibérée** (« méthode des 10 000 heures »). Une **IA** structure la montée en compétence (propose/raffine des objectifs SMART, puis génère le plan de tâches), et tout est **gamifié** (XP, niveaux, paliers).

**Exemple fil rouge** : domaine `Code` → l'utilisateur écrit « créer une app mobile dans 1 mois » → l'IA le raffine en objectif SMART → l'IA génère un plan de tâches ordonné → chaque session loggée rapporte de l'XP → valider l'objectif débloque un gros palier.

---

## 2. Comment travailler sur ce repo (règles pour l'agent)

- **Avance par incréments livrables** en suivant l'ordre des phases (section 11). À la fin de chaque phase, l'app doit tourner.
- **Toute la logique d'XP, de niveau et de validation se calcule CÔTÉ SERVEUR.** Le client n'envoie jamais un montant d'XP ; il envoie des faits (durée, difficulté) et le serveur calcule. Anti-triche.
- **La clé d'API du LLM ne touche JAMAIS le frontend.** Les appels IA passent uniquement par le backend (`/ai/*`, `/domaines/:id/objectifs/suggestions`, `/objectifs/:id/taches/generate`).
- **Toujours valider les sorties du LLM avec Zod** avant de les persister (voir section 8). Si le JSON est invalide → retry une fois, sinon erreur 502 propre.
- **Ne commit jamais de secret.** Utilise `.env` (gitignore) + fournis un `.env.example`.
- **Demande avant toute opération destructive** (drop de base, `migrate reset`, suppression de fichiers existants).
- Garde les commits petits et explicites (`feat:`, `fix:`, `chore:`…).
- Deadline courte : si tu dois arbitrer, **livre les `Must have` d'abord** (section 10 du cadrage), reporte le reste.

---

## 3. Stack & architecture

- **Frontend** : React (Vite) + Tailwind CSS + React Router + TanStack Query. JavaScript.
- **Backend** : Node.js + Express + Prisma. JavaScript. Auth JWT. Validation Zod.
- **Base de données** : SQLite via Prisma (`server/prisma/dev.db`) pour un démarrage local sans infra.
- **IA** : Ollama local en primaire (`mistral` par défaut, mode JSON) ; Mistral API (`mistral-small-latest`) reste disponible en option cloud. Appelée **uniquement côté backend**.
- **Monorepo** : deux dossiers `server/` et `client/`.

```
systeme-evolution/
├── CLAUDE.md                 # ce fichier
├── README.md
├── server/
│   ├── .env.example
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── index.js          # bootstrap Express
│       ├── prisma.js         # client Prisma singleton
│       ├── middleware/auth.js
│       ├── validation/schemas.js
│       ├── services/
│       │   ├── gamification.js
│       │   └── ai.js
│       └── routes/
│           ├── auth.js
│           ├── domaines.js
│           ├── objectifs.js
│           ├── taches.js
│           ├── feedback.js       # routes /sessions/:id/feedback
│           ├── ai.js
│           └── stats.js
└── client/
    ├── package.json
    ├── index.html
    ├── vite.config.js       # React + Tailwind CSS v4 plugin
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api/client.js     # wrapper fetch + JWT
        ├── lib/auth.js
        ├── components/        # Cartes, barres XP, etc.
        └── pages/
            ├── Login.jsx
            ├── Register.jsx
            ├── Dashboard.jsx
            ├── DomaineDetail.jsx
            └── ObjectifDetail.jsx
```

---

## 4. Prérequis & variables d'environnement

Prérequis locaux :
- Node.js 20.19+ ou 22.12+ (Vite 8 ; utiliser `nvm use` avec le `.nvmrc` du repo si besoin).
- Ollama installé et lancé (`ollama serve`) pour les fonctions IA locales.

`server/.env.example` :

```
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me"
AI_PROVIDER="ollama"          # "ollama" | "mistral"
OLLAMA_URL="http://localhost:11434"
OLLAMA_MODEL="mistral"
MISTRAL_API_KEY=""            # requis uniquement si AI_PROVIDER=mistral
PORT=4000
HOST="127.0.0.1"
```

`client/.env.example` :

```
VITE_API_URL="http://127.0.0.1:4000"
```

Ollama doit tourner avant d'utiliser les fonctions IA (`ollama serve`) et le modèle configuré doit être installé (`ollama pull mistral`). Pour des réponses plus rapides en local, utiliser par exemple `llama3.2:3b` et changer `OLLAMA_MODEL`.

SQLite suffit pour le développement local et la démo. Si le projet passe en production multi-utilisateurs, prévoir une migration vers PostgreSQL ou une base managée.

---

## 5. Modèle de données — `server/prisma/schema.prisma`

> Noms de tables/colonnes en `snake_case` (mappés) pour rester cohérent avec le doc de cadrage.
> Les valeurs « enum » (`status`, `difficulty`) sont contraintes au niveau applicatif via Zod (section 8) ; tu peux ajouter des `CHECK` SQL via une migration custom si tu veux les durcir.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id           Int       @id @default(autoincrement()) @map("id_user")
  username     String    @unique
  email        String    @unique
  passwordHash String    @map("password_hash")
  createdAt    DateTime  @default(now()) @map("created_at")
  domaines     Domaine[]

  @@map("user")
}

model Domaine {
  id            Int        @id @default(autoincrement()) @map("id_domaine")
  name          String
  description   String?
  level         Int        @default(1)
  totalXp       Int        @default(0) @map("total_xp")          // XP accumulée DANS le niveau courant
  xpToNextLevel Int        @default(100) @map("xp_to_next_level")
  totalMinutes  Int        @default(0) @map("total_minutes")
  status        String     @default("actif")                     // actif | en_pause | maitrise
  createdAt     DateTime   @default(now()) @map("created_at")
  userId        Int        @map("user_id")
  user          User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  objectifs     Objectif[]

  @@map("domaine")
}

model Objectif {
  id           Int       @id @default(autoincrement()) @map("id_objectif")
  title        String
  description  String?
  rawInput     String?   @map("raw_input")                       // objectif brut saisi par l'utilisateur
  metricLabel  String    @map("metric_label")
  unit         String?
  startValue   Decimal?  @map("start_value")
  targetValue  Decimal   @map("target_value")
  currentValue Decimal?  @map("current_value")
  difficulty   String    @default("moyen")                       // facile | moyen | difficile
  deadline     DateTime?
  status       String    @default("en_cours")                    // en_cours | valide | abandonne
  xpReward     Int       @default(1000) @map("xp_reward")
  aiRefined    Boolean   @default(false) @map("ai_refined")
  createdAt    DateTime  @default(now()) @map("created_at")
  validatedAt  DateTime? @map("validated_at")
  domaineId    Int       @map("domaine_id")
  domaine      Domaine   @relation(fields: [domaineId], references: [id], onDelete: Cascade)
  taches       Tache[]
  sessions     Session[]

  @@map("objectif")
}

model Tache {
  id             Int       @id @default(autoincrement()) @map("id_tache")
  title          String
  description    String?
  orderIndex     Int       @default(0) @map("order_index")
  estDurationMin Int?      @map("est_duration_min")
  status         String    @default("a_faire")                   // a_faire | en_cours | fait
  isAiGenerated  Boolean   @default(true) @map("is_ai_generated")
  completedAt    DateTime? @map("completed_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  objectifId     Int       @map("objectif_id")
  objectif       Objectif  @relation(fields: [objectifId], references: [id], onDelete: Cascade)
  sessions       Session[]

  @@map("tache")
}

model Session {
  id              Int       @id @default(autoincrement()) @map("id_session")
  focusPoint      String?   @map("focus_point")
  durationMinutes Int       @map("duration_minutes")
  difficulty      String    @default("moyen")                    // facile | moyen | difficile
  selfRating      Int?      @map("self_rating")                  // 1..5 (auto-évaluation)
  xpEarned        Int       @default(0) @map("xp_earned")
  createdAt       DateTime  @default(now()) @map("created_at")
  objectifId      Int       @map("objectif_id")
  objectif        Objectif  @relation(fields: [objectifId], references: [id], onDelete: Cascade)
  tacheId         Int?      @map("tache_id")
  tache           Tache?    @relation(fields: [tacheId], references: [id], onDelete: SetNull)
  feedback        Feedback?

  @@map("session")
}

model Feedback {
  id         Int      @id @default(autoincrement()) @map("id_feedback")
  notes      String?
  mediaUrl   String?  @map("media_url")
  correction String?
  createdAt  DateTime @default(now()) @map("created_at")
  sessionId  Int      @unique @map("session_id")
  session    Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("feedback")
}
```

---

## 6. Logique de gamification — `server/src/services/gamification.js`

> Implémentation de référence. `totalXp` = XP accumulée **dans le niveau courant** (pour afficher « 1240 / 1800 »).

```js
const XP_PER_MIN = 2;
const DIFFICULTY_MULT = { facile: 1.0, moyen: 1.25, difficile: 1.5 };
const VALIDATION_XP = { facile: 500, moyen: 1000, difficile: 2000 };

// XP d'une session
function sessionXp({ durationMinutes, difficulty, hasFeedback }) {
  const dm = DIFFICULTY_MULT[difficulty] ?? 1;
  const fb = hasFeedback ? 1.5 : 1;
  return Math.round(durationMinutes * XP_PER_MIN * dm * fb);
}

// XP de validation d'un objectif
function validationXp(difficulty) {
  return VALIDATION_XP[difficulty] ?? VALIDATION_XP.moyen;
}

// Seuil du niveau courant
function xpToNextLevel(level) {
  return Math.round(100 * Math.pow(level, 1.6));
}

// Applique un gain d'XP à un domaine, gère les montées de niveau multiples.
// Retourne le nouvel état à persister + info de level up.
function applyXpToDomaine(domaine, gainedXp) {
  let level = domaine.level;
  let xp = domaine.totalXp + gainedXp;
  let threshold = xpToNextLevel(level);
  const newLevels = [];
  while (xp >= threshold) {
    xp -= threshold;
    level += 1;
    newLevels.push(level);
    threshold = xpToNextLevel(level);
  }
  return {
    level,
    totalXp: xp,
    xpToNextLevel: threshold,
    leveledUp: newLevels.length > 0,
    newLevels,
  };
}

// % vers la maîtrise (10 000 h = 600 000 min)
function masteryPercent(totalMinutes) {
  return (totalMinutes / 600000) * 100;
}

module.exports = {
  sessionXp, validationXp, xpToNextLevel, applyXpToDomaine, masteryPercent,
};
```

**Règles d'orchestration**
- `POST /objectifs/:id/sessions` : calcule `sessionXp`, crée la session, puis `applyXpToDomaine` + `domaine.totalMinutes += durationMinutes`. Renvoie l'XP gagnée + un éventuel level up. *(hasFeedback = false à la création ; si un feedback est ajouté ensuite, on applique le bonus différentiel ×1.5 sur cette session.)*
- `PATCH /objectifs/:id/validate` : passe `status = "valide"`, `validatedAt = now()`, applique `validationXp(difficulty)` au domaine, vérifie level up.

---

## 7. Contrat d'API REST

Base URL : `/`. Toutes les routes sauf `/auth/*` exigent l'en-tête `Authorization: Bearer <jwt>`.

| Méthode | Route | Description |
| --- | --- | --- |
| POST | `/auth/register` | Inscription → `{ user, token }` |
| POST | `/auth/login` | Connexion → `{ user, token }` |
| GET | `/me/stats` | Niveau global, heures cumulées |
| GET | `/domaines` | Liste des domaines de l'utilisateur |
| POST | `/domaines` | Créer un domaine |
| GET | `/domaines/:id` | Détail (+ objectifs) |
| PUT | `/domaines/:id` | Modifier |
| DELETE | `/domaines/:id` | Supprimer |
| POST | `/domaines/:id/objectifs/suggestions` | **IA** : liste d'objectifs SMART proposés |
| POST | `/ai/objectifs/refine` | **IA** : raffine un objectif brut en SMART |
| POST | `/domaines/:id/objectifs` | Créer un objectif |
| GET | `/objectifs/:id` | Détail (+ tâches + sessions) |
| PUT | `/objectifs/:id` | Modifier (ex : `currentValue`) |
| PATCH | `/objectifs/:id/validate` | Valider → gros gain d'XP |
| DELETE | `/objectifs/:id` | Supprimer / abandonner |
| POST | `/objectifs/:id/taches/generate` | **IA** : génère le plan de tâches |
| GET | `/objectifs/:id/taches` | Liste des tâches |
| PATCH | `/taches/:id` | Modifier / cocher (`status`) |
| POST | `/objectifs/:id/sessions` | Logger une session (durée + difficulté + auto-éval) → XP |
| GET | `/objectifs/:id/sessions` | Historique |
| POST | `/sessions/:id/feedback` | Ajouter un feedback (+ bonus XP) |

**Exemples de payloads**

```jsonc
// POST /domaines
{ "name": "Code", "description": "Devenir dev mobile" }

// POST /domaines/:id/objectifs   (après raffinage IA, ou objectif manuel)
{
  "title": "Développer & publier une app mobile React Native en 30 jours",
  "metricLabel": "app publiée", "unit": null,
  "targetValue": 1, "difficulty": "difficile",
  "deadline": "2026-07-30", "rawInput": "créer une app mobile dans 1 mois",
  "aiRefined": true
}

// POST /objectifs/:id/sessions
{ "durationMinutes": 45, "difficulty": "moyen", "selfRating": 4, "tacheId": 3 }
// → réponse : { "session": {...}, "xpEarned": 112, "leveledUp": false, "domaine": {...} }
```

---

## 8. Intégration IA — `server/src/services/ai.js` (le cœur du projet)

L'IA fait trois choses : **proposer** des objectifs, **raffiner** un objectif libre, **générer** le plan de tâches. Toujours backend, toujours sortie JSON validée.

### 8.1 Schémas Zod — `server/src/validation/schemas.js`

```js
const { z } = require("zod");
const Difficulty = z.enum(["facile", "moyen", "difficile"]);

// Mode JSON des LLM => on enveloppe les listes dans un objet.
const SuggestionsOut = z.object({
  objectifs: z.array(z.object({
    title: z.string().min(3),
    metric_label: z.string(),
    unit: z.string().nullable().optional(),
    target_value: z.number(),
    difficulty: Difficulty,
    deadline_suggeree: z.string(), // ISO "YYYY-MM-DD"
  })).min(3).max(6),
});

const RefineOut = z.object({
  title: z.string().min(3),
  metric_label: z.string(),
  unit: z.string().nullable().optional(),
  start_value: z.number().nullable().optional(),
  target_value: z.number(),
  difficulty: Difficulty,
  deadline: z.string(),       // ISO
  faisabilite: z.string(),    // courte note réaliste
});

const TasksOut = z.object({
  taches: z.array(z.object({
    order_index: z.number().int(),
    title: z.string().min(2),
    description: z.string().optional().default(""),
    est_duration_min: z.number().int().nullable().optional(),
  })).min(3).max(20),
});

module.exports = { Difficulty, SuggestionsOut, RefineOut, TasksOut };
```

### 8.2 Appel LLM générique + retry

```js
const PROVIDER = process.env.AI_PROVIDER || "ollama";

async function callLlmJson(system, user) {
  if (PROVIDER === "ollama") {
    const res = await fetch(`${process.env.OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL,
        format: "json",
        stream: false,
        keep_alive: "10m",
        options: {
          temperature: 0.2,
          num_predict: 900,
        },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    return JSON.parse(data.message.content);
  }
  // Mistral cloud (optionnel)
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Mistral ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// Valide la sortie ; 1 retry si le JSON ne respecte pas le schéma.
async function generateValidated(system, user, schema) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callLlmJson(system, user);
      return schema.parse(raw);
    } catch (e) {
      if (attempt === 1) throw new Error(`IA: sortie invalide (${e.message})`);
    }
  }
}
```

### 8.3 Les trois fonctions IA (avec prompts)

```js
const { SuggestionsOut, RefineOut, TasksOut } = require("../validation/schemas");

const JSON_RULE =
  "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans backticks.";

async function suggestObjectives({ domaine, niveau = "débutant" }) {
  const system = `Tu es un coach expert en pratique délibérée. ${JSON_RULE}`;
  const user = `Domaine: "${domaine}". Niveau: ${niveau}.
Propose 3 à 5 objectifs SMART progressifs (du plus simple au plus ambitieux), réalistes et mesurables.
Format STRICT: {"objectifs":[{"title","metric_label","unit","target_value","difficulty","deadline_suggeree"}]}.
"difficulty" ∈ facile|moyen|difficile. "deadline_suggeree" au format YYYY-MM-DD (réaliste à partir d'aujourd'hui).`;
  return (await generateValidated(system, user, SuggestionsOut)).objectifs;
}

async function refineObjective({ domaine, objectifBrut }) {
  const system = `Tu es un coach qui transforme un objectif vague en objectif SMART réaliste. ${JSON_RULE}`;
  const user = `Domaine: "${domaine}". Objectif brut de l'utilisateur: "${objectifBrut}".
Reformule-le en objectif SMART cohérent et atteignable.
Format STRICT: {"title","metric_label","unit","start_value","target_value","difficulty","deadline","faisabilite"}.
"difficulty" ∈ facile|moyen|difficile. "deadline" au format YYYY-MM-DD. "faisabilite": 1 phrase honnête.`;
  return await generateValidated(system, user, RefineOut);
}

async function generateTasks({ objectif }) {
  const system = `Tu es un coach qui découpe un objectif en étapes concrètes (pratique délibérée). ${JSON_RULE}`;
  const user = `Objectif: ${JSON.stringify(objectif)}.
Découpe-le en 5 à 12 tâches ORDONNÉES, concrètes et actionnables, chacune ciblant une compétence précise.
Format STRICT: {"taches":[{"order_index","title","description","est_duration_min"}]}.
"order_index" commence à 1. "est_duration_min" = estimation en minutes.`;
  return (await generateValidated(system, user, TasksOut)).taches;
}

module.exports = { suggestObjectives, refineObjective, generateTasks };
```

Côté route, après `generateTasks`, persister chaque tâche (`createMany`) reliée à l'objectif avec `isAiGenerated: true`.

---

## 9. Frontend — écrans à construire

1. **Login / Register** — formulaires, stockage du JWT (mémoire + `localStorage`), redirection dashboard.
2. **Dashboard** — domaine principal en avant : niveau, barre d'XP (`totalXp / xpToNextLevel`), barre 10 000h (`masteryPercent`), objectifs en cours. Boutons « + Domaine », « + Objectif ».
3. **Détail domaine** — barre 10 000h, liste des objectifs (en cours / validés).
4. **Création d'objectif (clé IA)** — à l'ouverture, appeler `…/objectifs/suggestions` et afficher la liste. Champ libre + bouton « Raffiner (IA) » → `…/refine` → afficher le résultat SMART → « Créer » (POST objectif) → « Générer le plan (IA) » → afficher la roadmap.
5. **Détail objectif** — plan de tâches (cases à cocher → `PATCH /taches/:id`), formulaire « Logger une session » (durée + difficulté + auto-éval), bouton « Valider l'objectif » → écran de récompense (XP, level up).

Notes UI : afficher des **états de chargement** sur les appels IA (quelques secondes). Animations de gain d'XP appréciées mais non bloquantes. Utiliser TanStack Query pour le cache/refetch.

---

## 10. Conventions

- **Erreurs API** : JSON `{ "error": "message" }` + status HTTP correct (400 validation, 401 auth, 404, 502 pour échec IA).
- **Validation** : un schéma Zod par endpoint qui écrit des données ; rejeter tôt.
- **Auth** : middleware qui vérifie le Bearer, attache `req.userId`. Toujours vérifier que la ressource appartient à `req.userId` (un user ne touche que ses domaines/objectifs).
- **Sécurité** : hash des mots de passe avec `bcrypt`. Jamais de secret commité. Jamais d'XP envoyée par le client.
- **Nommage** : modèles Prisma en `PascalCase`, colonnes DB en `snake_case` (mappées), routes en `kebab/snake` comme dans le contrat.

---

## 11. Démarrage — premières tâches (à exécuter dans l'ordre)

> Coche au fur et à mesure. Cette section peut être supprimée une fois le scaffold terminé.

- [x] **Phase 0 — Scaffold**
  - [x] Créer `server/` : `npm init`, installer `express cors dotenv jsonwebtoken bcrypt zod @prisma/client` + dev `prisma nodemon`.
  - [x] Créer `client/` : React/Vite, installer `react-router-dom @tanstack/react-query`, configurer Tailwind CSS v4.
  - [x] Écrire `server/prisma/schema.prisma` en SQLite, `prisma migrate dev --name init`.
  - [x] `.env.example` (front + back), `.gitignore` (node_modules, .env, dist, SQLite local).
  - [x] Booter Express (`/health` qui renvoie `{ ok: true }`) et l'app React.
- [x] **Phase 1 — Auth** : `/auth/register`, `/auth/login` (bcrypt + JWT), middleware auth, pages Login/Register.
- [x] **Phase 2 — Domaines** : CRUD API `/domaines` + Dashboard (cartes) + Détail domaine. UI édition/suppression à compléter si besoin.
- [x] **Phase 3 — IA objectifs** : `services/ai.js` + schémas Zod, routes `…/objectifs/suggestions` et `/ai/objectifs/refine`, UI de création d'objectif avec Ollama local.
- [x] **Phase 4 — IA tâches** : `…/taches/generate` (persiste les tâches), affichage roadmap, `PATCH /taches/:id` (cocher).
- [x] **Phase 5 — Sessions + XP** : `POST /objectifs/:id/sessions` (gamification serveur), écran de récompense, MAJ dashboard.
- [x] **Phase 6 — Validation + gamification** : `PATCH /objectifs/:id/validate` (gros gain), level up, barre 10 000h, `/me/stats`.
- [ ] **Phase 7 — Polish** : design Tailwind, états de chargement IA, responsive, feedback optionnel (+bonus XP), suggestion du prochain objectif, robustesse API.

**Commence par la Phase 0.** Mets en place le monorepo, le schéma Prisma et la migration, puis confirme que les deux apps démarrent avant de passer à l'auth.
