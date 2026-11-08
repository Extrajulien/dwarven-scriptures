import { cookies, headers } from 'next/headers';

/**
 * I18N-01/02 groundwork: the French/English message dictionary for the
 * Phase-1 screens (home race section, room lobby, explorer, invitation
 * error page) plus the locale resolution helpers.
 *
 * Design rules:
 *
 * - **Flat keys, complete strings.** Every key maps to a full sentence —
 *   no template concatenation and no `{placeholder}` interpolation at
 *   render time. Dynamic values (room codes, counts, member names) are
 *   data rendered *next to* a static label, never spliced into the
 *   translation.
 * - **Parity enforced by type and test.** Both bags must satisfy the
 *   `Messages` interface, and `messages.test.ts` asserts the two key sets
 *   are identical, so a missing translation cannot slip through.
 * - **Server components resolve the locale** with {@link getLocale} (the
 *   `locale` cookie first, the browser `Accept-Language` as the default,
 *   `'fr'` as the final fallback — the product is French-first) and pass
 *   the chosen bag to client components via props. The locale selector
 *   itself (the UI that writes the cookie) arrives with SP-1D.
 *
 * Client components receive the bag through props and only ever import
 * the *types* from this module — never the runtime values, because the
 * module imports `next/headers`.
 */

export const LOCALE_COOKIE_NAME = 'locale';

export const LOCALES = ['fr', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/** True when `value` is one of the supported locales (I18N-02). */
export function isLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/**
 * Pure locale→bag selector: returns the French or English message bag for
 * a cookie/Accept-Language-derived locale string, falling back to `'fr'`
 * (the French-first default) for anything unsupported.
 */
export function pick(locale: string | null | undefined): Messages {
  return isLocale(locale) ? MESSAGES[locale] : MESSAGES.fr;
}

/**
 * Resolves the UI locale for the current request (I18N-02): the `locale`
 * cookie wins, then the first `Accept-Language` entry (the browser
 * default), then `'fr'`. Server components only — never import from a
 * client component.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const cookieValue = store.get(LOCALE_COOKIE_NAME)?.value;
  if (isLocale(cookieValue)) {
    return cookieValue;
  }

  const requestHeaders = await headers();
  const acceptLanguage = requestHeaders.get('accept-language') ?? '';
  const first = acceptLanguage.split(',')[0]?.trim() ?? '';
  if (!first) {
    return 'fr';
  }
  return first.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export interface Messages {
  // ------------------------------------------------------------ home race section
  'raceSection.title': string;
  'raceSection.subtitle': string;
  'raceSection.quickPlayLabel': string;
  'raceSection.quickPlayHint': string;
  'raceSection.explorerLink': string;
  'raceSection.explorerHint': string;
  'raceSection.createTitle': string;
  'raceSection.createHint': string;
  'raceSection.guestEmpty': string;
  'raceSection.guestEmptyHint': string;
  // ------------------------------------------------------------ join by code
  'joinCode.title': string;
  'joinCode.label': string;
  'joinCode.placeholder': string;
  'joinCode.submit': string;
  'joinCode.submitPending': string;
  'joinCode.error.invalidInput': string;
  'joinCode.error.roomNotFound': string;
  'joinCode.error.rateLimited': string;
  'joinCode.error.roomFull': string;
  'joinCode.error.kicked': string;
  'joinCode.error.roomNotJoinable': string;
  'joinCode.error.identityRequired': string;
  'joinCode.error.unexpected': string;
  'joinCode.alreadyInRoom': string;
  'joinCode.currentRoom': string;
  'joinCode.viewCurrent': string;
  'joinCode.leaveAndJoin': string;
  // ------------------------------------------------------------ create room card
  'createRoom.title': string;
  'createRoom.visibilityLabel': string;
  'createRoom.visibility.public': string;
  'createRoom.visibility.code': string;
  'createRoom.visibility.private': string;
  'createRoom.capacityLabel': string;
  'createRoom.roleLabel': string;
  'createRoom.role.participant': string;
  'createRoom.role.spectator': string;
  'createRoom.submit': string;
  'createRoom.submitPending': string;
  'createRoom.error.authRequired': string;
  'createRoom.error.alreadyInRoom': string;
  'createRoom.error.invalidInput': string;
  'createRoom.error.unexpected': string;
  // ------------------------------------------------------------ guest nickname form
  'guestNickname.title': string;
  'guestNickname.hint': string;
  'guestNickname.label': string;
  'guestNickname.placeholder': string;
  'guestNickname.submit': string;
  'guestNickname.submitPending': string;
  'guestNickname.error.tooShort': string;
  'guestNickname.error.tooLong': string;
  'guestNickname.error.invalid': string;
  'guestNickname.error.unexpected': string;
  'guestNickname.signInInstead': string;
  // ------------------------------------------------------------ lobby
  'lobby.connecting': string;
  'lobby.reconnecting': string;
  'lobby.copyCode': string;
  'lobby.copied': string;
  'lobby.visibilityLabel': string;
  'lobby.visibility.public': string;
  'lobby.visibility.code': string;
  'lobby.visibility.private': string;
  'lobby.capacityLabel': string;
  'lobby.statusLabel': string;
  'lobby.status.en_attente': string;
  'lobby.status.decompte': string;
  'lobby.status.en_course': string;
  'lobby.status.resultats': string;
  'lobby.status.fermee': string;
  'lobby.configTitle': string;
  'lobby.config.language': string;
  'lobby.config.complexity': string;
  'lobby.config.textType': string;
  'lobby.config.wordCount': string;
  'lobby.config.timeLimit': string;
  'lobby.config.noTimeLimit': string;
  'lobby.config.errorMode': string;
  'lobby.config.options': string;
  'lobby.config.bonuses': string;
  'lobby.config.bots': string;
  'lobby.lang.fr': string;
  'lobby.lang.en': string;
  'lobby.complexity.facile': string;
  'lobby.complexity.moyen': string;
  'lobby.complexity.difficile': string;
  'lobby.textType.coherent': string;
  'lobby.textType.random': string;
  'lobby.errorMode.accumulate': string;
  'lobby.errorMode.stop': string;
  'lobby.option.punctuation': string;
  'lobby.option.numbers': string;
  'lobby.option.capitals': string;
  'lobby.option.accents': string;
  'lobby.option.on': string;
  'lobby.option.off': string;
  'lobby.bonuses.on': string;
  'lobby.bonuses.off': string;
  'lobby.membersTitle': string;
  'lobby.role.host': string;
  'lobby.role.participant': string;
  'lobby.role.spectator': string;
  'lobby.connected': string;
  'lobby.disconnected': string;
  'lobby.guestPlaceholder': string;
  'lobby.you': string;
  'lobby.hostControlsTitle': string;
  'lobby.closeRoom': string;
  'lobby.confirmClose': string;
  'lobby.transferHost': string;
  'lobby.transferHostPicker': string;
  'lobby.transferHostButton': string;
  'lobby.kick': string;
  'lobby.confirmKick': string;
  'lobby.confirm': string;
  'lobby.cancel': string;
  'lobby.invitationsTitle': string;
  'lobby.invitationsHint': string;
  'lobby.invitationsCount': string;
  'lobby.invitationsGenerate': string;
  'lobby.invitations.status.unused': string;
  'lobby.invitations.status.used': string;
  'lobby.invitations.status.revoked': string;
  'lobby.invitations.usedBy': string;
  'lobby.invitations.usedByGuest': string;
  'lobby.invitations.empty': string;
  'lobby.invitations.copy': string;
  'lobby.invitations.copied': string;
  'lobby.invitations.error': string;
  'lobby.leave': string;
  'lobby.confirmLeave': string;
  'lobby.closed.title': string;
  'lobby.closed.body': string;
  'lobby.closed.kickedBody': string;
  'lobby.backHome': string;
  'lobby.error.title': string;
  'lobby.error.roomFull': string;
  'lobby.error.roomNotFound': string;
  'lobby.error.rateLimited': string;
  'lobby.error.alreadyInRoom': string;
  'lobby.error.unexpected': string;
  'lobby.privateReconnect': string;
  // ------------------------------------------------------------ join gate
  'gate.codeTitle': string;
  'gate.codeBody': string;
  'gate.privateTitle': string;
  'gate.privateBody': string;
  'gate.joinButton': string;
  'gate.joinPending': string;
  // ------------------------------------------------------------ explorer
  'explorer.title': string;
  'explorer.subtitle': string;
  'explorer.filters.language': string;
  'explorer.filters.complexity': string;
  'explorer.filters.all': string;
  'explorer.host': string;
  'explorer.participants': string;
  'explorer.language': string;
  'explorer.complexity': string;
  'explorer.status': string;
  'explorer.join': string;
  'explorer.joinPending': string;
  'explorer.empty': string;
  'explorer.emptyGuest': string;
  'explorer.autoRefresh': string;
  'explorer.updated': string;
  'explorer.error.title': string;
  'explorer.error.rateLimited': string;
  'explorer.error.roomFull': string;
  'explorer.error.roomNotFound': string;
  'explorer.error.kicked': string;
  'explorer.error.unexpected': string;
  // ------------------------------------------------------------ invitation error page
  'inviteError.title': string;
  'inviteError.unknown': string;
  'inviteError.revoked': string;
  'inviteError.used': string;
  'inviteError.full': string;
  'inviteError.kicked': string;
  'inviteError.notJoinable': string;
  'inviteError.unexpected': string;
  'inviteError.home': string;
  // ------------------------------------------------------------ home notices
  'notice.kicked': string;
  'notice.noRooms': string;
  'notice.noRoomsGuest': string;
  // ------------------------------------------------------------ locale selector (I18N-02)
  'locale.fr': string;
  'locale.en': string;
  'locale.switchToFr': string;
  'locale.switchToEn': string;
  // ------------------------------------------------------------ page metadata
  'meta.title': string;
  'meta.description': string;
}

export const MESSAGES: Record<Locale, Messages> = {
  fr: {
    // ------------------------------------------------------------ home race section
    'raceSection.title': 'CAVERNE DE COURSE',
    'raceSection.subtitle': 'REJOINDRE OU FONDER UNE EXPÉDITION DE FRAPPE',
    'raceSection.quickPlayLabel': 'Démarrer une course',
    'raceSection.quickPlayHint': 'Rejoint la salle publique la plus remplie',
    'raceSection.explorerLink': 'Explorateur des salles',
    'raceSection.explorerHint': 'Parcourir les salles publiques en attente',
    'raceSection.createTitle': 'Fonder une salle',
    'raceSection.createHint': 'Devenez l’hôte d’une nouvelle expédition',
    'raceSection.guestEmpty': 'Aucune salle publique n’attend de mineurs pour le moment.',
    'raceSection.guestEmptyHint':
      'Seuls les membres de la guilde peuvent fonder une salle — connectez-vous pour en créer une.',
    // ------------------------------------------------------------ join by code
    'joinCode.title': 'REJOINDRE PAR CODE',
    'joinCode.label': 'Code de la salle',
    'joinCode.placeholder': 'EX: GH2K9P',
    'joinCode.submit': 'Rejoindre',
    'joinCode.submitPending': 'Entrée en cours…',
    'joinCode.error.invalidInput': 'Code invalide : 6 caractères alphanumériques attendus.',
    'joinCode.error.roomNotFound': 'Salle introuvable avec ce code.',
    'joinCode.error.rateLimited': 'Trop de tentatives — réessayez dans une minute.',
    'joinCode.error.roomFull': 'Cette salle est pleine.',
    'joinCode.error.kicked': 'Vous avez été expulsé de cette salle et ne pouvez plus la rejoindre.',
    'joinCode.error.roomNotJoinable': 'Cette salle n’accepte pas de nouveaux membres en ce moment.',
    'joinCode.error.identityRequired': 'Choisissez d’abord votre nom de nain.',
    'joinCode.error.unexpected': 'Une erreur est survenue. Réessayez.',
    'joinCode.alreadyInRoom': 'Vous êtes déjà dans une salle.',
    'joinCode.currentRoom': 'Votre salle actuelle',
    'joinCode.viewCurrent': 'Voir ma salle actuelle',
    'joinCode.leaveAndJoin': 'Quitter ma salle et rejoindre',
    // ------------------------------------------------------------ create room card
    'createRoom.title': 'FONDER UNE SALLE',
    'createRoom.visibilityLabel': 'Visibilité',
    'createRoom.visibility.public': 'Publique',
    'createRoom.visibility.code': 'Sur code',
    'createRoom.visibility.private': 'Privée',
    'createRoom.capacityLabel': 'Capacité (2–30 participants)',
    'createRoom.roleLabel': 'Votre rôle',
    'createRoom.role.participant': 'Participant',
    'createRoom.role.spectator': 'Spectateur',
    'createRoom.submit': 'Fonder la salle',
    'createRoom.submitPending': 'Fondation en cours…',
    'createRoom.error.authRequired': 'Connectez-vous pour fonder une salle.',
    'createRoom.error.alreadyInRoom': 'Vous êtes déjà dans une salle — quittez-la d’abord.',
    'createRoom.error.invalidInput': 'Configuration invalide — vérifiez la capacité.',
    'createRoom.error.unexpected': 'Une erreur est survenue. Réessayez.',
    // ------------------------------------------------------------ guest nickname form
    'guestNickname.title': 'CHOISISSEZ VOTRE NOM DE NAIN',
    'guestNickname.hint':
      'Votre nom accompagnera votre avatar dans la salle. Les invités n’ont pas d’historique ni de photo de profil.',
    'guestNickname.label': 'Pseudonyme (3–20 caractères)',
    'guestNickname.placeholder': 'EX: Urist McTypist',
    'guestNickname.submit': 'Entrer dans la caverne',
    'guestNickname.submitPending': 'Sceau en cours…',
    'guestNickname.error.tooShort': 'Au moins 3 caractères.',
    'guestNickname.error.tooLong': '20 caractères maximum.',
    'guestNickname.error.invalid': 'Pseudonyme invalide.',
    'guestNickname.error.unexpected': 'Une erreur est survenue. Réessayez.',
    'guestNickname.signInInstead': 'Se connecter à la place',
    // ------------------------------------------------------------ lobby
    'lobby.connecting': 'Connexion à la salle…',
    'lobby.reconnecting': 'Reconnexion à la salle…',
    'lobby.copyCode': 'Copier le code',
    'lobby.copied': 'Copié !',
    'lobby.visibilityLabel': 'Visibilité',
    'lobby.visibility.public': 'Publique',
    'lobby.visibility.code': 'Sur code',
    'lobby.visibility.private': 'Privée',
    'lobby.capacityLabel': 'Participants',
    'lobby.statusLabel': 'État',
    'lobby.status.en_attente': 'En attente',
    'lobby.status.decompte': 'Décompte',
    'lobby.status.en_course': 'Course en cours',
    'lobby.status.resultats': 'Résultats',
    'lobby.status.fermee': 'Fermée',
    'lobby.configTitle': 'CONFIGURATION DE LA COURSE',
    'lobby.config.language': 'Langue du texte',
    'lobby.config.complexity': 'Complexité',
    'lobby.config.textType': 'Type de texte',
    'lobby.config.wordCount': 'Nombre de mots',
    'lobby.config.timeLimit': 'Temps maximal',
    'lobby.config.noTimeLimit': 'Aucun',
    'lobby.config.errorMode': 'Mode d’erreur',
    'lobby.config.options': 'Options',
    'lobby.config.bonuses': 'Bonus de remontée',
    'lobby.config.bots': 'Bots',
    'lobby.lang.fr': 'Français',
    'lobby.lang.en': 'Anglais',
    'lobby.complexity.facile': 'Facile',
    'lobby.complexity.moyen': 'Moyen',
    'lobby.complexity.difficile': 'Difficile',
    'lobby.textType.coherent': 'Cohérent',
    'lobby.textType.random': 'Aléatoire',
    'lobby.errorMode.accumulate': 'Libre (erreurs comptabilisées)',
    'lobby.errorMode.stop': 'Correction obligatoire',
    'lobby.option.punctuation': 'Ponctuation',
    'lobby.option.numbers': 'Nombres',
    'lobby.option.capitals': 'Majuscules',
    'lobby.option.accents': 'Accents',
    'lobby.option.on': 'Activé',
    'lobby.option.off': 'Désactivé',
    'lobby.bonuses.on': 'Activés',
    'lobby.bonuses.off': 'Désactivés',
    'lobby.membersTitle': 'MEMBRES PRÉSENTS',
    'lobby.role.host': 'Hôte',
    'lobby.role.participant': 'Participant',
    'lobby.role.spectator': 'Spectateur',
    'lobby.connected': 'En ligne',
    'lobby.disconnected': 'Hors ligne',
    'lobby.guestPlaceholder': 'Nain en route…',
    'lobby.you': 'Vous',
    'lobby.hostControlsTitle': 'COMMANDES DE L’HÔTE',
    'lobby.closeRoom': 'Fermer la salle',
    'lobby.confirmClose': 'Fermer la salle ? Tous les membres seront expulsés.',
    'lobby.transferHost': 'Transférer l’hôte',
    'lobby.transferHostPicker': 'Nouvel hôte',
    'lobby.transferHostButton': 'Transférer',
    'lobby.kick': 'Expulser',
    'lobby.confirmKick': 'Expulser ce membre ? Ses liens d’invitation seront révoqués.',
    'lobby.confirm': 'Confirmer',
    'lobby.cancel': 'Annuler',
    'lobby.invitationsTitle': 'LIENS D’INVITATION',
    'lobby.invitationsHint': 'Un lien par invité — usage unique, statut visible.',
    'lobby.invitationsCount': 'Nombre de liens',
    'lobby.invitationsGenerate': 'Générer',
    'lobby.invitations.status.unused': 'Non utilisé',
    'lobby.invitations.status.used': 'Utilisé',
    'lobby.invitations.status.revoked': 'Révoqué',
    'lobby.invitations.usedBy': 'Utilisé par',
    'lobby.invitations.usedByGuest': 'un invité',
    'lobby.invitations.empty': 'Aucun lien généré pour le moment.',
    'lobby.invitations.copy': 'Copier',
    'lobby.invitations.copied': 'Copié !',
    'lobby.invitations.error': 'Impossible de générer les liens.',
    'lobby.leave': 'Quitter la salle',
    'lobby.confirmLeave': 'Quitter la salle ?',
    'lobby.closed.title': 'SALLE FERMÉE',
    'lobby.closed.body': 'L’hôte a fermé la salle. L’expédition est terminée.',
    'lobby.closed.kickedBody': 'Vous avez été expulsé de la salle.',
    'lobby.backHome': 'Retour à la forteresse',
    'lobby.error.title': 'IMPOSSIBLE DE REJOINDRE LA SALLE',
    'lobby.error.roomFull': 'Cette salle est pleine.',
    'lobby.error.roomNotFound': 'Salle introuvable ou inaccessible.',
    'lobby.error.rateLimited': 'Trop de tentatives — réessayez dans une minute.',
    'lobby.error.alreadyInRoom': 'Vous êtes déjà dans cette salle sur un autre onglet.',
    'lobby.error.unexpected': 'Une erreur est survenue. Réessayez.',
    'lobby.privateReconnect': 'Rouvrez votre lien d’invitation pour vous reconnecter.',
    // ------------------------------------------------------------ join gate
    'gate.codeTitle': 'SALLE SCELLÉE',
    'gate.codeBody': 'Cette salle exige son code pour entrer.',
    'gate.privateTitle': 'SALLE PRIVÉE',
    'gate.privateBody': 'Cette salle n’est accessible que par un lien d’invitation.',
    'gate.joinButton': 'Rejoindre la salle',
    'gate.joinPending': 'Entrée en cours…',
    // ------------------------------------------------------------ explorer
    'explorer.title': 'EXPLORATEUR DES SALLES',
    'explorer.subtitle': 'SALLES PUBLIQUES EN ATTENTE DE MINEURS',
    'explorer.filters.language': 'Langue',
    'explorer.filters.complexity': 'Complexité',
    'explorer.filters.all': 'Toutes',
    'explorer.host': 'Hôte',
    'explorer.participants': 'Participants',
    'explorer.language': 'Langue',
    'explorer.complexity': 'Complexité',
    'explorer.status': 'État',
    'explorer.join': 'Rejoindre',
    'explorer.joinPending': 'Entrée…',
    'explorer.empty': 'Aucune salle publique en attente. Fondez-en une depuis l’accueil !',
    'explorer.emptyGuest': 'Aucune salle publique en attente pour le moment.',
    'explorer.autoRefresh': 'Actualisation automatique',
    'explorer.updated': 'Mis à jour',
    'explorer.error.title': 'IMPOSSIBLE DE REJOINDRE',
    'explorer.error.rateLimited': 'Trop de tentatives — réessayez dans une minute.',
    'explorer.error.roomFull': 'Cette salle est pleine.',
    'explorer.error.roomNotFound': 'Salle introuvable.',
    'explorer.error.kicked': 'Vous avez été expulsé de cette salle.',
    'explorer.error.unexpected': 'Une erreur est survenue. Réessayez.',
    // ------------------------------------------------------------ invitation error page
    'inviteError.title': 'LIEN D’INVITATION',
    'inviteError.unknown': 'Ce lien d’invitation n’existe pas.',
    'inviteError.revoked': 'Ce lien d’invitation a été révoqué.',
    'inviteError.used': 'Ce lien d’invitation a déjà été utilisé par quelqu’un d’autre.',
    'inviteError.full': 'Cette salle est pleine.',
    'inviteError.kicked': 'Vous ne pouvez plus rejoindre cette salle.',
    'inviteError.notJoinable': 'Cette salle n’accepte plus de membres.',
    'inviteError.unexpected': 'Une erreur est survenue. Réessayez.',
    'inviteError.home': 'Retour à l’accueil',
    // ------------------------------------------------------------ home notices
    'notice.kicked': 'Vous avez été expulsé de la salle.',
    'notice.noRooms': 'Aucune salle publique en attente — fondez la vôtre ci-dessous !',
    'notice.noRoomsGuest': 'Aucune salle publique en attente pour le moment.',
    // ------------------------------------------------------------ locale selector (I18N-02)
    'locale.fr': 'FR',
    'locale.en': 'EN',
    'locale.switchToFr': 'Passer l’interface en français',
    'locale.switchToEn': 'Passer l’interface en anglais',
    // ------------------------------------------------------------ page metadata
    'meta.title': 'Dwarven Scriptures',
    'meta.description':
      'Dwarven Scriptures — une forteresse de guilde compétitive de course de frappe.',
  },
  en: {
    // ------------------------------------------------------------ home race section
    'raceSection.title': 'RACE CAVERN',
    'raceSection.subtitle': 'JOIN OR FORGE A TYPING EXPEDITION',
    'raceSection.quickPlayLabel': 'Start a race',
    'raceSection.quickPlayHint': 'Joins the fullest public room',
    'raceSection.explorerLink': 'Room explorer',
    'raceSection.explorerHint': 'Browse public rooms waiting for miners',
    'raceSection.createTitle': 'Forge a room',
    'raceSection.createHint': 'Become the host of a new expedition',
    'raceSection.guestEmpty': 'No public room is waiting for miners right now.',
    'raceSection.guestEmptyHint':
      'Only guild members can forge a room — sign in to create one.',
    // ------------------------------------------------------------ join by code
    'joinCode.title': 'JOIN BY CODE',
    'joinCode.label': 'Room code',
    'joinCode.placeholder': 'E.G. GH2K9P',
    'joinCode.submit': 'Join',
    'joinCode.submitPending': 'Entering…',
    'joinCode.error.invalidInput': 'Invalid code: 6 alphanumeric characters expected.',
    'joinCode.error.roomNotFound': 'No room matches this code.',
    'joinCode.error.rateLimited': 'Too many attempts — try again in a minute.',
    'joinCode.error.roomFull': 'This room is full.',
    'joinCode.error.kicked': 'You were kicked from this room and cannot rejoin it.',
    'joinCode.error.roomNotJoinable': 'This room is not accepting new members right now.',
    'joinCode.error.identityRequired': 'Pick your dwarf name first.',
    'joinCode.error.unexpected': 'Something went wrong. Please try again.',
    'joinCode.alreadyInRoom': 'You are already in a room.',
    'joinCode.currentRoom': 'Your current room',
    'joinCode.viewCurrent': 'View my current room',
    'joinCode.leaveAndJoin': 'Leave my room and join',
    // ------------------------------------------------------------ create room card
    'createRoom.title': 'FORGE A ROOM',
    'createRoom.visibilityLabel': 'Visibility',
    'createRoom.visibility.public': 'Public',
    'createRoom.visibility.code': 'Code-only',
    'createRoom.visibility.private': 'Private',
    'createRoom.capacityLabel': 'Capacity (2–30 participants)',
    'createRoom.roleLabel': 'Your role',
    'createRoom.role.participant': 'Participant',
    'createRoom.role.spectator': 'Spectator',
    'createRoom.submit': 'Forge the room',
    'createRoom.submitPending': 'Forging…',
    'createRoom.error.authRequired': 'Sign in to forge a room.',
    'createRoom.error.alreadyInRoom': 'You are already in a room — leave it first.',
    'createRoom.error.invalidInput': 'Invalid configuration — check the capacity.',
    'createRoom.error.unexpected': 'Something went wrong. Please try again.',
    // ------------------------------------------------------------ guest nickname form
    'guestNickname.title': 'CHOOSE YOUR DWARF NAME',
    'guestNickname.hint':
      'Your name will ride with your avatar in the room. Guests have no history and no profile picture.',
    'guestNickname.label': 'Nickname (3–20 characters)',
    'guestNickname.placeholder': 'E.G. Urist McTypist',
    'guestNickname.submit': 'Enter the cavern',
    'guestNickname.submitPending': 'Sealing…',
    'guestNickname.error.tooShort': 'At least 3 characters.',
    'guestNickname.error.tooLong': 'At most 20 characters.',
    'guestNickname.error.invalid': 'Invalid nickname.',
    'guestNickname.error.unexpected': 'Something went wrong. Please try again.',
    'guestNickname.signInInstead': 'Sign in instead',
    // ------------------------------------------------------------ lobby
    'lobby.connecting': 'Connecting to the room…',
    'lobby.reconnecting': 'Reconnecting to the room…',
    'lobby.copyCode': 'Copy the code',
    'lobby.copied': 'Copied!',
    'lobby.visibilityLabel': 'Visibility',
    'lobby.visibility.public': 'Public',
    'lobby.visibility.code': 'Code-only',
    'lobby.visibility.private': 'Private',
    'lobby.capacityLabel': 'Participants',
    'lobby.statusLabel': 'Status',
    'lobby.status.en_attente': 'Waiting',
    'lobby.status.decompte': 'Countdown',
    'lobby.status.en_course': 'Race in progress',
    'lobby.status.resultats': 'Results',
    'lobby.status.fermee': 'Closed',
    'lobby.configTitle': 'RACE CONFIGURATION',
    'lobby.config.language': 'Text language',
    'lobby.config.complexity': 'Complexity',
    'lobby.config.textType': 'Text type',
    'lobby.config.wordCount': 'Word count',
    'lobby.config.timeLimit': 'Time limit',
    'lobby.config.noTimeLimit': 'None',
    'lobby.config.errorMode': 'Error mode',
    'lobby.config.options': 'Options',
    'lobby.config.bonuses': 'Comeback bonuses',
    'lobby.config.bots': 'Bots',
    'lobby.lang.fr': 'French',
    'lobby.lang.en': 'English',
    'lobby.complexity.facile': 'Easy',
    'lobby.complexity.moyen': 'Medium',
    'lobby.complexity.difficile': 'Hard',
    'lobby.textType.coherent': 'Coherent',
    'lobby.textType.random': 'Random',
    'lobby.errorMode.accumulate': 'Free (errors counted)',
    'lobby.errorMode.stop': 'Mandatory correction',
    'lobby.option.punctuation': 'Punctuation',
    'lobby.option.numbers': 'Numbers',
    'lobby.option.capitals': 'Capitals',
    'lobby.option.accents': 'Accents',
    'lobby.option.on': 'On',
    'lobby.option.off': 'Off',
    'lobby.bonuses.on': 'On',
    'lobby.bonuses.off': 'Off',
    'lobby.membersTitle': 'MEMBERS PRESENT',
    'lobby.role.host': 'Host',
    'lobby.role.participant': 'Participant',
    'lobby.role.spectator': 'Spectator',
    'lobby.connected': 'Online',
    'lobby.disconnected': 'Offline',
    'lobby.guestPlaceholder': 'Dwarf on the way…',
    'lobby.you': 'You',
    'lobby.hostControlsTitle': 'HOST CONTROLS',
    'lobby.closeRoom': 'Close the room',
    'lobby.confirmClose': 'Close the room? Every member will be evicted.',
    'lobby.transferHost': 'Transfer host',
    'lobby.transferHostPicker': 'New host',
    'lobby.transferHostButton': 'Transfer',
    'lobby.kick': 'Kick',
    'lobby.confirmKick': 'Kick this member? Their invitation links will be revoked.',
    'lobby.confirm': 'Confirm',
    'lobby.cancel': 'Cancel',
    'lobby.invitationsTitle': 'INVITATION LINKS',
    'lobby.invitationsHint': 'One link per guest — single use, visible status.',
    'lobby.invitationsCount': 'Link count',
    'lobby.invitationsGenerate': 'Generate',
    'lobby.invitations.status.unused': 'Unused',
    'lobby.invitations.status.used': 'Used',
    'lobby.invitations.status.revoked': 'Revoked',
    'lobby.invitations.usedBy': 'Used by',
    'lobby.invitations.usedByGuest': 'a guest',
    'lobby.invitations.empty': 'No links generated yet.',
    'lobby.invitations.copy': 'Copy',
    'lobby.invitations.copied': 'Copied!',
    'lobby.invitations.error': 'Could not generate links.',
    'lobby.leave': 'Leave the room',
    'lobby.confirmLeave': 'Leave the room?',
    'lobby.closed.title': 'ROOM CLOSED',
    'lobby.closed.body': 'The host closed the room. The expedition is over.',
    'lobby.closed.kickedBody': 'You were kicked from the room.',
    'lobby.backHome': 'Back to the fortress',
    'lobby.error.title': 'COULD NOT JOIN THE ROOM',
    'lobby.error.roomFull': 'This room is full.',
    'lobby.error.roomNotFound': 'Room not found or not accessible.',
    'lobby.error.rateLimited': 'Too many attempts — try again in a minute.',
    'lobby.error.alreadyInRoom': 'You are already in this room from another tab.',
    'lobby.error.unexpected': 'Something went wrong. Please try again.',
    'lobby.privateReconnect': 'Reopen your invitation link to reconnect.',
    // ------------------------------------------------------------ join gate
    'gate.codeTitle': 'SEALED ROOM',
    'gate.codeBody': 'This room requires its code to enter.',
    'gate.privateTitle': 'PRIVATE ROOM',
    'gate.privateBody': 'This room is only reachable through an invitation link.',
    'gate.joinButton': 'Join the room',
    'gate.joinPending': 'Entering…',
    // ------------------------------------------------------------ explorer
    'explorer.title': 'ROOM EXPLORER',
    'explorer.subtitle': 'PUBLIC ROOMS WAITING FOR MINERS',
    'explorer.filters.language': 'Language',
    'explorer.filters.complexity': 'Complexity',
    'explorer.filters.all': 'All',
    'explorer.host': 'Host',
    'explorer.participants': 'Participants',
    'explorer.language': 'Language',
    'explorer.complexity': 'Complexity',
    'explorer.status': 'Status',
    'explorer.join': 'Join',
    'explorer.joinPending': 'Entering…',
    'explorer.empty': 'No public room waiting. Forge one from the home page!',
    'explorer.emptyGuest': 'No public room waiting right now.',
    'explorer.autoRefresh': 'Auto-refresh',
    'explorer.updated': 'Updated',
    'explorer.error.title': 'COULD NOT JOIN',
    'explorer.error.rateLimited': 'Too many attempts — try again in a minute.',
    'explorer.error.roomFull': 'This room is full.',
    'explorer.error.roomNotFound': 'Room not found.',
    'explorer.error.kicked': 'You were kicked from this room.',
    'explorer.error.unexpected': 'Something went wrong. Please try again.',
    // ------------------------------------------------------------ invitation error page
    'inviteError.title': 'INVITATION LINK',
    'inviteError.unknown': 'This invitation link does not exist.',
    'inviteError.revoked': 'This invitation link has been revoked.',
    'inviteError.used': 'This invitation link was already used by someone else.',
    'inviteError.full': 'This room is full.',
    'inviteError.kicked': 'You can no longer join this room.',
    'inviteError.notJoinable': 'This room is not accepting members anymore.',
    'inviteError.unexpected': 'Something went wrong. Please try again.',
    'inviteError.home': 'Back to home',
    // ------------------------------------------------------------ home notices
    'notice.kicked': 'You were kicked from the room.',
    'notice.noRooms': 'No public room waiting — forge your own below!',
    'notice.noRoomsGuest': 'No public room waiting right now.',
    // ------------------------------------------------------------ locale selector (I18N-02)
    'locale.fr': 'FR',
    'locale.en': 'EN',
    'locale.switchToFr': 'Switch the interface to French',
    'locale.switchToEn': 'Switch the interface to English',
    // ------------------------------------------------------------ page metadata
    'meta.title': 'Dwarven Scriptures',
    'meta.description':
      'Dwarven Scriptures — a competitive typing-race guild stronghold.',
  },
};
