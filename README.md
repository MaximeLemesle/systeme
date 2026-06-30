# Système d'évolution

Application web de **pratique délibérée** : choisis un domaine (Code, Réflexion, Course…), laisse une **IA locale** transformer tes envies en objectifs SMART et générer un plan de tâches, puis logge tes sessions pour gagner de l'XP, monter de niveau et progresser vers les 10 000 h de maîtrise.

- **Front** : React (Vite) + React Router + TanStack Query + Tailwind CSS v4
- **Back** : Node + Express + Prisma + **SQLite** (zéro infra), Auth JWT, validation Zod
- **IA** : **100 % locale via [Ollama](https://ollama.com)** (modèle `mistral` par défaut). Aucune clé API, aucune donnée envoyée au cloud.

Toute la logique d'XP/niveau est calculée **côté serveur** (anti-triche) ; l'IA n'est appelée que depuis le backend.

---

## Prérequis

- Node.js 20.19+ ou 22.12+ (Vite 8 ; `.nvmrc` fourni avec Node 22)
- [Ollama](https://ollama.com) installé, avec un modèle :
  ```bash
  ollama pull mistral
  ```

## Démarrage

### Démarrage rapide

Depuis le dossier `systeme/` :

```bash
./start.sh
```

Arrêter Ollama, le backend et le frontend :

```bash
./stop.sh
```

### 1. Lancer Ollama

Installe le modèle local utilisé par défaut :

```bash
ollama pull mistral
```

Lance Ollama :

```bash
ollama serve
```

Arrêter Ollama :

```bash
pkill ollama
```

### 3. Installer et lancer le backend

Dans un nouveau terminal :

```bash
cd server
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

Vérif : `curl http://127.0.0.1:4000/health` → `{"ok":true}`

### 4. Installer et lancer le frontend

Dans un autre terminal :

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Ouvre ensuite **http://localhost:5173**, crée un compte, et lance-toi.

Si l'inscription affiche que l'API est inaccessible, vérifie que le backend est bien lancé et que `client/.env` contient :

```bash
VITE_API_URL="http://127.0.0.1:4000"
```

Après une modification de `client/.env`, redémarre `npm run dev` côté frontend.

## Relancer le projet ensuite

Une fois l'installation faite, tu n'as plus besoin de refaire `npm install`, `cp .env.example .env` ou `npx prisma migrate dev` à chaque lancement.

1. Vérifie qu'Ollama tourne déjà, ou lance `ollama serve`.
2. Lance le backend :
   ```bash
   cd server
   npm run dev
   ```
3. Lance le frontend :
   ```bash
   cd client
   npm run dev
   ```

---

## Parcours type

1. **Crée un domaine** (ex : `Code`).
2. **Nouvel objectif** → l'IA propose des objectifs SMART, ou écris le tien en langage libre (« créer une app mobile dans 1 mois ») et clique **Raffiner (IA)**.
3. Sur l'objectif, **Générer le plan (IA)** découpe l'objectif en tâches ordonnées.
4. **Logge une session** (durée + difficulté) → XP calculée par le serveur, montée de niveau animée.
5. **Valide l'objectif** → gros gain d'XP.

---

## ⚡ Vitesse de l'IA

Le modèle `mistral` (7B) tourne **en local** : selon la machine, une réponse IA peut prendre **~30 s à 2 min** (un bandeau de chargement l'indique dans l'UI). C'est normal pour un LLM local.

Pour des réponses **nettement plus rapides**, utilise un modèle plus léger — une seule ligne à changer dans `server/.env` :
```bash
ollama pull llama3.2:3b
# puis dans server/.env :
OLLAMA_MODEL="llama3.2:3b"
```

---

## Structure

```
systeme/
├── server/   # API Express + Prisma (SQLite) + services IA & gamification
└── client/   # App React (Vite) + Tailwind
```

Le contrat d'API complet et le modèle de données sont décrits dans [CLAUDE.md](CLAUDE.md).

## Réinitialiser la base

```bash
cd server
rm prisma/dev.db
npx prisma migrate dev
```
