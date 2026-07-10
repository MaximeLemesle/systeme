# Coach Course à Pied

Application de coaching course à pied : un plan d'entraînement généré depuis des templates de séances, ajusté à l'objectif du coureur, avec gamification (XP, niveaux). Mono-domaine : la course à pied uniquement.

## Language

**Domaine** :
Support de gamification (niveau, XP, minutes cumulées) d'un utilisateur. Unique et auto-créé (« Course à pied ») ; n'est plus un concept manipulable par l'utilisateur.
_Avoid_ : catégorie, discipline

**Objectif** :
La cible du coureur, définie par un archétype, une distance de référence, une échéance, et éventuellement un temps cible et un niveau de départ.

**Archétype** :
La famille d'objectif qui détermine la recette du plan. Deux valeurs : **chrono** (temps cible sur une distance connue — l'allure progresse) et **complétion** (couvrir une distance jamais faite — le volume progresse, l'allure reste facile).
_Avoid_ : type d'objectif, objectiveType (endurance/distance/regularite)

**Recette** :
La séquence pondérée de templates de séances propre à un archétype, déroulée par le générateur de plan.

**Template de séance** :
Modèle de séance type issu des programmes d'entraînement réels. Catalogue fermé à 8 : `test_reference`, `ef` (endurance fondamentale), `marche_course`, `vo2_court` (30/30 uniquement), `seuil`, `allure_specifique`, `sortie_longue`, `objectif`. Le générateur l'instancie en séance concrète en fixant allures, répétitions et durées.

**VMA** :
Vitesse maximale aérobie estimée depuis le temps de référence du coureur (via Riegel). Toutes les zones d'allure des templates s'expriment en % de VMA.

**Séance** :
Une étape concrète et mesurable du plan (instance d'un template avec cibles chiffrées), ordonnée et rattachée à une semaine. Stockée dans le modèle `Tache`.
_Avoid_ : tâche (dans le discours produit)

**Plan** :
Liste plate et ordonnée de séances groupées par index de semaine. Taille = semaines avant échéance × fréquence hebdo (plafonnée). Pas de dates réelles ni de replanification.

**Fréquence hebdo** :
Nombre de séances par semaine choisi par le coureur à l'intake (défaut 3).

**Intake** :
Conversation menée par le LLM pour recueillir les informations de l'objectif (échéance, cible, niveau de départ, fréquence hebdo). Seul usage génératif de l'IA ; le plan lui-même est calculé de façon déterministe côté serveur.

**Test de référence** :
Séance initiale mesurant le niveau de départ quand le coureur n'a pas de temps de référence.

**Session** :
Le compte-rendu d'une séance réellement effectuée (durée, difficulté, perf distance/temps), source d'XP et de la prédiction.

**Prédiction** :
Estimation déterministe de la progression vers l'objectif, recalculée à chaque perf loggée, côté serveur, jamais par le LLM. Chrono : meilleur temps équivalent (Riegel) sur la distance cible. Complétion : plus longue distance de séance loggée (la distance d'une séance compte en entier, pauses marche incluses).
