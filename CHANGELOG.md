# Changelog

Toutes les évolutions notables du projet Running Club sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ;
versionnage [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- Compte administrateur créé par le seed (`admin@coach.local` / `admin123!`, surchargeable
  via `ADMIN_EMAIL` / `ADMIN_PASSWORD`) — seule façon d'obtenir le rôle `admin`.
- Pagination de `GET /objectifs/:id/sessions` (`page`, `limit`, réponse
  `{ data, page, limit, total, totalPages }`) avec `select` minimal.
- `ARCHITECTURE.md` : documentation technique (schéma, flux bout-en-bout, organisation du code).
- `docs/playtest.md` : plan de playtest (scénarios, objectifs mesurables, grille d'observation).
- Intégration continue GitHub Actions (`.github/workflows/ci.yml`) : tests serveur + lint/build client.
- Message « session expirée » sur l'écran de connexion après une déconnexion sur `401`.

### Modifié
- Cache TanStack Query : `staleTime` de 30 s pour éviter de relancer immédiatement les mêmes requêtes.
- README : titre aligné sur le nom du produit (« Running Club »).

## [0.1.0] — 2026-07-10

### Ajouté
- Authentification JWT (inscription, connexion, `bcryptjs`) avec rôles `user` / `admin`
  et middleware `requireRole`.
- Domaine « Course à pied » unique, créé automatiquement à l'inscription, support de la gamification.
- Intake conversationnel via IA locale (Ollama `llama3.2:3b`), sortie validée par Zod avec un retry.
- Génération **déterministe** du plan d'entraînement (catalogue de 8 types de séances, allures en % de VMA).
- Complétion d'une séance transactionnelle : session, calcul d'XP serveur, montée de niveau,
  prédiction Riegel et recalibrage des séances restantes.
- Validation d'un objectif avec gain d'XP unique ; abandon sans XP.
- Frontend React (Vite, React Router, TanStack Query, Tailwind) : connexion, inscription,
  tableau de bord avec carte de progression par niveaux.
- Modèle de données Prisma/SQLite (6 entités) et migrations ; documentation MCD/MLD et wireframes.
- Comptes de démonstration seedés (Lucas, Emma, Hugo — mot de passe `Test123!`).
- Collection Bruno pour tester l'API ; script `start.sh` de lancement des trois services.
- Sécurité : `helmet`, CORS restreint, rate-limit sur `/auth`, validation Zod, cloisonnement
  par propriétaire (`404` sur ressource étrangère), XP jamais acceptée du client.
- Tests d'intégration et unitaires (`node --test` + supertest).

[Non publié]: https://github.com/MaximeLemesle/systeme/compare/main...HEAD
[0.1.0]: https://github.com/MaximeLemesle/systeme/releases/tag/v0.1.0
