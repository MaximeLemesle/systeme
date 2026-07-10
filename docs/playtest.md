# Plan de playtest — Running Club

> Livrable Activité 9 (sprint de finalisation). Objectif : valider le parcours principal auprès
> d'utilisateurs réels, mesurer la réussite et collecter les frictions, avant la démo.

## 1. Objectif du playtest

Vérifier qu'un coureur qui découvre l'application peut, **sans aide**, créer un objectif,
générer son plan, compléter une séance et comprendre sa progression. Le playtest cible
l'**utilisabilité** et la **stabilité**, pas la performance.

## 2. Profils de testeurs

| Profil | Description | Ce qu'on observe |
| --- | --- | --- |
| Débutant tech | À l'aise avec le web, pas avec le running | Compréhension du vocabulaire (VMA, allure, séances) |
| Coureur | Court déjà, découvre l'app | Crédibilité du plan et des allures proposées |
| Testeur « adversaire » | Cherche à casser l'app | Robustesse (double-clic, valeurs limites, refresh) |

Cible : **3 à 5 testeurs**, chacun sur une session de 10–15 min, à voix haute (*think aloud*).

## 3. Scénarios de test

Chaque scénario a un **résultat attendu** et un **critère de réussite** binaire (réussi / échoué).

| # | Scénario | Étapes | Critère de réussite |
| --- | --- | --- | --- |
| S1 | Inscription | Créer un compte depuis l'écran d'inscription | Redirigé vers le tableau de bord, connecté |
| S2 | Intake IA | Décrire « je veux courir 10 km en 50 min » et répondre au coach | Un objectif SMART est proposé en ≤ 4 questions |
| S3 | Génération du plan | Lancer la génération après création de l'objectif | Un plan de séances par semaines s'affiche |
| S4 | Complétion d'une séance | Ouvrir la séance du jour, saisir une perf, valider | XP gagnée + niveau/prédiction mis à jour à l'écran |
| S5 | Lecture de la progression | Retrouver son niveau, son XP et sa prochaine séance | L'utilisateur explique correctement où il en est |
| S6 | Session expirée | Rester inactif jusqu'à expiration / token invalide | Message « session expirée » + retour au login sans crash |
| S7 | Robustesse | Double-cliquer « Valider », saisir une durée aberrante | Pas de double XP ni de crash ; erreur claire |

## 4. Objectifs mesurables

| Indicateur | Cible | Comment le mesurer |
| --- | --- | --- |
| Taux de réussite S1→S5 sans aide | ≥ 80 % des testeurs | Grille d'observation (§5) |
| Temps pour créer un objectif (S2) | ≤ 3 min | Chronomètre |
| Nombre de blocages nécessitant une intervention | ≤ 1 par testeur | Grille d'observation |
| Crashs / erreurs non gérées | **0** | Console navigateur + logs serveur (`logs/backend.log`) |
| Compréhension de la progression (S5) | ≥ 4/5 testeurs | Question ouverte en fin de session |

## 5. Grille d'observation

À remplir **par testeur** (une ligne par scénario) :

| Scénario | Réussi (O/N) | Temps | Hésitations / blocages | Verbatim marquant | Bug observé |
| --- | --- | --- | --- | --- | --- |
| S1 | | | | | |
| S2 | | | | | |
| S3 | | | | | |
| S4 | | | | | |
| S5 | | | | | |
| S6 | | | | | |
| S7 | | | | | |

## 6. Instrumentation disponible

- **Console navigateur** : erreurs front (React, réseau) — ouvrir les DevTools pendant le test.
- **Logs serveur** : `logs/backend.log` (démarré par `./start.sh`) — erreurs 4xx/5xx et exceptions.
- **XP / niveau / prédiction** : visibles directement dans l'UI après chaque séance (retour immédiat).
- **Base de données** : `npx prisma studio` (server/) pour vérifier a posteriori sessions, XP et statuts.

> Piste d'amélioration (hors périmètre actuel) : ajouter des compteurs applicatifs
> (objectifs créés, séances complétées, taux d'abandon) pour automatiser ces mesures.

## 7. Préparation & sécurisation de la session

- Base préparée avec `npm run db:seed` (server/) : 3 comptes coureurs + 1 admin, mots de passe connus.
- Ollama lancé (`ollama serve` + modèle `llama3.2:3b`) — l'intake échoue sinon.
- Vérifier `./start.sh` : les 3 services (Ollama, backend, frontend) répondent avant le test.
- Prévoir un compte de secours déjà pourvu d'un objectif au cas où l'intake IA serait lent.

## 8. Après le playtest

1. Consolider les grilles d'observation.
2. Classer les problèmes par gravité (bloquant / majeur / mineur) et par fréquence.
3. Reporter les bloquants et majeurs en issues, priorisés (voir la backlog MoSCoW).
4. Rejouer les scénarios échoués après correction pour vérifier l'absence de régression.
