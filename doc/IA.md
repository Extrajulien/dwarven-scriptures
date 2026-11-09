# IA — Outils utilisés et retour d'expérience

## Outils et agents utilisés

* **DeepSeek (V4) piloté par DeepSeek Harness (DSH)** : l'assistant de
  développement principal du projet. Le travail est orchestré de façon
  **hiérarchique** : un agent **Root** découpe chaque phase en unités, délègue
  à des **Sub-Planners** (SP-1A/B/C…) qui exécutent à leur tour des
  **agents-workers** spécialisés, puis valide leur production à des
  **portes de contrôle** (gates) avant de passer à la phase suivante.
* **stitch.ai** : utilisé pour produire des maquettes (« drafts ») de
  l'interface avant de solidifier certains écrans en composants TSX
  (approche documentée dans l'ADR-007).
* **Outils exécutés par les agents** : Jest + Testing Library (tests
  unitaires), Playwright (suite E2E, audits d'accessibilité en navigateur réel
  et captures d'écran), ESLint / `tsc --noEmit` (qualité), Lighthouse
  (PERF-01), la CLI **Railway** et son API GraphQL (déploiement et
  migrations de production, TECH-05), ainsi que des fumées indépendantes
  (`curl`, scripts WebSocket jetables, vérifications `psql`).

## Fichiers d'instructions commités

* [`AGENTS.md`](../AGENTS.md) — conventions du projet données aux agents :
  architecture, domaine (machine à états, formules de l'annexe A), sécurité,
  git (commits atomiques en Conventional Commits, jamais de push), et
  l'exigence de tenir [`doc/EXIGENCES.md`](EXIGENCES.md) honnête.

## Trois situations où l'IA s'est trompée

### 1. SP-2C — le mode d'erreur « libre » (CONF-08) interprété comme bloquant

SP-2C a implémenté la zone de frappe en rendant le mode `accumulate` (erreur
libre) **bloquant**, comme le mode `stop` : une faute arrêtait le curseur au
lieu d'être comptabilisée et dépassée. C'était une contradiction directe avec
CONF-08, qui exige deux comportements réellement distincts.

**Détection** : la porte de contrôle du Root, qui relit la spécification
(EXIGENCES) et compare le comportement implémenté à l'exigence — pas seulement
aux tests écrits par le même agent.

**Correction** : reprise complète du réducteur de frappe
(`src/lib/race/typing.ts`) : en `accumulate`, la faute est marquée en rouge et
le curseur avance librement ; pour terminer, le joueur doit revenir corriger
chaque faute (le préfixe validé n'atteint la fin qu'une fois tout corrigé),
sinon la limite de temps s'applique. Le mode `stop` bloque le curseur jusqu'à
la bonne touche. Le choix est documenté dans la section « Choix à documenter »
d'EXIGENCES.md et verrouillé par tests.

### 2. SP-1C — le salon répondait 500 sur un identifiant de salle malformé

SP-1C a câblé la page de salon `/rooms/[publicId]` sans valider le paramètre :
un UUID malformé faisait lever une exception de validation (Zod) dans la
requête de salle, qui se transformait en **erreur 500** au lieu d'une réponse
contrôlée.

**Détection** : la fumée `curl` **indépendante** du Root (un test manuel hors
de la suite écrite par SP-1C) qui a appelé `/rooms/pas-un-uuid` et obtenu un
500.

**Correction** : validation du paramètre `publicId` en amont de la requête ;
un identifiant malformé (ou une salle inconnue) répond désormais **404** avec
la page « introuvable », sans faire tomber la requête — comportement couvert
par test depuis.

### 3. SP-3B — le fumée en direct a fait déborder `user_stats.bestWpm`

Lors de la fumée de persistance en direct (course scriptée par WebSocket puis
contrôle des lignes en base), une **course très courte** a produit un MPM
légitimement énorme selon l'annexe A (une poignée de caractères en quelques
millisecondes), qui a dépassé la capacité de la colonne
`user_stats.bestWpm numeric(6,2)` : l'écriture a échoué en base.

**Détection** : la fumée de persistance elle-même (vérification des
compteurs `user_stats` après la course), qui a révélé l'erreur de contrainte
plutôt que de la laisser dormir dans les journaux.

**Correction** : élargissement **additif** de la colonne en `numeric(8,2)`
(migration `0005_gorgeous_lady_ursula.sql`, aucune donnée perdue) **et**
défense à la frontière de stockage (`clampPersistedWpm` : les valeurs non
finies ou hors capacité sont bornées — une course de 0 ms devient 0, et
`GREATEST` conserve alors l'ancien record). Le choix est documenté dans
EXIGENCES.md et testé.

## Réflexion sur le travail avec les agents

* **La hiérarchie ne suffit pas, il faut des portes** : chaque agent exécute
  correctement *ce qu'il a compris* ; les portes du Root, qui relisent la
  spécification plutôt que la production de l'agent, ont attrapé les erreurs
  les plus coûteuses (cas 1).
* **La vérification indépendante compte plus que la confiance** : les fumées
  `curl`, les scripts WebSocket jetables et les contrôles `psql` — exécutés par
  un autre acteur que celui qui a écrit le code — ont débusqué des bugs que
  les tests unitaires de l'auteur ne voyaient pas (cas 2 et 3).
* **L'honnêteté de la matrice est l'outil de pilotage** : la règle de
  `doc/EXIGENCES.md` (« ne jamais cocher une exigence non réellement
  terminée ») a forcé chaque phase à documenter ce qui manquait réellement
  (ex. les parties humaines de la démarche créative), ce qui rend l'état du
  projet lisible pour l'humain et pour le correcteur.
* **La documentation comme contrat** : `AGENTS.md`, les ADR et les notes
  « Choix à documenter » ont permis aux agents successifs de reprendre le
  travail des précédents sans divergence — au prix de maintenir ces documents
  à jour à chaque phase, ce qui a été fait à chaque commit.
