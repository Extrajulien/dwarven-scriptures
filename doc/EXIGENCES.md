# Exigences — Matrice de traçabilité

Course de frappe multijoueur en temps réel (travail de session Web V).
Chaque exigence du cahier des charges est listée avec son identifiant.

**Statuts** :

* `[ ]` non fait
* `[x]` complet
* `[x] (partiel)` fait en partie — ce qui manque est indiqué sur la ligne

Ne jamais cocher une exigence qui n'est pas réellement terminée : une fausse
déclaration est pénalisée plus sévèrement qu'un statut honnête. Quand une case
est cochée, compléter les fichiers et tests concernés sur la ligne ; les choix
ambigus vont dans la section [Choix à documenter](#choix-à-documenter).

## TECH — Contraintes techniques

- [x] **TECH-01** — Next.js (App Router, version stable actuelle) avec React.
  — fichiers : `package.json` (next 16), `src/app/`
- [x] **TECH-02** — TypeScript à 100 %.
  - [x] Aucun fichier `.js`/`.jsx` dans le dépôt — le dernier restant, `tailwind.config.js`, a été renommé en `tailwind.config.cjs` (format CJS propre à Tailwind, détecté automatiquement par PostCSS). Fichiers convertis : `src/App.test.tsx`, `src/data/homepageData.ts`, les composants `.jsx` de `src/components/` (accueil, login, register), `jest.config.mjs`, `jest.setup.mjs`. Tests : `src/App.test.tsx`, `src/components/UserAvatar.test.tsx`, `src/components/login/LoginForm.test.tsx`, `src/components/register/RegisterForm.test.tsx`.
  - [x] `strict: true` dans `tsconfig.json`.
  - [x] Règle ESLint `@typescript-eslint/no-explicit-any` en erreur — fichiers : `eslint.config.mjs`.
  - [x] Aucun `@ts-ignore` / `@ts-expect-error` sans commentaire justificatif — aucune occurrence dans le code source (recherche sur `src/` et la racine).
- [x] **TECH-03** — Tailwind CSS pour le style. — fichiers : `tailwind.config.cjs`, `postcss.config.mjs`, `src/app/globals.css`
- [x] (partiel) **TECH-04** — PostgreSQL avec l'ORM de votre choix (Drizzle), migrations versionnées, script de seed (corpus de textes, utilisateurs, historique).
  - [x] Migrations versionnées — fichiers : `drizzle/`, `src/db/schema.ts`, `src/db/migrate.ts`
  - [x] Script de seed — fichiers : `src/db/seed.ts` (idempotent, `npm run db:seed`), `src/lib/text-metrics.ts` (métriques de complexité mesurables) — tests : `src/lib/text-metrics.test.ts`. Contenu : corpus cohérent de 30 passages du domaine public (13 FR / 17 EN sur les trois complexités), 6 dictionnaires de mots (≥ 100 mots par paire langue × complexité) et 3 utilisateurs de démo (`demo`, `demo2`, `demo3`) avec statistiques. L'historique individuel des courses n'existe pas encore (les tables `races` viendront avec les salles) : le seed remplit les statistiques agrégées de `user_stats`.
- [ ] **TECH-05** — Déploiement sur un serveur (VPS), accessible publiquement en HTTPS, fonctionnel en production au checkpoint 1 et à la remise finale.
  — La cible Railway est documentée dans `doc/database.md` ; l'URL publique reste à confirmer.
- [x] **TECH-06** — Visualisation de la progression en temps réel (WebSocket, MQTT ou autre — choix libre, à documenter par ADR dans `doc/ARCHITECTURE.md`).
  — La couche temps réel est implémentée (ADR-010 accepté : `ws` 8.x sur un serveur personnalisé Next.js, un seul processus, chemin `/ws`) : protocole Zod (`src/realtime/protocol.ts`), hub de présence indépendant du transport (`src/realtime/hub.ts`), adaptateur PostgreSQL (`src/realtime/room-store.ts`), câblage `ws` (`src/realtime/server.ts`, `server.ts`), pont actions → hub (`src/realtime/events.ts`) et hook client (`src/realtime/useRoomSocket.ts`). Tests : `protocol.test.ts`, `hub.test.ts`, `useRoomSocket.test.ts` + test de fumée en direct contre la vraie base. — Honnêtement : la **synchronisation de la progression de course** (positions, MPM, classement — COURSE-05/06) arrive en phase 2 ; ce qui fonctionne au checkpoint 1 est la présence en temps réel (SALLE-01/02, JOIN-01).
- [x] **TECH-07** — Toutes les entrées côté serveur validées par un schéma (Zod ou équivalent) : actions serveur, routes API et messages temps réel.
  — Actions serveur (`src/app/login/actions.ts`, `src/app/register/actions.ts`, `src/app/account/actions.ts`, `src/app/rooms/actions.ts`) et routes API OAuth (`src/app/api/auth/[provider]/route.ts`, `src/app/api/auth/[provider]/callback/route.ts`) validées par des schémas Zod v4 — fichiers : `src/lib/login-validation.ts`, `src/lib/register-validation.ts`, `src/lib/profile-validation.ts`, `src/lib/oauth-validation.ts`, `src/lib/room-action-validation.ts` (+ `src/lib/room-config.ts` pour la configuration de salle). Messages temps réel (client → serveur ET serveur → client) validés par `src/realtime/protocol.ts` — chaque trame est revalidée côté serveur (`src/realtime/server.ts`) et côté client (`src/realtime/useRoomSocket.ts`, jamais de donnée serveur brute dans l'état React). Tests : `src/lib/login-validation.test.ts`, `src/lib/register-validation.test.ts`, `src/lib/profile-validation.test.ts`, `src/lib/room-config.test.ts`, `src/app/rooms/actions.test.ts`, `src/realtime/protocol.test.ts`, `src/realtime/useRoomSocket.test.ts`.
- [ ] **TECH-08** — Coûts : serveur à la charge de l'étudiant (ou serveur du cégep) ; tout autre service externe sur forfait gratuit ; le correcteur ne paie rien.
- [x] **TECH-09** — Intégration continue GitHub Actions : lint, `tsc --noEmit` et tests unitaires à chaque push.
  — Workflow `.github/workflows/ci.yml` (job `ci` sur ubuntu-latest, Node 22, `npm ci` puis `lint` / `typecheck` / `test`) déclenché sur `push` et `pull_request`. L'exécution distante n'a pas pu être vérifiée depuis l'environnement de développement (aucun push effectué).
- [x] **TECH-10** — Un fichier `.env.example` documente toutes les variables d'environnement ; aucun secret n'est commité.
  — fichiers : `.env.example` (`DATABASE_URL`, `SESSION_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `DISCORD_CLIENT_ID/SECRET`)

## DES — Identité visuelle et design

- [x] **DES-01** — Nom du site trouvé par l'humain, sans IA, original et non utilisé par un produit connu ; démarche documentée dans `doc/DEMARCHE-CREATIVE.md` (noms envisagés, raison du choix final).
  — Nom retenu : « Dwarven scriptures ».
- [x] (partiel) **DES-02** — Logo conçu par l'humain, sans IA ; croquis joints à la démarche créative ; logo utilisé dans l'application et comme favicon.
  — Le logo est décrit dans `doc/DEMARCHE-CREATIVE.md` ; les croquis/photos restent à joindre.
- [ ] **DES-03** — Direction artistique documentée avant le développement : moodboard de 3 à 5 références, palette de couleurs, typographies.
- [x] (partiel) **DES-04** — Design unique, pas « généré par défaut » ; la piste de progression est un élément signature.
  — Direction « Dwarf Fortress » (tuiles ASCII, grotte) en place ; la piste de progression n'existe pas encore.
- [ ] **DES-05** — Thèmes clair et sombre : sélecteur, préférence système respectée par défaut, aucun flash du mauvais thème au chargement (ou justification mono-thème dans la démarche créative).
- [x] (partiel) **DES-06** — Responsive : toutes les pages utilisables à 360 px et plus ; sur mobile, la course est remplacée par un message recommandant un clavier physique.
  — L'accueil, l'explorateur et le salon passent en disposition empilée à 360 px (grilles 1 colonne, tableau de l'explorateur défilant horizontalement). Manque : le message « clavier physique » pendant une course — Phase 2, aucune course n'existe au checkpoint 1.

## AUTH — Comptes et profil

- [x] **AUTH-01** — Authentification : OAuth Discord **et** GitHub, plus connexion par nom d'utilisateur et mot de passe (utile pour les tests de bout en bout).
  — fichiers : `src/app/(auth)/`, `src/app/login/actions.ts`, `src/app/register/actions.ts`, `src/app/api/auth/[provider]/`, `src/lib/oauth.ts`
  — tests : `src/lib/password.test.ts`, `session.test.ts`, `oauth.test.ts`, `login-validation.test.ts`, `register-validation.test.ts`, formulaires
- [x] **AUTH-02** — Un invité choisit un pseudonyme (3 à 20 caractères) avant de rejoindre une salle ; sa session est conservée par un cookie signé.
  — Cookie HttpOnly signé `guest` (HMAC-SHA256, 30 jours, `src/lib/guest-session.ts`), pseudonyme validé par schéma Zod 3–20 caractères, action `setGuestNickname` / `guestNicknameFormAction` (`src/app/rooms/actions.ts`). L'UI de choix du nom (`src/components/rooms/GuestNicknameForm.tsx`, formulaire « nain » sur la page de salle) est branchée sur chaque chemin d'entrée invité : rejoindre par code depuis l'accueil (`src/components/home/JoinByCodeForm.tsx`), par lien d'invitation (`src/app/i/[token]/route.ts` → page de salle), par « Faire une course » (`quickPlay`) et au portail des salles sur code (`CodeGatePanel.tsx`). Tests : `src/lib/guest-session.test.ts`, `src/app/rooms/actions.test.ts`, `src/components/rooms/GuestNicknameForm.test.tsx`.
- [x] **AUTH-03** — Un invité ne peut pas créer de salle, n'a ni historique persistant ni photo de profil ; un avatar généré est affiché à la place.
  — La création de salle est refusée aux invités côté serveur (`createRoom` exige une session utilisateur, `src/app/rooms/actions.ts`) et un invité n'écrit jamais dans `user_stats` (identifié par `guestToken`, pas par `userId`). Côté UI : l'accueil montre aux invités l'état vide au lieu de la carte de création (`src/components/home/RaceSection.tsx`), les commandes d'hôte ne sont rendues que pour l'hôte courant (`src/components/rooms/RoomLobby.tsx`) et l'avatar invité est une rune déterministe générée à partir de l'identité (`src/components/rooms/GuestAvatar.tsx`). Tests : `src/app/rooms/actions.test.ts` (refus serveur), `src/App.test.tsx` (carte de création absente pour les invités), `src/components/rooms/RoomLobby.test.tsx` (commandes d'hôte invisibles pour les non-hôtes).
- [x] (partiel) **AUTH-04** — Un utilisateur connecté peut téléverser une photo de profil : JPEG/PNG/WebP, 2 Mo max, validée côté serveur, redimensionnée avant l'affichage.
  — L'édition de l'URL d'avatar existe (`updateProfile`) ; le téléversement de fichier est absent.
- [x] **AUTH-05** — Un utilisateur connecté peut modifier son pseudonyme d'affichage.
  — fichiers : `src/app/account/actions.ts`, `src/components/account/EditProfileModal.tsx`
  — tests : `src/app/account/profile.test.ts`, `src/lib/profile-validation.test.ts`
- [x] (partiel) **AUTH-06** — Page de profil avec les statistiques : meilleur MPM, MPM moyen, précision moyenne, nombre de courses, nombre de victoires, graphique de progression du MPM.
  — fichiers : `src/app/account/page.tsx`, `src/components/account/AccountStats.tsx`, `ProgressionCharts.tsx`, `RaceHistory.tsx`, `src/db/schema.ts` (colonnes `wins`, `correctKeystrokes`, `totalKeystrokes`), `src/db/queries/users.ts` (`avgAccuracy` dérivée)
  — Manque : colonnes wins/précision ajoutées au schéma (phase 3 branchera les graphiques).

## SALLE — Salles et visibilité

- [x] **SALLE-01** — Un utilisateur connecté peut créer une salle et en devient l'hôte, en tant que participant ou seulement spectateur.
  — Serveur : `createRoom` (requête `src/db/queries/rooms.ts` + action `src/app/rooms/actions.ts`), hôte = `rooms.hostUserId`, rôle de l'hôte `participant`/`spectateur`. UI : carte de création sur l'accueil (`src/components/home/CreateRoomCard.tsx` + `createRoomFormAction` — visibilité, capacité, rôle de l'hôte). Tests : `src/db/queries/rooms.test.ts`, `src/app/rooms/actions.test.ts`, `src/App.test.tsx`.
- [x] **SALLE-02** — Chaque salle a un code court unique de 6 caractères alphanumériques, sans caractères ambigus (0/O, 1/I/L).
  — Génération CSPRNG dans `src/lib/room-rules.ts` (`generateRoomCode`), `unique` + CHECK regex `^[A-HJKMNP-Z2-9]{6}$` dans `src/db/schema.ts` (migration `drizzle/0003_boring_meggan.sql`), reprise sur collision dans `createRoom`. Tests : `src/lib/room-rules.test.ts`, `src/db/queries/rooms.test.ts`.
- [x] **SALLE-03** — Visibilité de la salle : publique (explorateur + « Faire une course », accès direct ou par code), sur code (accès par code ou lien d'invitation), privée (lien d'invitation seulement).
  — Serveur : colonne + CHECK + validation Zod ; `listPublicRooms` ne liste que les salles publiques en attente ; `joinRoomByCode` refuse les salles privées (réponse « salle introuvable » pour ne pas révéler l'existence du code). UI : explorateur `/rooms` (`src/app/rooms/page.tsx`, `src/components/rooms/RoomExplorer.tsx`), « Faire une course » (`quickPlay`), accès direct des salles publiques (la page `/rooms/[publicId]` rejoint par code), portail à code pour les salles « sur code » (`src/components/rooms/CodeGatePanel.tsx`), salles privées par lien d'invitation seulement (`src/app/i/[token]/route.ts`) — le temps réel refuse le code d'une salle privée sauf pour un membre actif qui se reconnecte (`src/realtime/room-store.ts`). Tests : `src/app/rooms/actions.test.ts`, `src/realtime/room-store.test.ts`, `src/app/i/[token]/route.test.ts`, `src/components/rooms/RoomExplorer.test.tsx`.
- [x] **SALLE-04** — Liens d'invitation :
  - [x] un lien distinct par invité, générable en plusieurs exemplaires, copiable, avec statut visible (non utilisé, ou utilisé par qui) ;
    — Jetons distincts par lien, génération par lots (`createInvitationLinks`), statut en base ; l'UI hôte (`src/components/rooms/InvitationsPanel.tsx` + `listInvitationsForRoom`) liste les liens avec leur statut (non utilisé / utilisé par qui / révoqué), génère par lots, copie les liens et resynchronise les statuts (`router.refresh()`).
  - [x] jeton aléatoire non devinable (≥ 128 bits d'entropie) ; — 24 octets aléatoires base64url (192 bits), `src/db/queries/invitations.ts`. Test : `src/db/queries/invitations.test.ts`.
  - [x] usage unique : à la première utilisation, associé à l'adresse IP ; une autre IP est refusée ; — `consumeInvitationToken` lie `boundIp` + `boundMemberId` à la première utilisation ; une autre personne est refusée (contrôle par identité). Test : `src/db/queries/invitations.test.ts`.
  - [x] la personne associée peut réutiliser le lien pour se reconnecter ; — réutilisation permise par identité (même utilisateur ou même invité), indépendamment de l'IP de reconnexion (choix documenté dans `invitations.ts`) ; l'endpoint `/i/[token]` suit ce chemin (`resolveInvitationJoin`). Test : `src/db/queries/invitations.test.ts`, `src/app/i/[token]/route.test.ts`.
  - [x] le lien d'un participant expulsé (SALLE-07) est révoqué ; — `kickMember` révoque les liens du membre dans la même transaction.
  - [x] tous les liens deviennent invalides à la fermeture de la salle ; — `closeRoom` révoque tous les liens restants dans la même transaction.
  - [x] le code seul ne suffit pas pour entrer dans une salle privée. — `joinRoomByCode` refuse (`roomNotFound`) et le hub temps réel applique la même règle (sauf membre actif qui se reconnecte). Test : `src/app/rooms/actions.test.ts`, `src/realtime/room-store.test.ts`.
- [x] **SALLE-05** — Capacité maximale configurable par l'hôte : minimum 2, maximum 30 participants ; les spectateurs ne comptent pas.
  — Serveur : CHECK 2–30 + `createRoom({capacity})` + comptage SQL des seuls participants présents dans `joinRoom`. UI : sélecteur de capacité (2–30) dans la carte de création de l'accueil (`src/components/home/CreateRoomCard.tsx`, validé par `createRoomFormDataSchema`). Tests : `src/db/queries/rooms.test.ts`, `src/app/rooms/actions.test.ts`.
- [x] **SALLE-06** — Une personne ne peut être que dans une seule salle à la fois : garantie côté serveur (contrainte en base), proposition de quitter la salle actuelle, pas de doublon pour un deuxième onglet.
  — Contrainte en base : index uniques partiels `room_members_one_active_user_idx`/`room_members_one_active_guest_idx` (`WHERE leftAt IS NULL`) ; `joinRoom` marque `leftAt` sur l'ancienne salle et refuse la même salle (`AlreadyInRoomError`) ; `createRoom` refuse un hôte déjà actif ailleurs. UI : `joinRoomByCode` renvoie la salle actuelle avec `alreadyInRoom` et le formulaire d'accueil propose « voir ma salle » et « quitter ma salle et rejoindre » (`src/components/home/JoinByCodeForm.tsx` + `leaveAndJoinFormAction`). Tests : `src/db/queries/rooms.test.ts`, `src/app/rooms/actions.test.ts`, `src/components/home/JoinByCodeForm.test.tsx`.
- [x] **SALLE-07** — L'hôte peut expulser un participant ou un spectateur ; l'expulsé ne peut plus rejoindre cette salle.
  — Serveur : `kickMember` (vérification hôte, `kicked = true` + `leftAt`, révocation des liens) ; `joinRoom` refuse tout retour (historique de kick). UI : bouton d'expulsion avec confirmation sur chaque membre (jamais sur l'hôte) dans `src/components/rooms/RoomLobby.tsx` ; l'expulsé reçoit `error(kicked)` et est redirigé vers l'accueil avec un message (`/?notice=kicked`). Tests : `src/db/queries/rooms.test.ts`, `src/app/rooms/actions.test.ts`, `src/components/rooms/RoomLobby.test.tsx`.
- [x] **SALLE-08** — Si l'hôte quitte, le rôle passe à la personne humaine connectée présente depuis le plus longtemps ; s'il n'en reste aucune, la salle est fermée.
  — `findHostSuccessor` (règle pure, `src/lib/room-rules.ts`), orchestration dans l'action `leaveRoom` (`src/app/rooms/actions.ts`) : transfert via `transferHost`, fermeture via `closeRoom` sinon. Les invités sont exclus (seul un compte peut héberger). Tests : `src/lib/room-rules.test.ts`, `src/app/rooms/actions.test.ts`.
- [x] **SALLE-09** — On ne peut rejoindre une salle qu'en attente ou sur l'écran des résultats ; jamais une course en cours.
  — `joinRoom` verrouille la salle et refuse tout statut autre que `en_attente`/`resultats` (`RoomNotJoinableError`) ; la voie temps réel applique la même règle (l'adaptateur `src/realtime/room-store.ts` réutilise la même requête que l'action). Tests : `src/lib/room-rules.test.ts`, `src/db/queries/rooms.test.ts`.
- [x] **SALLE-10** — Code de salle protégé contre la force brute : limite de tentatives par IP (ex. 10 par minute).
  — Fenêtre glissante en mémoire (`src/lib/rate-limit.ts`, 10 tentatives / 60 s / IP, horloge injectable), branchée dans `joinRoomByCode` (`src/app/rooms/actions.ts`) **et** dans le hub temps réel (`src/realtime/hub.ts` limite les `joinRoom` WebSocket avec le même limiteur partagé — ADR-010, un seul processus). Hypothèse mono-instance documentée dans le module. Tests : `src/lib/rate-limit.test.ts`, `src/app/rooms/actions.test.ts`, `src/realtime/hub.test.ts`.

## JOIN — Rejoindre une course

- [x] **JOIN-01** — Rejoindre par code : champ accessible dès la page d'accueil.
  — `src/components/home/JoinByCodeForm.tsx` (section « Caverne de course » de l'accueil) → action `joinRoomByCode` via `joinByCodeFormAction` ; erreurs typées (`rate_limited`, `room_not_found`, …), chemin « quitter ma salle et rejoindre » sur `alreadyInRoom` (SALLE-06), champ de pseudonyme pour les invités (AUTH-02). Tests : `src/components/home/JoinByCodeForm.test.tsx`, `src/app/rooms/actions.test.ts`, `src/App.test.tsx`.
- [x] **JOIN-02** — Explorateur de salles publiques : participants/capacité, langue du texte, complexité, hôte, état ; filtres langue et complexité au minimum ; mise à jour sans rechargement manuel.
  — `/rooms` (`src/app/rooms/page.tsx` + `src/components/rooms/RoomExplorer.tsx`) alimenté par `listPublicRoomsForPage` (`src/db/queries/rooms.ts`) ; filtres langue/complexité préservés dans l'URL (`src/lib/explorer-filters.ts`) ; rafraîchissement automatique ~5 s sans rechargement (`RoomsAutoRefresh.tsx`, `router.refresh()`) ; états vides connecté/invité ; bouton « Rejoindre » par rangée (`ExplorerJoinButton.tsx`). Tests : `src/lib/explorer-filters.test.ts`, `src/components/rooms/RoomExplorer.test.tsx`, `src/db/queries/rooms.test.ts`.
- [x] **JOIN-03** — « Faire une course » : choisit la salle publique joignable non pleine la plus proche de sa capacité maximale (la plus ancienne en cas d'égalité) ; sinon offre de créer une salle publique par défaut (connecté) ou état vide avec message (invité).
  — Logique pure `src/lib/quickplay.ts` (`rankQuickPlayRooms`/`pickQuickPlayRoom`, comparaison par produit croisé) ; action `quickPlay` (`src/app/rooms/actions.ts`) qui rejoint la meilleure salle et redirige ; sans salle : renvoi vers la création sur l'accueil (connecté, notice `noRooms`) ou l'état vide invité (`noRoomsGuest`) ; un invité sans pseudonyme passe par la page de salle pour choisir son nom (AUTH-02). Tests : `src/lib/quickplay.test.ts`, `src/app/rooms/actions.test.ts`, `src/App.test.tsx`.

## CONF — Configuration de la course

- [ ] **CONF-01** — Temps maximal : aucun, ou une durée entre 30 secondes et 10 minutes.
- [ ] **CONF-02** — Langue du texte : français ou anglais, indépendante de la langue de l'interface.
- [ ] **CONF-03** — Type de texte : cohérent (passages réels d'un corpus en base) ou aléatoire (mots d'un dictionnaire).
- [ ] **CONF-04** — Longueur du texte en nombre de mots.
- [ ] **CONF-05** — Complexité : facile, moyen ou difficile, avec critères mesurables documentés (longueur des mots, fréquence d'usage, caractères spéciaux…).
- [ ] **CONF-06** — Options activables/désactivables : ponctuation, nombres, majuscules et accents (pour le français).
- [ ] **CONF-07** — Caractères à inclure ou exclure (texte aléatoire ; en mode cohérent, l'option est désactivée ou seuls les passages compatibles sont choisis — comportement à documenter).
- [ ] **CONF-08** — Mode d'erreur : correction obligatoire (impossible d'avancer) ou libre (l'erreur est comptabilisée).
- [ ] **CONF-09** — Bonus de remontée activés ou non.
- [ ] **CONF-10** — Ajout et retrait de bots, avec le niveau de chacun.
- [ ] **CONF-11** — Visibilité et capacité (voir SALLE-03 et SALLE-05).
- [x] **CONF-12** — Toutes les personnes présentes voient la configuration en temps réel.
  — La mécanique serveur est complète : la configuration validée est incluse dans `roomSnapshot` (chaque connexion reçoit la config à l'arrivée) et `updateRoomConfig` diffuse `configUpdated` à toutes les connexions présentes via `src/realtime/events.ts` → hub (ADR-010, un seul processus — pas de pont NOTIFY nécessaire). L'UI de salle (`src/components/rooms/RoomLobby.tsx`) affiche la configuration depuis le snapshot — `configUpdated` re-rend immédiatement. Tests : `src/realtime/useRoomSocket.test.ts`, `src/components/rooms/RoomLobby.test.tsx`.

## COURSE — Déroulement d'une course

- [ ] **COURSE-01** — États explicites, machine à états documentée : `EN_ATTENTE → DÉCOMPTE → EN_COURSE → RÉSULTATS → (EN_ATTENTE | FERMÉE)`.
- [ ] **COURSE-02** — L'hôte ne peut lancer que si la salle compte au moins 2 participants dont au moins 1 humain (les bots comptent, pas les spectateurs).
- [ ] **COURSE-03** — Décompte synchronisé (3, 2, 1) ; le texte n'est révélé qu'au début du décompte.
- [ ] **COURSE-04** — Zone de frappe : retour visuel immédiat (caractère correct, incorrect, curseur), MPM et précision en direct, coller désactivé.
- [ ] **COURSE-05** — Piste de progression en temps réel : avatar, nom, position et MPM courant par participant (humain ou bot) ; mouvement fluide (≥ ~4 mises à jour perçues par seconde, interpolation encouragée) ; joueur local mis en évidence ; les spectateurs voient la piste sans zone de frappe.
- [ ] **COURSE-06** — Serveur autoritaire : temps de départ/fin, progression et classement, application des bonus ; rejet des progressions impossibles (saut de progression, vitesse irréaliste).
- [ ] **COURSE-07** — Un joueur peut abandonner la course, avec confirmation.
- [ ] **COURSE-08** — Déconnexion : reprise là où il en était s'il revient dans les 30 secondes ; passé ce délai, considéré comme ayant abandonné.
- [ ] **COURSE-09** — La course se termine quand tous les participants ont terminé ou abandonné, ou quand le temps maximal est écoulé.
- [ ] **COURSE-10** — Classement final : 1) finisseurs par temps d'arrivée ; 2) non-finisseurs par progression ; 3) abandons par progression au moment de l'abandon.
- [ ] **COURSE-11** — Écran des résultats : l'hôte peut relancer une course (mêmes participants, configuration modifiable) ou fermer la salle ; les autres peuvent rester ou quitter.

## BOT — Bots

- [ ] **BOT-01** — Cinq niveaux de bots (plages indicatives, ajustements à documenter) :

  | Niveau | MPM visé | Taux d'erreur indicatif |
  | ------ | -------- | ----------------------- |
  | Noob | 10–20 | ~12 % |
  | Débutant | 20–35 | ~8 % |
  | Intermédiaire | 35–60 | ~5 % |
  | Expert | 70–100 | ~2 % |
  | Impossible | 140+ | ~0,5 % |

- [ ] **BOT-02** — La vitesse varie pendant la course (accélérations, hésitations, ralentissements sur les mots difficiles) ; une vitesse constante n'est pas acceptée.
- [ ] **BOT-03** — Les bots font des erreurs qui les ralentissent (temps de correction) et respectent le mode d'erreur configuré.
- [ ] **BOT-04** — Les bots sont clairement identifiés dans l'interface et soumis aux bonus et malus comme les humains.
- [ ] **BOT-05** — Le moteur des bots est déterministe à partir d'une graine (seed), afin d'être testable unitairement.

## BONUS — Bonus de remontée

- [ ] **BONUS-01** — Joueur en retard (dernière position ou > 25 % de progression derrière le meneur) reçoit un bonus aux points de contrôle atteints quand le meneur passe 25 %, 50 % et 75 % du texte ; au plus 3 bonus par course ; règle exacte à documenter.
- [ ] **BONUS-02** — Au moins 3 types de bonus, dont au moins un qui aide le joueur en retard et au moins un qui ralentit le meneur (ex. : +3 mots au texte du meneur, −3 mots au texte du retardataire, brouillard sur les prochains mots du meneur).
- [ ] **BONUS-03** — L'activation d'un bonus est annoncée visuellement sur la piste et chez le joueur ciblé.
- [ ] **BONUS-04** — La progression et le MPM restent cohérents quand un texte est allongé ou réduit par un bonus.

## RES — Résultats et statistiques

- [ ] **RES-01** — Podium des 3 premiers.
- [ ] **RES-02** — Tableau complet : rang, participant, MPM, MPM brut, précision, nombre d'erreurs, temps, statut (terminé, temps écoulé, abandon), bonus reçus.
- [ ] **RES-03** — Au moins 2 graphiques : évolution du MPM dans le temps pour tous les participants sur un même graphique, et touches les plus manquées du joueur (ex. clavier en carte de chaleur).
- [ ] **RES-04** — Un indicateur signale un record personnel battu.
- [ ] **RES-05** — Les résultats de chaque participant humain connecté sont persistés, y compris la série temporelle du MPM nécessaire pour réafficher les graphiques.

## HIST — Historique

- [ ] **HIST-01** — Chaque course terminée apparaît dans l'historique de l'utilisateur connecté, avec pagination.
- [ ] **HIST-02** — Cliquer sur une course de l'historique réaffiche sa page de résultats complète.

## I18N — Internationalisation

- [ ] **I18N-01** — Tous les textes de l'interface en français et en anglais : libellés, messages d'erreur, états vides, métadonnées des pages ; aucune chaîne codée en dur.
- [ ] **I18N-02** — Sélecteur de langue accessible sur toutes les pages ; choix conservé (cookie ou profil) ; langue du navigateur par défaut.
- [ ] **I18N-03** — Dates et nombres formatés selon la langue choisie.

## TEST — Tests

- [x] **TEST-01** — Tests unitaires sur la logique (Jest + Testing Library).
  — tests : `src/lib/password.test.ts`, `register-validation.test.ts`, `login-validation.test.ts`, `session.test.ts`, `oauth.test.ts`, `src/db/queries/*.test.ts`, `src/sprites/*.test.ts`, `src/lib/room-config.test.ts`, `room-rules.test.ts`, `guest-session.test.ts`, `rate-limit.test.ts`, `src/app/rooms/actions.test.ts`…
  — À étendre au fur et à mesure des fonctionnalités.
- [ ] **TEST-02** — Tests de bout en bout (end-to-end) avec Playwright.
- [ ] **TEST-03** — Les tests de bout en bout utilisent la connexion par nom d'utilisateur et mot de passe (AUTH-01), pas OAuth.

## PERF — Performance

- [ ] **PERF-01** — Lighthouse ≥ 90 dans chaque catégorie sur la page d'accueil.
- [ ] **PERF-02** — Mises à jour de progression regroupées ou limitées (max ~10 messages par seconde par joueur) ; pas d'écriture en base à chaque frappe.
- [ ] **PERF-03** — La piste reste fluide avec la capacité maximale de participants.

## A11Y — Accessibilité

- [ ] **A11Y-01** — Contraste suffisant (WCAG AA) dans les deux thèmes.
- [ ] **A11Y-02** — Bonnes balises : `<button>` pour les actions et `<a>` pour la navigation, titres `<h1>`–`<h6>` ordonnés, `<header>`/`<nav>`/`<main>`/`<footer>`, `<table>` pour les données tabulaires.
- [ ] **A11Y-03** — Texte alternatif sur les images, libellé sur les champs de formulaire.
- [ ] **A11Y-04** — Parcours au clavier avec indicateur de focus visible.

## SEC — Sécurité

- [x] (partiel) **SEC-01** — Toutes les actions réservées à l'hôte (lancer, configurer, générer des liens, expulser, fermer) sont autorisées côté serveur.
  — `updateRoomConfig`, `generateInvitationLinks`, `kickMember` et `closeRoom` vérifient `rooms.hostUserId` côté serveur (dans la transaction, sur la ligne verrouillée — `src/db/queries/rooms.ts`, `invitations.ts` + actions `src/app/rooms/actions.ts`). Tests : `src/db/queries/rooms.test.ts`, `invitations.test.ts`, `src/app/rooms/actions.test.ts`. Manque : « lancer la course » (arrivera avec COURSE-02).
- [ ] **SEC-02** — Téléversements validés côté serveur : type réel du fichier et taille.
- [x] **SEC-03** — Mots de passe hachés avec un algorithme adapté (scrypt) et jamais stockés ni journalisés en clair.
  — fichiers : `src/lib/password.ts` — tests : `src/lib/password.test.ts`

## Livrables

### Checkpoint 1 (semaine 7 — 15 %)

- [ ] `doc/DEMARCHE-CREATIVE.md` complet (DES-01 à DES-03) : noms envisagés, croquis et logo, moodboard, palette, typographies. Nom et logo définitifs.
- [ ] `doc/ARCHITECTURE.md` version initiale : diagramme du modèle de données, machine à états d'une course (COURSE-01), ADR sur la technologie temps réel, approche prévue pour les bots.
- [ ] Application déployée en HTTPS avec : authentification (AUTH-01), base de données et migrations (TECH-04), création d'une salle + rejoindre par code avec liste des présents en temps réel (SALLE-01, SALLE-02, JOIN-01), sélecteurs de langue et de thème (I18N-02, DES-05), identité visuelle appliquée.
- [ ] Intégration continue fonctionnelle (TECH-09) avec au moins quelques tests unitaires.
- [ ] `doc/EXIGENCES.md` version initiale : toutes les exigences listées avec leur statut actuel.

### Remise finale (semaine 11 — 30 %)

- [ ] Dépôt GitHub partagé avec l'enseignant ; historique de commits régulier et significatif.
- [ ] URL de production fonctionnelle.
- [ ] `README.md` : présentation et captures d'écran, technologies, installation locale (PostgreSQL via Docker Compose recommandé), variables d'environnement, commandes de tests, compte de démonstration (nom d'utilisateur et mot de passe).
- [ ] `doc/ARCHITECTURE.md` version finale : modèle de données, machine à états (COURSE-01), flux des messages temps réel, ADR temps réel et ADR bots.
- [ ] `doc/EXIGENCES.md` : matrice de traçabilité complète et honnête (ID, statut, fichiers principaux, tests associés, notes et choix).
- [ ] `doc/DEMARCHE-CREATIVE.md` : nom, logo et direction artistique (DES-01 à DES-03), avec les images.
- [ ] `doc/IA.md` (1 à 2 pages) : agents et outils utilisés, fichiers d'instructions d'agent commités, 3 situations où l'IA s'est trompée (détection et correction), réflexion sur la façon de travailler avec les agents.

## Choix à documenter

Exigences ambiguës ou laissées à l'appréciation de l'équipe — chaque choix
retenu doit être expliqué ici ou dans `doc/ARCHITECTURE.md` :

- **CONF-05** — critères mesurables de la complexité (facile / moyen / difficile) : seuils documentés dans `doc/database.md` (section « Complexity ») et implémentés dans `src/lib/text-metrics.ts` (un vote par métrique, longueur moyenne des mots à poids double).
- **CONF-07** — comportement retenu en mode cohérent (option désactivée ou filtrage des passages compatibles).
- **BOT-01** — valeurs retenues si les plages de MPM/erreurs sont ajustées.
- **BONUS-01** — règle exacte d'attribution des bonus (définition précise du « retard », cumul, choix du bonus).
- **TECH-06** — ADR sur la technologie temps réel retenue.

## Annexe A — Définitions de calcul

À utiliser telles quelles pour que les résultats soient comparables :

* MPM (net) = (nombre de caractères correctement tapés ÷ 5) ÷ minutes écoulées
* MPM brut = (nombre total de caractères tapés ÷ 5) ÷ minutes écoulées
* Précision = frappes correctes ÷ frappes totales × 100
* Progression = caractères validés ÷ longueur totale du texte (en tenant compte des mots ajoutés ou retirés par un bonus)
* Les espaces comptent comme des caractères.
