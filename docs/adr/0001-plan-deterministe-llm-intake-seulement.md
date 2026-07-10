# Génération de plan déterministe — le LLM ne sert qu'à l'intake

Le plan d'entraînement est calculé côté serveur par un générateur déterministe (`services/planGenerator.js`) qui séquence des templates de séances fixes (constantes JS) et calcule les allures par interpolation VMA/Riegel. Le LLM (Ollama local) ne génère jamais le contenu du plan : son seul rôle est la conversation d'intake qui recueille les paramètres de l'objectif.

Raison : le modèle local (`mistral`) échouait régulièrement sur les tâches chiffrées (allures, progressions, JSON structuré) — c'était la source des bugs multi-domaine. Un plan calculé est exact, reproductible, instantané et testable ; « voir une évolution réelle entre les séances » exige des chiffres interpolés, pas générés. Contrepartie assumée : l'IA est moins visible dans la démo. Le recalibrage des séances restantes après chaque perf loggée découle gratuitement de ce choix (relancer l'interpolation).

## Options écartées

- LLM assemble le plan depuis les templates fournis dans le prompt : non fiable localement, non testable.
- Hybride (chiffres calculés + textes LLM) : gardé comme évolution possible, non retenu pour la v1.
