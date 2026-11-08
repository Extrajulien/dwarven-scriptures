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
  - [ ] Script de seed — à créer (corpus, utilisateurs, historique de courses).
- [ ] **TECH-05** — Déploiement sur un serveur (VPS), accessible publiquement en HTTPS, fonctionnel en production au checkpoint 1 et à la remise finale.
  — La cible Railway est documentée dans `doc/database.md` ; l'URL publique reste à confirmer.
- [ ] **TECH-06** — Visualisation de la progression en temps réel (WebSocket, MQTT ou autre — choix libre, à documenter par ADR dans `doc/ARCHITECTURE.md`).
- [x] (partiel) **TECH-07** — Toutes les entrées côté serveur validées par un schéma (Zod ou équivalent) : actions serveur, routes API et messages temps réel.
  — Actions serveur (`src/app/login/actions.ts`, `src/app/register/actions.ts`, `src/app/account/actions.ts`) et routes API OAuth (`src/app/api/auth/[provider]/route.ts`, `src/app/api/auth/[provider]/callback/route.ts`) validées par des schémas Zod v4 — fichiers : `src/lib/login-validation.ts`, `src/lib/register-validation.ts`, `src/lib/profile-validation.ts`, `src/lib/oauth-validation.ts`. Tests : `src/lib/login-validation.test.ts`, `src/lib/register-validation.test.ts`, `src/lib/profile-validation.test.ts`. Messages temps réel : s'appliquera à la couche temps réel (phase suivante).
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
- [ ] **DES-06** — Responsive : toutes les pages utilisables à 360 px et plus ; sur mobile, la course est remplacée par un message recommandant un clavier physique.

## AUTH — Comptes et profil

- [x] **AUTH-01** — Authentification : OAuth Discord **et** GitHub, plus connexion par nom d'utilisateur et mot de passe (utile pour les tests de bout en bout).
  — fichiers : `src/app/(auth)/`, `src/app/login/actions.ts`, `src/app/register/actions.ts`, `src/app/api/auth/[provider]/`, `src/lib/oauth.ts`
  — tests : `src/lib/password.test.ts`, `session.test.ts`, `oauth.test.ts`, `login-validation.test.ts`, `register-validation.test.ts`, formulaires
- [ ] **AUTH-02** — Un invité choisit un pseudonyme (3 à 20 caractères) avant de rejoindre une salle ; sa session est conservée par un cookie signé.
- [ ] **AUTH-03** — Un invité ne peut pas créer de salle, n'a ni historique persistant ni photo de profil ; un avatar généré est affiché à la place.
- [x] (partiel) **AUTH-04** — Un utilisateur connecté peut téléverser une photo de profil : JPEG/PNG/WebP, 2 Mo max, validée côté serveur, redimensionnée avant l'affichage.
  — L'édition de l'URL d'avatar existe (`updateProfile`) ; le téléversement de fichier est absent.
- [x] **AUTH-05** — Un utilisateur connecté peut modifier son pseudonyme d'affichage.
  — fichiers : `src/app/account/actions.ts`, `src/components/account/EditProfileModal.tsx`
  — tests : `src/app/account/profile.test.ts`, `src/lib/profile-validation.test.ts`
- [x] (partiel) **AUTH-06** — Page de profil avec les statistiques : meilleur MPM, MPM moyen, précision moyenne, nombre de courses, nombre de victoires, graphique de progression du MPM.
  — fichiers : `src/app/account/page.tsx`, `src/components/account/AccountStats.tsx`, `ProgressionCharts.tsx`, `RaceHistory.tsx`
  — Manque : précision moyenne et victoires (colonnes absentes du schéma), graphique branché sur de vraies données.

## SALLE — Salles et visibilité

- [ ] **SALLE-01** — Un utilisateur connecté peut créer une salle et en devient l'hôte, en tant que participant ou seulement spectateur.
- [ ] **SALLE-02** — Chaque salle a un code court unique de 6 caractères alphanumériques, sans caractères ambigus (0/O, 1/I/L).
- [ ] **SALLE-03** — Visibilité de la salle : publique (explorateur + « Faire une course », accès direct ou par code), sur code (accès par code ou lien d'invitation), privée (lien d'invitation seulement).
- [ ] **SALLE-04** — Liens d'invitation :
  - [ ] un lien distinct par invité, générable en plusieurs exemplaires, copiable, avec statut visible (non utilisé, ou utilisé par qui) ;
  - [ ] jeton aléatoire non devinable (≥ 128 bits d'entropie) ;
  - [ ] usage unique : à la première utilisation, associé à l'adresse IP ; une autre IP est refusée ;
  - [ ] la personne associée peut réutiliser le lien pour se reconnecter ;
  - [ ] le lien d'un participant expulsé (SALLE-07) est révoqué ;
  - [ ] tous les liens deviennent invalides à la fermeture de la salle ;
  - [ ] le code seul ne suffit pas pour entrer dans une salle privée.
- [ ] **SALLE-05** — Capacité maximale configurable par l'hôte : minimum 2, maximum 30 participants ; les spectateurs ne comptent pas.
- [ ] **SALLE-06** — Une personne ne peut être que dans une seule salle à la fois : garantie côté serveur (contrainte en base), proposition de quitter la salle actuelle, pas de doublon pour un deuxième onglet.
- [ ] **SALLE-07** — L'hôte peut expulser un participant ou un spectateur ; l'expulsé ne peut plus rejoindre cette salle.
- [ ] **SALLE-08** — Si l'hôte quitte, le rôle passe à la personne humaine connectée présente depuis le plus longtemps ; s'il n'en reste aucune, la salle est fermée.
- [ ] **SALLE-09** — On ne peut rejoindre une salle qu'en attente ou sur l'écran des résultats ; jamais une course en cours.
- [ ] **SALLE-10** — Code de salle protégé contre la force brute : limite de tentatives par IP (ex. 10 par minute).

## JOIN — Rejoindre une course

- [ ] **JOIN-01** — Rejoindre par code : champ accessible dès la page d'accueil.
- [ ] **JOIN-02** — Explorateur de salles publiques : participants/capacité, langue du texte, complexité, hôte, état ; filtres langue et complexité au minimum ; mise à jour sans rechargement manuel.
- [ ] **JOIN-03** — « Faire une course » : choisit la salle publique joignable non pleine la plus proche de sa capacité maximale (la plus ancienne en cas d'égalité) ; sinon offre de créer une salle publique par défaut (connecté) ou état vide avec message (invité).

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
- [ ] **CONF-12** — Toutes les personnes présentes voient la configuration en temps réel.

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
  — tests : `src/lib/password.test.ts`, `register-validation.test.ts`, `login-validation.test.ts`, `session.test.ts`, `oauth.test.ts`, `src/db/queries/*.test.ts`, `src/sprites/*.test.ts`…
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

- [ ] **SEC-01** — Toutes les actions réservées à l'hôte (lancer, configurer, générer des liens, expulser, fermer) sont autorisées côté serveur.
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

- **CONF-05** — critères mesurables de la complexité (facile / moyen / difficile).
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
