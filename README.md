# Présentation

Running Club est une application web de coaching en course à pied. Elle permet à un utilisateur de définir un objectif, de générer un plan d'entraînement et de suivre sa progression sous forme de niveaux.

Documentation complète (activités 1 à 10) : [Running Club sur Notion](https://plain-ant-39c.notion.site/Running-Club-a578fef1b0fc825394a90136b319efcf).

# Fonctionnalités principales

- Création de compte et connexion.
- Définition d'un objectif sportif en langage naturel.
- Transformation de l'objectif en objectif SMART grâce à l'IA.
- Génération déterministe d'un plan d'entraînement.
- Progression séance par séance.
- Gain d'XP et évolution du niveau.
- Suivi des performances et des prédictions (formule de Riegel).
- Rôles `user` / `admin` et routes d'administration protégées.

# Stack technique

- Frontend : React, Vite, React Router, TanStack Query et Tailwind CSS.
- Backend : Node.js et Express.
- Base de données : SQLite avec Prisma ORM.
- Authentification : JWT et bcryptjs.
- Validation : Zod.
- IA locale : Ollama avec `llama3.2:3b`.

# Prérequis

- Node.js.
- npm.
- Ollama.
- Le modèle `llama3.2:3b` installé dans Ollama.

# Installation

```bash
cd client && npm install
cd ../server && npm install
```

# Lancement automatique

```bash
./start.sh
```

Le script démarre Ollama, le serveur Express et le client React.

# Lancement manuel

Dans trois terminaux différents :

```bash
ollama serve
```

```bash
cd server
npm run dev
```

```bash
cd client
npm run dev
```

# Variables d'environnement

Créer un fichier `.env` dans le serveur avec les variables nécessaires, par exemple :

```
DATABASE_URL="file:./dev.db"
JWT_SECRET="secret-a-remplacer"
OLLAMA_URL="http://localhost:11434"
OLLAMA_MODEL="llama3.2:3b"
```

# Comptes de démonstration

```bash
cd server && npm run db:seed
```

Crée trois coureurs (`lucas@test.local`, `emma@test.local`, `hugo@test.local`, mot de passe `Test123!`) et un administrateur (`admin@coach.local` / `admin123!`).

# Tests

```bash
cd server && npm test
```
