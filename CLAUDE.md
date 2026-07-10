# CLAUDE.md — Coach Course à Pied

## Produit

Application fullstack mono-domaine de coaching running. L'utilisateur définit un objectif, reçoit un plan d'entraînement déterministe, complète ses séances et progresse grâce à une gamification calculée côté serveur.

## Sources de vérité

1. `README.md` : fonctionnalités, API, installation et limites.
2. `docs/mcd-mld.md` : modèle de données.
3. `server/prisma/schema.prisma` : schéma exécutable.

En cas de contradiction, le code exécutable et le schéma Prisma priment, puis les ADR les plus récentes.

## Invariants

- Toute l'XP, les niveaux, les récompenses et le recalibrage sont calculés côté serveur.
- Le client n'envoie jamais un montant d'XP ni un rôle.
- L'inscription publique crée toujours un utilisateur avec le rôle `user`.
- Les routes admin utilisent l'authentification puis `requireRole("admin")`.
- L'IA sert uniquement à l'intake conversationnel.
- Toute sortie LLM est validée par Zod, avec un seul retry avant une erreur `502`.
- Le plan d'entraînement est généré par du code déterministe, pas par le LLM.
- Les secrets restent dans `.env` et ne sont jamais commités.
- Les ressources sont toujours filtrées par leur propriétaire ; une ressource étrangère renvoie `404`.
- La complétion d'une séance doit rester transactionnelle.
- Ne jamais exécuter `prisma migrate reset` sans demande explicite.

## Stack

- Client : React, Vite, React Router, TanStack Query, Tailwind CSS.
- Serveur : Node.js, Express, Prisma, SQLite, JWT, bcryptjs, Zod.
- IA locale : Ollama avec `llama3.2:3b`.

## Vérifications avant commit

```bash
cd server
npm test
npx prisma validate

cd ../client
npm run lint
npm run build
```

Utiliser des commits petits et explicites : `feat:`, `fix:`, `test:`, `docs:` ou `chore:`.
