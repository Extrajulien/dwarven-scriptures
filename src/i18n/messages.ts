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
  // ------------------------------------------------------------ theme selector (DES-05)
  'theme.group': string;
  'theme.light': string;
  'theme.dark': string;
  'theme.system': string;
  'theme.switchToLight': string;
  'theme.switchToDark': string;
  'theme.switchToSystem': string;
  // ------------------------------------------------------------ page metadata
  'meta.title': string;
  'meta.description': string;
  // ------------------------------------------------------------ chrome (navbar, footer)
  'guild.name': string;
  'guild.tag': string;
  'guild.streak': string;
  'nav.mineRace': string;
  'nav.guildRanks': string;
  'nav.runeworks': string;
  'nav.ledgers': string;
  'nav.login': string;
  'footer.left': string;
  'footer.status': string;
  'footer.optimal': string;
  // ------------------------------------------------------------ home page (mock content)
  'home.breadcrumbLeft': string;
  'home.breadcrumbRight': string;
  'home.crest.chapter': string;
  'home.crest.order': string;
  'home.crest.name': string;
  'home.crest.motto': string;
  'home.crest.statsExcavators': string;
  'home.crest.statsHallTier': string;
  'home.vault.adamantine.label': string;
  'home.vault.adamantine.caption': string;
  'home.vault.magmaFuel.label': string;
  'home.vault.rawGems.label': string;
  'home.vault.rawGems.caption': string;
  'home.vault.hourlyTithe.label': string;
  'home.vault.hourlyTithe.caption': string;
  'home.action.contribute': string;
  'home.action.declareRace': string;
  'home.action.manageEmblem': string;
  'home.roster.title': string;
  'home.roster.tag': string;
  'home.roster.registry': string;
  'home.roster.wpmUnit': string;
  'home.roster.showing': string;
  'home.roster.expand': string;
  'home.roster.filterAll': string;
  'home.roster.filterVeterans': string;
  'home.roster.filterChampions': string;
  'home.roster.filterApprentices': string;
  'home.roster.colIdentity': string;
  'home.roster.colSpecialization': string;
  'home.roster.colPeakWpm': string;
  'home.roster.colAccuracy': string;
  'home.roster.colStones': string;
  'home.roster.colStatus': string;
  'home.roster.colOrders': string;
  'home.miners.urist.rank': string;
  'home.miners.urist.specialization': string;
  'home.miners.urist.stones': string;
  'home.miners.urist.status': string;
  'home.miners.urist.action': string;
  'home.miners.darin.rank': string;
  'home.miners.darin.specialization': string;
  'home.miners.darin.stones': string;
  'home.miners.darin.status': string;
  'home.miners.darin.action': string;
  'home.miners.thrum.rank': string;
  'home.miners.thrum.specialization': string;
  'home.miners.thrum.stones': string;
  'home.miners.thrum.status': string;
  'home.miners.thrum.action': string;
  'home.miners.kogan.rank': string;
  'home.miners.kogan.specialization': string;
  'home.miners.kogan.stones': string;
  'home.miners.kogan.status': string;
  'home.miners.kogan.action': string;
  'home.bounties.title': string;
  'home.bounties.tag': string;
  'home.bounties.count': string;
  'home.bounties.vein.title': string;
  'home.bounties.vein.meta': string;
  'home.bounties.vein.reward': string;
  'home.bounties.vein.action': string;
  'home.bounties.vein.start': string;
  'home.bounties.vein.lead': string;
  'home.bounties.vein.end': string;
  'home.bounties.vein.ascii': string;
  'home.bounties.magma.title': string;
  'home.bounties.magma.meta': string;
  'home.bounties.magma.reward': string;
  'home.bounties.magma.action': string;
  'home.bounties.magma.text': string;
  'home.bounties.magma.status': string;
  'home.bounties.decryption.title': string;
  'home.bounties.decryption.meta': string;
  'home.bounties.decryption.reward': string;
  'home.bounties.decryption.action': string;
  'home.bounties.decryption.label': string;
  'home.bounties.decryption.pctLabel': string;
  'home.bounties.decryption.ascii': string;
  'home.perks.title': string;
  'home.perks.subtitle': string;
  'home.perks.basalt.name': string;
  'home.perks.basalt.status': string;
  'home.perks.basalt.description': string;
  'home.perks.basalt.footnote': string;
  'home.perks.fault.name': string;
  'home.perks.fault.status': string;
  'home.perks.fault.description': string;
  'home.perks.fault.footnote': string;
  'home.perks.quill.name': string;
  'home.perks.quill.status': string;
  'home.perks.quill.description': string;
  'home.perks.quill.estimate': string;
  'home.perks.quill.action': string;
  'home.perks.beast.name': string;
  'home.perks.beast.status': string;
  'home.perks.beast.description': string;
  'home.chronicles.title': string;
  'home.chronicles.subtitle': string;
  'home.chronicles.placeholder': string;
  'home.chronicles.post': string;
  'home.chronicles.apex.time': string;
  'home.chronicles.apex.s1': string;
  'home.chronicles.apex.s2': string;
  'home.chronicles.apex.s3': string;
  'home.chronicles.tithe.time': string;
  'home.chronicles.tithe.s1': string;
  'home.chronicles.tithe.s2': string;
  'home.chronicles.tithe.s3': string;
  'home.chronicles.caveIn.time': string;
  'home.chronicles.caveIn.s1': string;
  'home.chronicles.pickaxes.time': string;
  'home.chronicles.pickaxes.s1': string;
  // ------------------------------------------------------------ auth (shared chrome)
  'auth.divider': string;
  'auth.security': string;
  'auth.provider.github': string;
  'auth.provider.discord': string;
  'auth.error.requiredUsername': string;
  'auth.error.requiredPassword': string;
  'auth.error.unexpected': string;
  'auth.showcase.ariaLabel': string;
  'auth.showcase.topLeft': string;
  'auth.showcase.feedStatus': string;
  'auth.showcase.imageAlt': string;
  'auth.showcase.hudTitle': string;
  'auth.showcase.activeScribesLabel': string;
  'auth.showcase.veinLabel': string;
  'auth.showcase.quote': string;
  'auth.showcase.bottomLeft': string;
  'auth.showcase.bottomRight': string;
  // ------------------------------------------------------------ login screen
  'auth.login.card.logoAlt': string;
  'auth.login.card.title': string;
  'auth.login.card.heading': string;
  'auth.login.card.subtitle': string;
  'auth.login.card.status': string;
  'auth.login.card.terminalId': string;
  'auth.login.card.guidance': string;
  'auth.login.callsign.label': string;
  'auth.login.callsign.hint': string;
  'auth.login.callsign.placeholder': string;
  'auth.login.password.label': string;
  'auth.login.password.hint': string;
  'auth.login.password.placeholder': string;
  'auth.login.remember': string;
  'auth.login.submit': string;
  'auth.login.submitPending': string;
  'auth.login.error.invalidCredentials': string;
  'auth.login.togglePassword': string;
  'auth.login.register.prompt': string;
  'auth.login.register.label': string;
  // ------------------------------------------------------------ register screen
  'auth.register.card.logoAlt': string;
  'auth.register.card.title': string;
  'auth.register.card.heading': string;
  'auth.register.card.subtitle': string;
  'auth.register.card.status': string;
  'auth.register.card.terminalId': string;
  'auth.register.card.guidance': string;
  'auth.register.callsign.label': string;
  'auth.register.callsign.hint': string;
  'auth.register.callsign.placeholder': string;
  'auth.register.password.label': string;
  'auth.register.password.hint': string;
  'auth.register.password.placeholder': string;
  'auth.register.confirmPassword.label': string;
  'auth.register.confirmPassword.hint': string;
  'auth.register.confirmPassword.placeholder': string;
  'auth.register.terms': string;
  'auth.register.submit': string;
  'auth.register.submitPending': string;
  'auth.register.strength.label': string;
  'auth.register.strength.empty': string;
  'auth.register.strength.weak': string;
  'auth.register.strength.acceptable': string;
  'auth.register.strength.strong': string;
  'auth.register.error.usernameTooLong': string;
  'auth.register.error.usernameTaken': string;
  'auth.register.error.passwordTooShort': string;
  'auth.register.error.passwordTooLong': string;
  'auth.register.error.passwordWeak': string;
  'auth.register.error.confirmRequired': string;
  'auth.register.error.passwordsDoNotMatch': string;
  'auth.register.togglePassword': string;
  'auth.register.toggleConfirmPassword': string;
  'auth.register.login.prompt': string;
  'auth.register.login.label': string;
  // ------------------------------------------------------------ page titles
  'pageTitle.login': string;
  'pageTitle.register': string;
  'pageTitle.account': string;
  'pageTitle.rooms': string;
  'pageTitle.room': string;
  'pageTitle.invitation': string;
  // ------------------------------------------------------------ account screen
  'account.breadcrumb.left': string;
  'account.breadcrumb.node': string;
  'account.breadcrumb.synced': string;
  'account.breadcrumb.rightZ': string;
  'account.breadcrumb.rightProtocol': string;
  'account.identity.memberSincePrefix': string;
  'account.identity.memberSinceSuffix': string;
  'account.identity.citadel': string;
  'account.identity.edit': string;
  'account.identity.logout': string;
  'account.providers.githubConnected': string;
  'account.providers.discordConnected': string;
  'account.stats.title': string;
  'account.stats.caption': string;
  'account.stats.tile.racesCompleted': string;
  'account.stats.tile.bestWpm': string;
  'account.stats.tile.avgWpm': string;
  'account.stats.tile.totalWords': string;
  'account.stats.expeditionsCaption': string;
  'account.stats.wpmUnit': string;
  'account.stats.runesEngravedCaption': string;
  'account.stats.coinsLabel': string;
  'account.stats.gemsLabel': string;
  'account.chart.wpm.title': string;
  'account.chart.wpm.apex': string;
  'account.chart.wpm.low': string;
  'account.chart.wpm.current': string;
  'account.chart.wpm.tick1': string;
  'account.chart.wpm.tick2': string;
  'account.chart.wpm.tick3': string;
  'account.chart.wpm.tick4': string;
  'account.chart.wpm.tick5': string;
  'account.chart.wpm.tick6': string;
  'account.chart.races.title': string;
  'account.chart.races.total': string;
  'account.chart.races.streaks': string;
  'account.chart.races.daily': string;
  'account.chart.races.tickDay9': string;
  'account.chart.races.tickDay7': string;
  'account.chart.races.tickDay5': string;
  'account.chart.races.tickDay3': string;
  'account.chart.races.tickYesterday': string;
  'account.chart.races.tickToday': string;
  'account.chart.last10Races': string;
  'account.chart.allTime': string;
  'account.history.title': string;
  'account.history.caption': string;
  'account.history.filterLabel': string;
  'account.history.colDate': string;
  'account.history.colWpm': string;
  'account.history.colAccuracy': string;
  'account.history.colPlace': string;
  'account.history.colLanguage': string;
  'account.history.colDuration': string;
  'account.history.filterAll': string;
  'account.history.filterRecent': string;
  'account.history.filterBest': string;
  'account.history.exp84.wpm': string;
  'account.history.exp84.place': string;
  'account.history.exp84.language': string;
  'account.history.exp83.wpm': string;
  'account.history.exp83.place': string;
  'account.history.exp83.language': string;
  'account.history.exp82.wpm': string;
  'account.history.exp82.place': string;
  'account.history.exp82.language': string;
  'account.history.exp81.wpm': string;
  'account.history.exp81.place': string;
  'account.history.exp81.language': string;
  'account.history.exp80.wpm': string;
  'account.history.exp80.place': string;
  'account.history.exp80.language': string;
  'account.history.footerShowing': string;
  'account.history.footerPrev': string;
  'account.history.footerPage': string;
  'account.history.footerNext': string;
  'account.heatmap.title': string;
  'account.heatmap.caption': string;
  'account.heatmap.legendLabel': string;
  'account.heatmap.legendAccurate': string;
  'account.heatmap.legendMedium': string;
  'account.heatmap.legendWeak': string;
  'account.heatmap.key.back': string;
  'account.heatmap.key.tab': string;
  'account.heatmap.key.caps': string;
  'account.heatmap.key.enter': string;
  'account.heatmap.key.shift': string;
  'account.heatmap.key.ctrl': string;
  'account.heatmap.key.alt': string;
  'account.heatmap.key.space': string;
  'account.heatmap.weakestLabel': string;
  'account.heatmap.drill': string;
  'account.modal.header': string;
  'account.modal.statusActive': string;
  'account.modal.discardTitle': string;
  'account.modal.title': string;
  'account.modal.subtitle': string;
  'account.modal.tabIdentity': string;
  'account.modal.tabAccounts': string;
  'account.modal.tabPreferences': string;
  'account.modal.identitySection': string;
  'account.modal.citadelRegistered': string;
  'account.modal.usernameLabel': string;
  'account.modal.availableYes': string;
  'account.modal.avatarLabel': string;
  'account.modal.avatarActive': string;
  'account.modal.avatarHint': string;
  'account.modal.accountsSection': string;
  'account.modal.oauthSecure': string;
  'account.modal.disconnect': string;
  'account.modal.connect': string;
  'account.modal.preferencesSection': string;
  'account.modal.audioScripts': string;
  'account.modal.keystrokeLabel': string;
  'account.modal.sound1': string;
  'account.modal.sound2': string;
  'account.modal.sound3': string;
  'account.modal.sound4': string;
  'account.modal.scriptLabel': string;
  'account.modal.script1': string;
  'account.modal.script2': string;
  'account.modal.script3': string;
  'account.modal.script4': string;
  'account.modal.persistNote': string;
  'account.modal.discard': string;
  'account.modal.submitPending': string;
  'account.modal.submit': string;
  'account.modal.githubConnected': string;
  'account.modal.githubDisconnected': string;
  'account.modal.discordConnected': string;
  'account.modal.discordDisconnected': string;
  'account.modal.oauthNote': string;
  'account.modal.error.usernameRequired': string;
  'account.modal.error.usernameTooLong': string;
  'account.modal.error.usernameTaken': string;
  'account.modal.error.invalidUrl': string;
  // ------------------------------------------------------------ dev-only sprite demos
  'demo.preloading': string;
  'demo.showcaseTitle': string;
  'demo.showcaseSubtitle': string;
  'demo.sectionTerrain': string;
  'demo.sectionMining': string;
  'demo.sectionActors': string;
  'demo.sectionLayered': string;
  'demo.sectionMonsters': string;
  'demo.pickaxeSwing': string;
  'demo.idleHighlight': string;
  'demo.floorBeast': string;
  'demo.autoTileTitle': string;
  'demo.autoTileBody': string;
  'demo.autoTileReset': string;
  'demo.autoTileRestore': string;
  'demo.autoTileMine': string;
  'demo.legendGold': string;
  'demo.legendRock': string;
  'demo.legendFloor': string;
  'demo.legendDwarf': string;
  // ------------------------------------------------------------ chrome accessibility
  'chrome.guildEmblemAlt': string;
  'chrome.siteLogoAlt': string;
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
    // ------------------------------------------------------------ theme selector (DES-05)
    'theme.group': 'Thème',
    'theme.light': 'Thème clair',
    'theme.dark': 'Thème sombre',
    'theme.system': 'Thème du système',
    'theme.switchToLight': 'Passer au thème clair',
    'theme.switchToDark': 'Passer au thème sombre',
    'theme.switchToSystem': 'Utiliser le thème du système',
    // ------------------------------------------------------------ page metadata
    'meta.title': 'Dwarven Scriptures',
    'meta.description':
      'Dwarven Scriptures — une forteresse de guilde compétitive de course de frappe.',
    // ------------------------------------------------------------ chrome (navbar, footer)
    'guild.name': 'Dwarven Scriptures',
    'guild.tag': '[GUILDE : CARRIÈRE DE FERROVEINE — EXPÉDITION N° 84]',
    'guild.streak': '🔥 SÉRIE : 14 PIERRES',
    'nav.mineRace': 'Course de mine',
    'nav.guildRanks': 'Rangs de guilde',
    'nav.runeworks': 'Atelier de runes',
    'nav.ledgers': 'Registres',
    'nav.login': '[Connexion]',
    'footer.left':
      '▪ PROFONDEUR : NIVEAU Z -480 (PITON DE MAGMA) ▪ SALLE : N° EXP-84 (LANTERNE PUBLIQUE) ▪ PROTOCOLE : ASCII_SOCKET_v2',
    'footer.status': 'STATUT : [EXTRACTION SYNCHRONISÉE]',
    'footer.optimal': '● SYSTÈME OPTIMAL : 112 MPM AU SOMMET',
    // ------------------------------------------------------------ home page (mock content)
    'home.breadcrumbLeft': '᚛ QG_DE_GUILDE // EXPÉDITION_N°84 // CITADELLE_DE_GRANIT ᚜',
    'home.breadcrumbRight': 'STATUT : FORTERESSE_ACTIVE ▪ INDICE_DE_DÉFENSE : 9400 ▪ SCEAU : INTACT',
    'home.crest.chapter': 'CHAPITRE 84',
    'home.crest.order': '[ORDRE ANCIEN]',
    'home.crest.name': 'IRONVEIN QUARRY',
    'home.crest.motto':
      '« Frappez les veines les plus profondes, gravez les runes sacrées à la plume de fer. »',
    'home.crest.statsExcavators': '⚔ 38 EXCAVATEURS ACTIFS',
    'home.crest.statsHallTier': 'RANG DU PALAIS : GRANDE FORTERESSE',
    'home.vault.adamantine.label': 'ADAMANTINE',
    'home.vault.adamantine.caption': 'Lingots entreposés',
    'home.vault.magmaFuel.label': 'CARBURANT DE MAGMA',
    'home.vault.rawGems.label': 'GEMMES BRUTES',
    'home.vault.rawGems.caption': 'Taillées et brutes',
    'home.vault.hourlyTithe.label': 'DÎME HORAIRE',
    'home.vault.hourlyTithe.caption': 'Afflux actif',
    'home.action.contribute': '[CONTRIBUER AU COFFRE]',
    'home.action.declareRace': '[LANCER UNE NOUVELLE COURSE DE CAVERNE]',
    'home.action.manageEmblem': '[GÉRER EMBLÈME ET BANNIÈRE]',
    'home.roster.title': '[ CHAMBRE // RANGS_DES_MINEURS_ET_REGISTRE_DES_TYPISTES ]',
    'home.roster.tag': '᚛ᛗᛁᚾᛖᚱᛋ᚜',
    'home.roster.registry': 'REGISTRE : 38 EMPLACEMENTS DE PIERRE OCCUPÉS SUR 50',
    'home.roster.wpmUnit': 'MPM',
    'home.roster.showing': '4 FRÈRES DE GUILDE RECONNUS AFFICHÉS SUR 38',
    'home.roster.expand': '[OUVRIR LE REGISTRE DES ARCHIVES DE LA GUILDE →]',
    'home.roster.filterAll': '[TOUS LES MINEURS (38)]',
    'home.roster.filterVeterans': '[GRAVEURS VÉTÉRANS (12)]',
    'home.roster.filterChampions': '[CHAMPIONS DE FRAPPE (6)]',
    'home.roster.filterApprentices': '[APPRENTIS (20)]',
    'home.roster.colIdentity': 'IDENTITÉ DU MINEUR',
    'home.roster.colSpecialization': 'SPÉCIALISATION',
    'home.roster.colPeakWpm': 'MPM MAX',
    'home.roster.colAccuracy': 'PRÉCISION',
    'home.roster.colStones': 'PIERRES EXTRAITES',
    'home.roster.colStatus': 'ÉTAT DE CHAMBRE',
    'home.roster.colOrders': 'ORDRES',
    'home.miners.urist.rank': '[SURINTENDANT // GRAND OR]',
    'home.miners.urist.specialization': 'Maître graveur',
    'home.miners.urist.stones': '148 920 PIERRES',
    'home.miners.urist.status': 'EN COURSE #MINE-8449',
    'home.miners.urist.action': '[INSPECTER]',
    'home.miners.darin.rank': '[CONTREMAÎTRE VÉTÉRAN]',
    'home.miners.darin.specialization': 'Spécialiste de la pioche',
    'home.miners.darin.stones': '82 400 PIERRES',
    'home.miners.darin.status': 'FORGE DES RUNES',
    'home.miners.darin.action': '[DÉFIER]',
    'home.miners.thrum.rank': '[CARRIER MASSIF]',
    'home.miners.thrum.specialization': 'Fendeur de substrat',
    'home.miners.thrum.stones': '61 120 PIERRES',
    'home.miners.thrum.status': 'REPOS À LA GRANDE SALLE',
    'home.miners.thrum.action': '[DÉFIER]',
    'home.miners.kogan.rank': '[PROSPECTEUR INSTABLE]',
    'home.miners.kogan.specialization': 'Perceur de tunnel',
    'home.miners.kogan.stones': '34 500 PIERRES',
    'home.miners.kogan.status': 'RECONNAISSANCE DU MAGMA',
    'home.miners.kogan.action': '[SANCTIONNER]',
    'home.bounties.title': '[ CHAMBRE // CONTRATS_ET_RAIDS_D_EXPÉDITION_ACTIFS ]',
    'home.bounties.tag': '᚛ᛒᛟᚢᚾᛏᛁᛖᛋ᚜',
    'home.bounties.count': '3 CONTRATS EN COURS D’EXCAVATION',
    'home.bounties.vein.title': 'CHAMBRE N° 8849 : COURSE DE LA VEINE D’ADAMANTINE',
    'home.bounties.vein.meta':
      '4 TYPISTES DANS LE TUNNEL ▪ VITESSE MAX REQUISE : 90+ MPM ▪ PROFONDEUR TACTIQUE : -520Z',
    'home.bounties.vein.reward': '+2 500 XP DE GUILDE',
    'home.bounties.vein.action': '[REJOINDRE LE CONVOI]',
    'home.bounties.vein.start': '[ENTRÉE : PORTE RUNIQUE]',
    'home.bounties.vein.lead': 'MENEUR ACTUEL : URIST (82 % EXCAVÉ)',
    'home.bounties.vein.end': '[CŒUR DE LA VEINE PROFONDE]',
    'home.bounties.vein.ascii': '[████████████████████████████░░░░░░] 82 %',
    'home.bounties.magma.title': 'ÉPREUVE DE VITESSE DU PITON DE MAGMA PROFOND (ORDAILE EN SOLO)',
    'home.bounties.magma.meta': 'EXIGENCE EXTRÊME : >95 MPM ▪ ZÉRO FAUTE (100 % DE PRÉCISION)',
    'home.bounties.magma.reward': 'PEAU LÉGENDAIRE DE PIOCHE DE MAGMA',
    'home.bounties.magma.action': '[LANCER L’ÉPREUVE]',
    'home.bounties.magma.text':
      'Runes restantes : 420 mots de glyphes de basalte sous pression en fusion.',
    'home.bounties.magma.status': 'STATUT : NON RÉCLAMÉ AUJOURD’HUI',
    'home.bounties.decryption.title': 'DÉCRYPTAGE D’UNE ANCIENNE ÉCRITURE RUNIQUE',
    'home.bounties.decryption.meta':
      'EXPÉDITION COOPÉRATIVE DE GUILDE ▪ BILINGUE [ANG / LITURGIE LATINE]',
    'home.bounties.decryption.reward': 'OBJECTIF : 50 000 MOTS',
    'home.bounties.decryption.action': '[FRAPPER LES RUNES]',
    'home.bounties.decryption.label': 'PROGRESSION : 39 000 / 50 000 MOTS EXTRAITS',
    'home.bounties.decryption.pctLabel': '78 % DÉCRYPTÉ',
    'home.bounties.decryption.ascii': '[====================>          ] 78 % DÉCRYPTÉ',
    'home.perks.title': '[ AVANTAGES_DE_LA_FORGE_RUNIQUE ]',
    'home.perks.subtitle': 'RECHERCHES ANCESTRALES ET BONUS',
    'home.perks.basalt.name': 'Maîtrise du basalte ancien',
    'home.perks.basalt.status': '[DÉBLOQUÉ]',
    'home.perks.basalt.description':
      'Multiplicateur de vitesse MPM de +5 % sur toutes les courses de cavernes volcaniques et de pitons de magma.',
    'home.perks.basalt.footnote': 'RANG I ▪ APPLIQUÉ À TOUS LES FRÈRES',
    'home.perks.fault.name': 'Renfort de tolérance aux fautes',
    'home.perks.fault.status': '[DÉBLOQUÉ]',
    'home.perks.fault.description':
      'La pioche résiste à une faute de frappe de plus sans briser l’élan de la série.',
    'home.perks.fault.footnote': 'RANG II ▪ APPLIQUÉ À TOUS LES FRÈRES',
    'home.perks.quill.name': 'Plume refroidie au magma',
    'home.perks.quill.status': 'FORGÉE À 82 %',
    'home.perks.quill.description':
      'Aucune latence d’entrée sur les frappes monospaces frénétiques. Runes de dissipation thermique.',
    'home.perks.quill.estimate': 'ESTIMATION : 4 HEURES RESTANTES',
    'home.perks.quill.action': '[ALIMENTER EN MINERAI]',
    'home.perks.beast.name': 'Couperet de la bête oubliée',
    'home.perks.beast.status': '[VERROUILLÉ : NIV 20]',
    'home.perks.beast.description':
      'Rendement d’adamantine de +25 % récolté lors des phases d’affrontement de frappe des Titans.',
    'home.chronicles.title': '[ CHRONIQUES_DE_LA_GUILDE ]',
    'home.chronicles.subtitle': 'FIL DES EXPÉDITIONS EN DIRECT // PROTOCOLE ASCII',
    'home.chronicles.placeholder': 'Gravez une entrée dans la pierre de la forteresse…',
    'home.chronicles.post': '[PUBLIER]',
    'home.chronicles.apex.time': 'IL Y A 02 MIN',
    'home.chronicles.apex.s1': '⚡ Nouveau record de vitesse maximale dans la chambre N° 8849 : ',
    'home.chronicles.apex.s2': '112 MPM',
    'home.chronicles.apex.s3': ' avec 0 faute !',
    'home.chronicles.tithe.time': 'IL Y A 14 MIN',
    'home.chronicles.tithe.s1': 'Dîme déposée : ',
    'home.chronicles.tithe.s2': '+400 lingots d’adamantine',
    'home.chronicles.tithe.s3': ' transférés au coffre.',
    'home.chronicles.caveIn.time': 'IL Y A 28 MIN',
    'home.chronicles.caveIn.s1':
      '⚠ Effondrement mineur dans la sous-veine C ! Une rafale de fautes a réduit la stabilité du tunnel de 4 %.',
    'home.chronicles.pickaxes.time': 'IL Y A 1 HEURE',
    'home.chronicles.pickaxes.s1':
      '3 pioches runiques forgées pour les apprentis typistes qui entrent dans l’épreuve du magma.',
    // ------------------------------------------------------------ auth (shared chrome)
    'auth.divider': '─── [ OU ACCORDEZ-VOUS VIA LA FORGE EXTERNE ] ───',
    'auth.security': '• CHIFFREMENT BASALTE 256 BITS • PROTOCOLE DE GUILDE ASCII_V2 •',
    'auth.provider.github': 'Forger avec GitHub',
    'auth.provider.discord': 'Accorder Discord',
    'auth.error.requiredUsername': 'Un nom est requis.',
    'auth.error.requiredPassword': 'Un mot de passe est requis.',
    'auth.error.unexpected': 'Une erreur est survenue. Réessayez.',
    'auth.showcase.ariaLabel': 'Flux en direct de la forteresse de la citadelle',
    'auth.showcase.topLeft': '[ ARCHIVES DE LA GRANDE SALLE // EXPÉDITION N° 84 ]',
    'auth.showcase.feedStatus': '● FLUX SYNCHRONISÉ',
    'auth.showcase.imageAlt':
      'Scène détaillée en pixel art d’une ancienne grande salle de forteresse naine souterraine, style Dwarf Fortress Steam Edition. Grands piliers de pierre sculptés, canaux de forge de lave rougeoyants au loin, wagonnets sur rails, gravures runiques lumineuses émeraude et ambre, scribes et mineurs nains robustes à des bureaux de basalte avec plumes et pioches, bordures de maçonnerie finement ciselées, caverne d’ardoise sombre à la lumière chaude des torches, jeu vidéo 16 bits isométrique rétro très détaillé',
    'auth.showcase.hudTitle': '[ SANCTUAIRE DEEP DELVE ]',
    'auth.showcase.activeScribesLabel': 'Scribes et mineurs actifs :',
    'auth.showcase.veinLabel': 'Veine :',
    'auth.showcase.quote':
      'Frappez le granit avec justesse, jeunes scribes. Chaque touche fortifie la grande salle de la montagne.',
    'auth.showcase.bottomLeft': '[ SECTEUR : NIVEAU_DE_LA_FORGE_INFÉRIEURE ]',
    'auth.showcase.bottomRight': 'RÉSERVOIR DE MAGMA : 1 420 °C // CAPACITÉ : 98 %',
    // ------------------------------------------------------------ login screen
    'auth.login.card.logoAlt': 'Logo de Dwarven Scriptures',
    'auth.login.card.title': '[ CITADELLE DE GRANIT ]',
    'auth.login.card.heading': 'TERMINAL D’ACCÈS DES SCRIBES',
    'auth.login.card.subtitle': 'Guilde Deep Delve • Vérification du scribe',
    'auth.login.card.status': '[STATUT : EN LIGNE]',
    'auth.login.card.terminalId': 'ID_TERM : N° 84-S',
    'auth.login.card.guidance': 'Connexion aux serveurs nains',
    'auth.login.callsign.label': '[ Identité naine ]',
    'auth.login.callsign.hint': '[nom d’utilisateur]',
    'auth.login.callsign.placeholder': 'moe lester',
    'auth.login.password.label': '[ Chiffrement ]',
    'auth.login.password.hint': '[mot de passe]',
    'auth.login.password.placeholder': '••••••••••••',
    'auth.login.remember': 'Mémoriser la pierre runique du scribe pendant 30 cycles',
    'auth.login.submit': '[ ENTRER DANS L’EXPÉDITION // CONNEXION ]',
    'auth.login.submitPending': '[ VÉRIFICATION… ]',
    'auth.login.error.invalidCredentials': 'Nom d’utilisateur ou mot de passe incorrect.',
    'auth.login.togglePassword': 'Afficher ou masquer le mot de passe',
    'auth.login.register.prompt': 'Nouveau dans la guilde souterraine ?',
    'auth.login.register.label': '[ GRAVER UN NOUVEAU DOSSIER DE SCRIBE → ]',
    // ------------------------------------------------------------ register screen
    'auth.register.card.logoAlt': 'Logo de Dwarven Scriptures',
    'auth.register.card.title': '[ CITADELLE DE GRANIT ]',
    'auth.register.card.heading': 'TERMINAL D’ENRÔLEMENT DES SCRIBES',
    'auth.register.card.subtitle': 'Guilde Deep Delve • Enrôlement d’un nouveau scribe',
    'auth.register.card.status': '[STATUT : RECRUTEMENT]',
    'auth.register.card.terminalId': 'ID_TERM : N° 84-R',
    'auth.register.card.guidance': 'Gravez votre vie dans la pierre',
    'auth.register.callsign.label': '[ Identité naine ]',
    'auth.register.callsign.hint': '[nom d’utilisateur]',
    'auth.register.callsign.placeholder': 'Joe Mama',
    'auth.register.password.label': '[ Chiffrement ]',
    'auth.register.password.hint': '[mot de passe]',
    'auth.register.password.placeholder': '••••••••••••',
    'auth.register.confirmPassword.label': '[ Re-chiffrement ]',
    'auth.register.confirmPassword.hint': '[confirmation]',
    'auth.register.confirmPassword.placeholder': '••••••••••••',
    'auth.register.terms':
      'Je jure le serment de la charte de la guilde et j’accepte les conditions gravées dans la pierre',
    'auth.register.submit': '[ GRAVER // CRÉER LE COMPTE ]',
    'auth.register.submitPending': '[ GRAVURE… ]',
    'auth.register.strength.label': 'Robustesse du mot de passe',
    'auth.register.strength.empty': 'Aucun mot de passe',
    'auth.register.strength.weak': 'Trop faible',
    'auth.register.strength.acceptable': 'Correct',
    'auth.register.strength.strong': 'Robuste',
    'auth.register.error.usernameTooLong': 'Le nom doit compter 32 caractères ou moins.',
    'auth.register.error.usernameTaken': 'Ce nom est déjà pris.',
    'auth.register.error.passwordTooShort': 'Le mot de passe doit compter au moins 12 caractères.',
    'auth.register.error.passwordTooLong': 'Le mot de passe doit compter 128 caractères ou moins.',
    'auth.register.error.passwordWeak':
      'Le mot de passe manque de variété — mélangez majuscules, minuscules, chiffres et symboles.',
    'auth.register.error.confirmRequired': 'Veuillez confirmer votre mot de passe.',
    'auth.register.error.passwordsDoNotMatch': 'Les mots de passe ne correspondent pas.',
    'auth.register.togglePassword': 'Afficher ou masquer le mot de passe',
    'auth.register.toggleConfirmPassword': 'Afficher ou masquer la confirmation du mot de passe',
    'auth.register.login.prompt': 'Déjà membre assermenté de la guilde ?',
    'auth.register.login.label': '[ RETOUR À L’ACCÈS SCRIBE → ]',
    // ------------------------------------------------------------ page titles
    'pageTitle.login': 'Citadelle de Granit // Terminal d’accès des scribes',
    'pageTitle.register': 'Citadelle de Granit // Terminal d’enrôlement des scribes',
    'pageTitle.account': 'Compte // Dossier de l’intendant',
    'pageTitle.rooms': 'Explorateur des salles',
    'pageTitle.room': 'Salle',
    'pageTitle.invitation': 'Invitation',
    // ------------------------------------------------------------ account screen
    'account.breadcrumb.left': 'ᛞ [TERMINAL_DU_DOSSIER]',
    'account.breadcrumb.node': '[NŒUD : BASALT_CRAG_01]',
    'account.breadcrumb.synced': '[SYNCHRONISÉ]',
    'account.breadcrumb.rightZ': '[NIVEAU Z : -480]',
    'account.breadcrumb.rightProtocol': '[PROTOCOLE : DWARVEN_SCRIPT_V4]',
    'account.identity.memberSincePrefix': '[MEMBRE DEPUIS :',
    'account.identity.memberSinceSuffix': ']',
    'account.identity.citadel': '[CITADELLE DE GRANIT]',
    'account.identity.edit': '[MODIFIER LE PROFIL]',
    'account.identity.logout': '[DÉCONNEXION]',
    'account.providers.githubConnected': '[GITHUB : CONNECTÉ]',
    'account.providers.discordConnected': '[DISCORD : CONNECTÉ]',
    'account.stats.title': '[TABLEAU DES STATISTIQUES PERMANENTES]',
    'account.stats.caption': '[AGRÉGÉ SUR TOUTES LES EXPÉDITIONS]',
    'account.stats.tile.racesCompleted': '[COURSES TERMINÉES]',
    'account.stats.tile.bestWpm': '[MEILLEUR MPM]',
    'account.stats.tile.avgWpm': '[MPM MOYEN]',
    'account.stats.tile.totalWords': '[TOTAL DE MOTS FRAPPÉS]',
    'account.stats.expeditionsCaption': '[EXPÉDITIONS]',
    'account.stats.wpmUnit': 'MPM',
    'account.stats.runesEngravedCaption': '[RUNES GRAVÉES]',
    'account.stats.coinsLabel': '[PIÈCES]',
    'account.stats.gemsLabel': '[GEMMES]',
    'account.chart.wpm.title': '[MPM AU FIL DU TEMPS]',
    'account.chart.wpm.apex': '[MAX : 112 MPM]',
    'account.chart.wpm.low': '[MIN : 76 MPM]',
    'account.chart.wpm.current': '[ACTUEL : 108 MPM]',
    'account.chart.wpm.tick1': '[EXP-75]',
    'account.chart.wpm.tick2': '[EXP-77]',
    'account.chart.wpm.tick3': '[EXP-79]',
    'account.chart.wpm.tick4': '[EXP-81]',
    'account.chart.wpm.tick5': '[EXP-83 (MAX)]',
    'account.chart.wpm.tick6': '[EXP-84]',
    'account.chart.races.title': '[COURSES AU FIL DU TEMPS]',
    'account.chart.races.total': '[TOTAL ENREGISTRÉ : 412]',
    'account.chart.races.streaks': '[SÉRIES SANS FAUTE : 22]',
    'account.chart.races.daily': '[VOLUME QUOTIDIEN : 28]',
    'account.chart.races.tickDay9': '[J-9]',
    'account.chart.races.tickDay7': '[J-7]',
    'account.chart.races.tickDay5': '[J-5]',
    'account.chart.races.tickDay3': '[J-3]',
    'account.chart.races.tickYesterday': '[HIER]',
    'account.chart.races.tickToday': '[AUJOURD’HUI]',
    'account.chart.last10Races': '[10 DERNIÈRES COURSES]',
    'account.chart.allTime': '[TOUT L’HISTORIQUE]',
    'account.history.title': '[HISTORIQUE DES COURSES]',
    'account.history.caption': '[EXPÉDITIONS ENREGISTRÉES]',
    'account.history.filterLabel': '[FILTRE]',
    'account.history.colDate': '[DATE]',
    'account.history.colWpm': '[MPM]',
    'account.history.colAccuracy': '[PRÉCISION]',
    'account.history.colPlace': '[RANG]',
    'account.history.colLanguage': '[LANGUE]',
    'account.history.colDuration': '[DURÉE]',
    'account.history.filterAll': '[TOUT]',
    'account.history.filterRecent': '[RÉCENT]',
    'account.history.filterBest': '[MEILLEUR]',
    'account.history.exp84.wpm': '108 MPM',
    'account.history.exp84.place': '[1ER 🥇]',
    'account.history.exp84.language': '[ANG / RUNIQUE]',
    'account.history.exp83.wpm': '112 MPM 🔥',
    'account.history.exp83.place': '[1ER 👑]',
    'account.history.exp83.language': '[LITURGIE LATINE]',
    'account.history.exp82.wpm': '94 MPM',
    'account.history.exp82.place': '[2E 🥈]',
    'account.history.exp82.language': '[ANG / CODE]',
    'account.history.exp81.wpm': '88 MPM',
    'account.history.exp81.place': '[2E 🥈]',
    'account.history.exp81.language': '[FRANÇAIS / CONTE]',
    'account.history.exp80.wpm': '82 MPM',
    'account.history.exp80.place': '[3E 🥉]',
    'account.history.exp80.language': '[ANG / BASALTE]',
    'account.history.footerShowing': '[5 AFFICHÉES SUR 412]',
    'account.history.footerPrev': '[PRÉC]',
    'account.history.footerPage': '[PAGE 1 / 83]',
    'account.history.footerNext': '[SUIV]',
    'account.heatmap.title': '[CARTE DE CHALEUR DU CLAVIER]',
    'account.heatmap.caption': '[FRÉQUENCE D’ERREUR PAR TOUCHE]',
    'account.heatmap.legendLabel': '[LÉGENDE]',
    'account.heatmap.legendAccurate': '[FIABLE]',
    'account.heatmap.legendMedium': '[MOYEN]',
    'account.heatmap.legendWeak': '[FAIBLE / ERREUR FRÉQUENTE]',
    'account.heatmap.key.back': '[RETOUR]',
    'account.heatmap.key.tab': '[TAB]',
    'account.heatmap.key.caps': '[VERR MAJ]',
    'account.heatmap.key.enter': '[ENTRÉE]',
    'account.heatmap.key.shift': '[MAJ]',
    'account.heatmap.key.ctrl': '[CTRL]',
    'account.heatmap.key.alt': '[ALT]',
    'account.heatmap.key.space': '[ESPACE] — 99,8 % DE PRÉCISION',
    'account.heatmap.weakestLabel': '⚠ [TOUCHES LES PLUS FAIBLES] :',
    'account.heatmap.drill': '[EXERCICE RECOMMANDÉ : « PONCTUATION ET RUNES DE L’AURICULAIRE DROIT »]',
    'account.modal.header': 'ᛞ [DIALOGUE // PARAMÈTRES_DU_PROFIL]',
    'account.modal.statusActive': '[STATUT : ACTIF]',
    'account.modal.discardTitle': '[ABANDONNER]',
    'account.modal.title': 'CISELER LE DOSSIER DU SCRIBE ET LES PARAMÈTRES',
    'account.modal.subtitle':
      'Configurez l’identifiant runique, les nœuds de télémétrie liés et les profils sonores de ciseau.',
    'account.modal.tabIdentity': '[IDENTITÉ ET INDICATIF]',
    'account.modal.tabAccounts': '[COMPTES LIÉS]',
    'account.modal.tabPreferences': '[PRÉFÉRENCES D’EXPÉDITION]',
    'account.modal.identitySection': '[01 // IDENTITÉ ET INDICATIF]',
    'account.modal.citadelRegistered': '[CITADELLE ENREGISTRÉE]',
    'account.modal.usernameLabel': '[ NOM D’UTILISATEUR DU SCRIBE ]',
    'account.modal.availableYes': '[DISPONIBLE : OUI]',
    'account.modal.avatarLabel': '[ CHOIX DE L’EMBLÈME D’AVATAR ]',
    'account.modal.avatarActive': 'ACTIF',
    'account.modal.avatarHint': 'Laissez vide pour retirer l’avatar et restaurer l’icône de repli.',
    'account.modal.accountsSection': '[02 // COMPTES LIÉS ET TÉLÉMÉTRIE]',
    'account.modal.oauthSecure': '[OAUTH2 SÉCURISÉ]',
    'account.modal.disconnect': '[DÉCONNECTER]',
    'account.modal.connect': '[CONNECTER]',
    'account.modal.preferencesSection': '[03 // PRÉFÉRENCES D’EXPÉDITION]',
    'account.modal.audioScripts': '[AUDIO ET SCRIPTS]',
    'account.modal.keystrokeLabel': '[ SON DE FRAPPE : CISEAU AUDITIF ]',
    'account.modal.sound1': '[CHERRY MX BLUE / CLAC DE GRANIT PROFOND]',
    'account.modal.sound2': '[SILEX DE MAGMA / FRAPPE D’ENCLUME LOURDE]',
    'account.modal.sound3': '[ÉCLAT DE BASALTE / TACTILE DISCRET]',
    'account.modal.sound4': '[CAVERNE SILENCIEUSE / RUNES ASSOURDIES]',
    'account.modal.scriptLabel': '[ SCRIPT RUNIQUE PAR DÉFAUT / EXERCICE DE LANGUE ]',
    'account.modal.script1': '[SCRIPT PAR DÉFAUT : ANGLAIS + LATIN]',
    'account.modal.script2': '[RUNIQUE ANCIEN / PROTOCOLE NAIN]',
    'account.modal.script3': '[EXPÉDITION POLYGLOTTE : ANG + FRE + GER]',
    'account.modal.script4': '[MATRICE DE CODE HEXADÉCIMAL]',
    'account.modal.persistNote': 'ᛞ [LES MODIFICATIONS SONT CONSERVÉES DANS LE CŒUR DE LA CITADELLE]',
    'account.modal.discard': '[ ABANDONNER ]',
    'account.modal.submitPending': '[ GRAVURE… ]',
    'account.modal.submit': '[ GRAVER ]',
    'account.modal.githubConnected': 'GITHUB : CONNECTÉ',
    'account.modal.githubDisconnected': 'GITHUB : NON CONNECTÉ',
    'account.modal.discordConnected': 'DISCORD : CONNECTÉ',
    'account.modal.discordDisconnected': 'DISCORD : NON CONNECTÉ',
    'account.modal.oauthNote': '[SYNC OAUTH2 ACTIF]',
    'account.modal.error.usernameRequired': 'Un nom est requis.',
    'account.modal.error.usernameTooLong': 'Le nom doit compter au plus 32 caractères.',
    'account.modal.error.usernameTaken': 'Ce nom est déjà pris.',
    'account.modal.error.invalidUrl': 'Saisissez une URL d’image http(s) valide.',
    // ------------------------------------------------------------ dev-only sprite demos
    'demo.preloading': 'Préchargement des feuilles de sprites…',
    'demo.showcaseTitle': 'Vitrine du registre de sprites',
    'demo.showcaseSubtitle':
      'Démo réservée au développement du registre de sprites typé et du rendu par feuilles CSS.',
    'demo.sectionTerrain': 'Terrain et murs',
    'demo.sectionMining': 'Progression de l’extraction (animée)',
    'demo.sectionActors': 'Acteurs joueurs',
    'demo.sectionLayered': 'Tuiles superposées (enfants / surcouches)',
    'demo.sectionMonsters': 'Monstres dynamiques',
    'demo.pickaxeSwing': 'balancement de pioche (animé)',
    'demo.idleHighlight': 'inactif + teinte de surbrillance',
    'demo.floorBeast': 'sol + surcouche de bête',
    'demo.autoTileTitle': 'Auto-pavage et cellules superposées',
    'demo.autoTileBody':
      'Cliquez sur une tuile pour l’extraire (air). La roche enfouie est retirée ; la roche exposée affiche une paroi, et les veines d’or exposées une face minérale teintée avec des coins intérieurs. Un couloir est préextrait pour voir l’effet immédiatement.',
    'demo.autoTileReset': 'Réinitialiser',
    'demo.autoTileRestore': 'Restaurer la tuile',
    'demo.autoTileMine': 'Extraire la tuile',
    'demo.legendGold': 'veine d’or (teinte minérale)',
    'demo.legendRock': 'paroi rocheuse exposée',
    'demo.legendFloor': 'sol extrait (air)',
    'demo.legendDwarf': 'occupant nain',
    // ------------------------------------------------------------ chrome accessibility
    'chrome.guildEmblemAlt': 'Emblème de la guilde Dwarf Fortress Delve',
    'chrome.siteLogoAlt': 'Logo de Dwarven Scriptures',
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
    // ------------------------------------------------------------ theme selector (DES-05)
    'theme.group': 'Theme',
    'theme.light': 'Light theme',
    'theme.dark': 'Dark theme',
    'theme.system': 'System theme',
    'theme.switchToLight': 'Switch to the light theme',
    'theme.switchToDark': 'Switch to the dark theme',
    'theme.switchToSystem': 'Use the system theme',
    // ------------------------------------------------------------ page metadata
    'meta.title': 'Dwarven Scriptures',
    'meta.description':
      'Dwarven Scriptures — a competitive typing-race guild stronghold.',
    // ------------------------------------------------------------ chrome (navbar, footer)
    'guild.name': 'Dwarven Scriptures',
    'guild.tag': '[GUILD: IRONVEIN QUARRY - EXPEDITION #84]',
    'guild.streak': '🔥 STREAK: 14 STONES',
    'nav.mineRace': 'Mine Race',
    'nav.guildRanks': 'Guild Ranks',
    'nav.runeworks': 'Runeworks',
    'nav.ledgers': 'Ledgers',
    'nav.login': '[Login]',
    'footer.left':
      '▪ DEPTH: -480 Z-LEVEL (MAGMA CRAG) ▪ ROOM: #EXP-84 (PUBLIC LANTERN) ▪ PROTOCOL: ASCII_SOCKET_v2',
    'footer.status': 'STATUS: [MINING SYNCHRONIZED]',
    'footer.optimal': '● SYSTEM OPTIMAL: 112 WPM APEX',
    // ------------------------------------------------------------ home page (mock content)
    'home.breadcrumbLeft': '᚛ GUILD_HQ // EXPEDITION_#84 // CITADEL_OF_GRANITE ᚜',
    'home.breadcrumbRight': 'STATUS: FORTRESS_ACTIVE ▪ DEFENSE_RATING: 9400 ▪ SEAL: INTACT',
    'home.crest.chapter': 'CHAPTER 84',
    'home.crest.order': '[ANCIENT ORDER]',
    'home.crest.name': 'IRONVEIN QUARRY',
    'home.crest.motto':
      '\u201CStrike the Deepest Veins, Etch the Sacred Runes with Iron Quill.\u201D',
    'home.crest.statsExcavators': '⚔ 38 EXCAVATORS ACTIVE',
    'home.crest.statsHallTier': 'HALL TIER: GRAND STRONGHOLD',
    'home.vault.adamantine.label': 'ADAMANTINE',
    'home.vault.adamantine.caption': 'Ingots Stored',
    'home.vault.magmaFuel.label': 'MAGMA FUEL',
    'home.vault.rawGems.label': 'RAW GEMS',
    'home.vault.rawGems.caption': 'Cut & Uncut',
    'home.vault.hourlyTithe.label': 'HOURLY TITHE',
    'home.vault.hourlyTithe.caption': 'Active Surge Active',
    'home.action.contribute': '[CONTRIBUTE TO VAULT]',
    'home.action.declareRace': '[DECLARE NEW CAVERN RACE]',
    'home.action.manageEmblem': '[MANAGE EMBLEM & BANNER]',
    'home.roster.title': '[ CHAMBER // MINER_RANKS_&_TYPIST_ROSTER ]',
    'home.roster.tag': '᚛ᛗᛁᚾᛖᚱᛋ᚜',
    'home.roster.registry': 'REGISTRY: 38 OF 50 STONE SLOTS FILLED',
    'home.roster.wpmUnit': 'WPM',
    'home.roster.showing': 'SHOWING 4 OF 38 RECOGNIZED GUILD BROTHERS',
    'home.roster.expand': '[EXPAND GUILD ARCHIVE LEDGER →]',
    'home.roster.filterAll': '[ALL MINERS (38)]',
    'home.roster.filterVeterans': '[VETERAN ENGRAVERS (12)]',
    'home.roster.filterChampions': '[CHAMPION TYPISTS (6)]',
    'home.roster.filterApprentices': '[APPRENTICES (20)]',
    'home.roster.colIdentity': 'MINER IDENTITY',
    'home.roster.colSpecialization': 'SPECIALIZATION',
    'home.roster.colPeakWpm': 'PEAK WPM',
    'home.roster.colAccuracy': 'ACCURACY',
    'home.roster.colStones': 'STONES MINED',
    'home.roster.colStatus': 'CHAMBER STATUS',
    'home.roster.colOrders': 'ORDERS',
    'home.miners.urist.rank': '[OVERSEER // GRAND GOLD]',
    'home.miners.urist.specialization': 'Master Engraver',
    'home.miners.urist.stones': '148,920 STONES',
    'home.miners.urist.status': 'RACING #MINE-8449',
    'home.miners.urist.action': '[INSPECT]',
    'home.miners.darin.rank': '[VETERAN FOREMAN]',
    'home.miners.darin.specialization': 'Pickaxe Specialist',
    'home.miners.darin.stones': '82,400 STONES',
    'home.miners.darin.status': 'FORGING RUNES',
    'home.miners.darin.action': '[CHALLENGE]',
    'home.miners.thrum.rank': '[HEAVY QUARRIER]',
    'home.miners.thrum.specialization': 'Bedrock Cleaver',
    'home.miners.thrum.stones': '61,120 STONES',
    'home.miners.thrum.status': 'MEAD HALL REST',
    'home.miners.thrum.action': '[CHALLENGE]',
    'home.miners.kogan.rank': '[UNSTABLE PROSPECTOR]',
    'home.miners.kogan.specialization': 'Tunnel Breaker',
    'home.miners.kogan.stones': '34,500 STONES',
    'home.miners.kogan.status': 'SCOUTING MAGMA',
    'home.miners.kogan.action': '[DISCIPLINE]',
    'home.bounties.title': '[ CHAMBER // ACTIVE_EXPEDITION_CONTRACTS_&_RAIDS ]',
    'home.bounties.tag': '᚛ᛒᛟᚢᚾᛏᛁᛖᛋ᚜',
    'home.bounties.count': '3 BOUNTIES UNDER EXCAVATION',
    'home.bounties.vein.title': 'CHAMBER #8849: ADAMANTINE VEIN RACE',
    'home.bounties.vein.meta': '4 TYPISTS IN TUNNEL ▪ APEX SPEED REQ: 90+ WPM ▪ TACTICAL DEPTH: -520Z',
    'home.bounties.vein.reward': '+2,500 GUILD XP',
    'home.bounties.vein.action': '[JOIN CART]',
    'home.bounties.vein.start': '[ENTRANCE: RUNIC GATE]',
    'home.bounties.vein.lead': 'CURRENT LEAD: URIST (82% EXCAVATED)',
    'home.bounties.vein.end': '[DEEP VEIN CORE]',
    'home.bounties.vein.ascii': '[████████████████████████████░░░░░░] 82%',
    'home.bounties.magma.title': 'DEEP MAGMA CRAG SPEED TRIAL (SOLO ORDEAL)',
    'home.bounties.magma.meta': 'HARDCORE REQUIREMENT: >95 WPM ▪ ZERO FAULTS (100% ACCURACY)',
    'home.bounties.magma.reward': 'LEGENDARY MAGMA PICKAXE SKIN',
    'home.bounties.magma.action': '[COMMENCE TRIAL]',
    'home.bounties.magma.text': 'Runes Remaining: 420 words of basalt glyphs under molten pressure.',
    'home.bounties.magma.status': 'STATUS: UNCLAIMED TODAY',
    'home.bounties.decryption.title': 'ANCIENT RUNIC SCRIPTURE DECRYPTION',
    'home.bounties.decryption.meta': 'COOPERATIVE GUILD DELVE ▪ DUAL LINGUAL [ENG / LATIN LITURGY]',
    'home.bounties.decryption.reward': 'GOAL: 50,000 WORDS',
    'home.bounties.decryption.action': '[TYPE RUNES]',
    'home.bounties.decryption.label': 'PROGRESSION: 39,000 / 50,000 WORDS MINED',
    'home.bounties.decryption.pctLabel': '78% DECRYPTED',
    'home.bounties.decryption.ascii': '[====================>          ] 78% DECRYPTED',
    'home.perks.title': '[ RUNIC_FORGE_PERKS ]',
    'home.perks.subtitle': 'ANCESTRAL RESEARCH & BUFFS',
    'home.perks.basalt.name': 'Ancient Basalt Mastery',
    'home.perks.basalt.status': '[UNLOCKED]',
    'home.perks.basalt.description':
      '+5% WPM velocity multiplier across all volcanic cavern and magma crag race courses.',
    'home.perks.basalt.footnote': 'TIER I ▪ APPLIED TO ALL BROTHERS',
    'home.perks.fault.name': 'Fault Tolerance Reinforcement',
    'home.perks.fault.status': '[UNLOCKED]',
    'home.perks.fault.description':
      'Pickaxe withstands +1 typo fault without shattering rock streak momentum.',
    'home.perks.fault.footnote': 'TIER II ▪ APPLIED TO ALL BROTHERS',
    'home.perks.quill.name': 'Magma-Cooled Quill',
    'home.perks.quill.status': '82% FORGED',
    'home.perks.quill.description':
      'Zero input lag buffering on frantic monospaced keystrokes. Heat dissipation runes.',
    'home.perks.quill.estimate': 'EST: 4 HOURS REMAINING',
    'home.perks.quill.action': '[FEED ORE]',
    'home.perks.beast.name': 'Forgotten Beast Cleaver',
    'home.perks.beast.status': '[LOCKED: LVL 20]',
    'home.perks.beast.description':
      '+25% Adamantine yield harvested from Titan keystroke encounter phases.',
    'home.chronicles.title': '[ GUILD_CHRONICLES ]',
    'home.chronicles.subtitle': 'LIVE EXPEDITION TICKER // PROTOCOL ASCII',
    'home.chronicles.placeholder': 'Carve entry into the stronghold stone...',
    'home.chronicles.post': '[POST]',
    'home.chronicles.apex.time': '02 MINS AGO',
    'home.chronicles.apex.s1': '⚡ New Apex Speed Record set in Chamber #8849: ',
    'home.chronicles.apex.s2': '112 WPM',
    'home.chronicles.apex.s3': ' with 0 faults!',
    'home.chronicles.tithe.time': '14 MINS AGO',
    'home.chronicles.tithe.s1': 'Tithe deposited: ',
    'home.chronicles.tithe.s2': '+400 Adamantine Ingots',
    'home.chronicles.tithe.s3': ' transferred to Vault.',
    'home.chronicles.caveIn.time': '28 MINS AGO',
    'home.chronicles.caveIn.s1':
      '⚠ Minor Cave-in triggered in Sub-Vein C! Typo burst dropped tunnel stability by 4%.',
    'home.chronicles.pickaxes.time': '1 HOUR AGO',
    'home.chronicles.pickaxes.s1':
      'Crafted 3x Rune Pickaxes for apprentice typists entering the magma trial.',
    // ------------------------------------------------------------ auth (shared chrome)
    'auth.divider': '─── [ OR ATTUNE VIA EXTERNAL FORGE ] ───',
    'auth.security': '• 256-BIT BASALT ENCRYPTION • GUILD PROTOCOL ASCII_V2 •',
    'auth.provider.github': 'Forge with GitHub',
    'auth.provider.discord': 'Attune Discord',
    'auth.error.requiredUsername': 'A name is required.',
    'auth.error.requiredPassword': 'A password is required.',
    'auth.error.unexpected': 'Something went wrong. Please try again.',
    'auth.showcase.ariaLabel': 'Citadel Fortress Live Feed',
    'auth.showcase.topLeft': '[ CITADEL HALL ARCHIVE // EXPEDITION #84 ]',
    'auth.showcase.feedStatus': '● FEED SYNCED',
    'auth.showcase.imageAlt':
      'Detailed pixel art scene of an ancient subterranean Dwarven fortress hall in Dwarf Fortress Steam Edition style. Grand stone carved pillars, warm glowing lava forge channels in the distance, mining carts on tracks, glowing runic engravings in emerald and amber, rugged dwarven scribes and miners at basalt desks with quills and picks, intricate stone masonry borders, atmospheric dark slate cavern with warm torchlight, retro isometric high detail 16-bit video game art',
    'auth.showcase.hudTitle': '[ DEEP DELVE SANCTUM ]',
    'auth.showcase.activeScribesLabel': 'Active Scribes & Miners:',
    'auth.showcase.veinLabel': 'Vein:',
    'auth.showcase.quote':
      'Strike the granite true, young scribes. Every keystroke fortifies the mountain hall.',
    'auth.showcase.bottomLeft': '[ SECTOR: LOWER_FORGE_LEVEL ]',
    'auth.showcase.bottomRight': 'MAGMA RESERVOIR: 1,420°C // 98% CAPACITY',
    // ------------------------------------------------------------ login screen
    'auth.login.card.logoAlt': 'Logo of Dwarven Scriptures',
    'auth.login.card.title': '[ CITADEL OF GRANITE ]',
    'auth.login.card.heading': 'SCRIBE ACCESS TERMINAL',
    'auth.login.card.subtitle': 'Deep Delve Guild • Scribe Verification',
    'auth.login.card.status': '[STATUS: ONLINE]',
    'auth.login.card.terminalId': 'TERM_ID: #84-S',
    'auth.login.card.guidance': 'Connect to the dwarven servers',
    'auth.login.callsign.label': '[ Dwarven identity ]',
    'auth.login.callsign.hint': '[username]',
    'auth.login.callsign.placeholder': 'moe lester',
    'auth.login.password.label': '[ CIPHER ]',
    'auth.login.password.hint': '[password]',
    'auth.login.password.placeholder': '••••••••••••',
    'auth.login.remember': 'Remember Scribe Rune-Stone for 30 cycles',
    'auth.login.submit': '[ ENTER THE DELVE // LOGIN ]',
    'auth.login.submitPending': '[ VERIFYING… ]',
    'auth.login.error.invalidCredentials': 'Incorrect username or password.',
    'auth.login.togglePassword': 'Toggle password visibility',
    'auth.login.register.prompt': 'New to the subterranean guild?',
    'auth.login.register.label': '[ ENGRAVE NEW SCRIBE DOSSIER → ]',
    // ------------------------------------------------------------ register screen
    'auth.register.card.logoAlt': 'Logo of Dwarven Scriptures',
    'auth.register.card.title': '[ CITADEL OF GRANITE ]',
    'auth.register.card.heading': 'SCRIBE REGISTRATION TERMINAL',
    'auth.register.card.subtitle': 'Deep Delve Guild • New Scribe Enlistment',
    'auth.register.card.status': '[STATUS: RECRUITING]',
    'auth.register.card.terminalId': 'TERM_ID: #84-R',
    'auth.register.card.guidance': 'Engrave your life on a stone',
    'auth.register.callsign.label': '[ Dwarven identity ]',
    'auth.register.callsign.hint': '[username]',
    'auth.register.callsign.placeholder': 'Joe Mama',
    'auth.register.password.label': '[ CIPHER ]',
    'auth.register.password.hint': '[password]',
    'auth.register.password.placeholder': '••••••••••••',
    'auth.register.confirmPassword.label': '[ RE-CIPHER ]',
    'auth.register.confirmPassword.hint': '[confirm]',
    'auth.register.confirmPassword.placeholder': '••••••••••••',
    'auth.register.terms': 'I swear the Guild Charter oath and accept the stonebound terms',
    'auth.register.submit': '[ ENGRAVE // CREATE ACCOUNT ]',
    'auth.register.submitPending': '[ ENGRAVING… ]',
    'auth.register.strength.label': 'Password strength',
    'auth.register.strength.empty': 'No password',
    'auth.register.strength.weak': 'Too weak',
    'auth.register.strength.acceptable': 'Good enough',
    'auth.register.strength.strong': 'Strong',
    'auth.register.error.usernameTooLong': 'Name must be 32 characters or fewer.',
    'auth.register.error.usernameTaken': 'That name is already taken.',
    'auth.register.error.passwordTooShort': 'Password must be at least 12 characters.',
    'auth.register.error.passwordTooLong': 'Password must be 128 characters or fewer.',
    'auth.register.error.passwordWeak':
      'Password needs more variety — mix upper/lowercase letters, numbers and symbols.',
    'auth.register.error.confirmRequired': 'Please confirm your password.',
    'auth.register.error.passwordsDoNotMatch': 'Passwords do not match.',
    'auth.register.togglePassword': 'Toggle password visibility',
    'auth.register.toggleConfirmPassword': 'Toggle confirm password visibility',
    'auth.register.login.prompt': 'Already a sworn member of the guild?',
    'auth.register.login.label': '[ RETURN TO SCRIBE ACCESS → ]',
    // ------------------------------------------------------------ page titles
    'pageTitle.login': 'Citadel of Granite // Scribe Access Terminal',
    'pageTitle.register': 'Citadel of Granite // Scribe Registration Terminal',
    'pageTitle.account': 'Account // Overseer Dossier',
    'pageTitle.rooms': 'Room explorer',
    'pageTitle.room': 'Room',
    'pageTitle.invitation': 'Invitation',
    // ------------------------------------------------------------ account screen
    'account.breadcrumb.left': 'ᛞ [DOSSIER_TERMINAL]',
    'account.breadcrumb.node': '[NODE: BASALT_CRAG_01]',
    'account.breadcrumb.synced': '[SYNCED]',
    'account.breadcrumb.rightZ': '[Z-LEVEL: -480]',
    'account.breadcrumb.rightProtocol': '[PROTOCOL: DWARVEN_SCRIPT_V4]',
    'account.identity.memberSincePrefix': '[MEMBER SINCE:',
    'account.identity.memberSinceSuffix': ']',
    'account.identity.citadel': '[CITADEL OF GRANITE]',
    'account.identity.edit': '[EDIT PROFILE]',
    'account.identity.logout': '[LOG OUT]',
    'account.providers.githubConnected': '[GITHUB: CONNECTED]',
    'account.providers.discordConnected': '[DISCORD: CONNECTED]',
    'account.stats.title': '[LIFETIME STATS DASHBOARD]',
    'account.stats.caption': '[AGGREGATED ACROSS ALL DELVES]',
    'account.stats.tile.racesCompleted': '[RACES COMPLETED]',
    'account.stats.tile.bestWpm': '[BEST WPM]',
    'account.stats.tile.avgWpm': '[AVERAGE WPM]',
    'account.stats.tile.totalWords': '[TOTAL WORDS TYPED]',
    'account.stats.expeditionsCaption': '[EXPEDITIONS]',
    'account.stats.wpmUnit': 'WPM',
    'account.stats.runesEngravedCaption': '[RUNES ENGRAVED]',
    'account.stats.coinsLabel': '[COINS]',
    'account.stats.gemsLabel': '[GEMS]',
    'account.chart.wpm.title': '[WPM OVER TIME]',
    'account.chart.wpm.apex': '[APEX: 112 WPM]',
    'account.chart.wpm.low': '[LOW: 76 WPM]',
    'account.chart.wpm.current': '[CURRENT: 108 WPM]',
    'account.chart.wpm.tick1': '[EXP-75]',
    'account.chart.wpm.tick2': '[EXP-77]',
    'account.chart.wpm.tick3': '[EXP-79]',
    'account.chart.wpm.tick4': '[EXP-81]',
    'account.chart.wpm.tick5': '[EXP-83 (APEX)]',
    'account.chart.wpm.tick6': '[EXP-84]',
    'account.chart.races.title': '[RACES OVER TIME]',
    'account.chart.races.total': '[TOTAL LOGGED: 412]',
    'account.chart.races.streaks': '[FAULTLESS STREAKS: 22]',
    'account.chart.races.daily': '[DAILY VOLUME: 28]',
    'account.chart.races.tickDay9': '[DAY -9]',
    'account.chart.races.tickDay7': '[DAY -7]',
    'account.chart.races.tickDay5': '[DAY -5]',
    'account.chart.races.tickDay3': '[DAY -3]',
    'account.chart.races.tickYesterday': '[YESTERDAY]',
    'account.chart.races.tickToday': '[TODAY]',
    'account.chart.last10Races': '[LAST 10 RACES]',
    'account.chart.allTime': '[ALL TIME]',
    'account.history.title': '[RACE HISTORY]',
    'account.history.caption': '[LOGGED EXPEDITIONS]',
    'account.history.filterLabel': '[FILTER]',
    'account.history.colDate': '[DATE]',
    'account.history.colWpm': '[WPM]',
    'account.history.colAccuracy': '[ACCURACY]',
    'account.history.colPlace': '[PLACE]',
    'account.history.colLanguage': '[LANGUAGE]',
    'account.history.colDuration': '[DURATION]',
    'account.history.filterAll': '[ALL]',
    'account.history.filterRecent': '[RECENT]',
    'account.history.filterBest': '[BEST]',
    'account.history.exp84.wpm': '108 WPM',
    'account.history.exp84.place': '[1ST 🥇]',
    'account.history.exp84.language': '[ENG / RUNIC]',
    'account.history.exp83.wpm': '112 WPM 🔥',
    'account.history.exp83.place': '[1ST 👑]',
    'account.history.exp83.language': '[LATIN LITURGY]',
    'account.history.exp82.wpm': '94 WPM',
    'account.history.exp82.place': '[2ND 🥈]',
    'account.history.exp82.language': '[ENG / CODE]',
    'account.history.exp81.wpm': '88 WPM',
    'account.history.exp81.place': '[2ND 🥈]',
    'account.history.exp81.language': '[FRENCH / TALE]',
    'account.history.exp80.wpm': '82 WPM',
    'account.history.exp80.place': '[3RD 🥉]',
    'account.history.exp80.language': '[ENG / BASALT]',
    'account.history.footerShowing': '[SHOWING 5 OF 412]',
    'account.history.footerPrev': '[PREV]',
    'account.history.footerPage': '[PAGE 1 / 83]',
    'account.history.footerNext': '[NEXT]',
    'account.heatmap.title': '[KEYBOARD HEATMAP]',
    'account.heatmap.caption': '[ERROR FREQUENCY BY KEYSTROKE]',
    'account.heatmap.legendLabel': '[LEGEND]',
    'account.heatmap.legendAccurate': '[ACCURATE]',
    'account.heatmap.legendMedium': '[MEDIUM]',
    'account.heatmap.legendWeak': '[WEAK / FREQ ERROR]',
    'account.heatmap.key.back': '[BACK]',
    'account.heatmap.key.tab': '[TAB]',
    'account.heatmap.key.caps': '[CAPS]',
    'account.heatmap.key.enter': '[ENTER]',
    'account.heatmap.key.shift': '[SHIFT]',
    'account.heatmap.key.ctrl': '[CTRL]',
    'account.heatmap.key.alt': '[ALT]',
    'account.heatmap.key.space': '[SPACE] — 99.8% ACCURATE',
    'account.heatmap.weakestLabel': '⚠ [WEAKEST KEYS]:',
    'account.heatmap.drill': '[RECOMMENDED DRILL: "PUNCTUATION & RIGHT PINKY RUNES"]',
    'account.modal.header': 'ᛞ [DIALOGUE // PROFILE_SETTINGS]',
    'account.modal.statusActive': '[STATUS: ACTIVE]',
    'account.modal.discardTitle': '[DISCARD]',
    'account.modal.title': 'CHISEL SCRIBE DOSSIER & SETTINGS',
    'account.modal.subtitle':
      'Configure runic identifier, linked telemetry nodes, and auditory chisel profiles.',
    'account.modal.tabIdentity': '[IDENTITY & CALLSIGN]',
    'account.modal.tabAccounts': '[LINKED ACCOUNTS]',
    'account.modal.tabPreferences': '[DELVE PREFERENCES]',
    'account.modal.identitySection': '[01 // IDENTITY & CALLSIGN]',
    'account.modal.citadelRegistered': '[CITADEL REGISTERED]',
    'account.modal.usernameLabel': '[ SCRIBE USERNAME ]',
    'account.modal.availableYes': '[AVAIL: YES]',
    'account.modal.avatarLabel': '[ AVATAR EMBLEM SELECTION ]',
    'account.modal.avatarActive': 'ACTIVE',
    'account.modal.avatarHint': 'Leave empty to clear the avatar and restore the fallback icon.',
    'account.modal.accountsSection': '[02 // LINKED ACCOUNTS & TELEMETRY]',
    'account.modal.oauthSecure': '[OAUTH2 SECURE]',
    'account.modal.disconnect': '[DISCONNECT]',
    'account.modal.connect': '[CONNECT]',
    'account.modal.preferencesSection': '[03 // DELVE PREFERENCES]',
    'account.modal.audioScripts': '[AUDIO & SCRIPTS]',
    'account.modal.keystrokeLabel': '[ KEYSTROKE SOUND: AUDITORY CHISEL ]',
    'account.modal.sound1': '[CHERRY MX BLUE / DEEP GRANITE CLACK]',
    'account.modal.sound2': '[MAGMA FLINT / HEAVY ANVIL STRIKE]',
    'account.modal.sound3': '[BASALT CHIP / SUBDUED TACTILE]',
    'account.modal.sound4': '[SILENT CAVERN / MUTED RUNES]',
    'account.modal.scriptLabel': '[ DEFAULT RUNIC SCRIPT / LANGUAGE DRILL ]',
    'account.modal.script1': '[DEFAULT RUNIC SCRIPT: ENGLISH + LATIN]',
    'account.modal.script2': '[ANCIENT RUNIC / DWARVEN PROTOCOL]',
    'account.modal.script3': '[POLYGLOT DELVE: ENG + FRE + GER]',
    'account.modal.script4': '[HEXADECIMAL CODE MATRIX]',
    'account.modal.persistNote': 'ᛞ [CHANGES PERSIST TO CITADEL CORE]',
    'account.modal.discard': '[ DISCARD ]',
    'account.modal.submitPending': '[ ENGRAVING… ]',
    'account.modal.submit': '[ ENGRAVE ]',
    'account.modal.githubConnected': 'GITHUB: CONNECTED',
    'account.modal.githubDisconnected': 'GITHUB: NOT CONNECTED',
    'account.modal.discordConnected': 'DISCORD: CONNECTED',
    'account.modal.discordDisconnected': 'DISCORD: NOT CONNECTED',
    'account.modal.oauthNote': '[OAUTH2 SYNC ACTIVE]',
    'account.modal.error.usernameRequired': 'A name is required.',
    'account.modal.error.usernameTooLong': 'Name must be at most 32 characters.',
    'account.modal.error.usernameTaken': 'That name is already taken.',
    'account.modal.error.invalidUrl': 'Enter a valid http(s) image URL.',
    // ------------------------------------------------------------ dev-only sprite demos
    'demo.preloading': 'Preloading sprite sheets…',
    'demo.showcaseTitle': 'Sprite Registry Showcase',
    'demo.showcaseSubtitle':
      'Dev-only demo of the type-safe sprite registry and CSS sprite-sheet renderer.',
    'demo.sectionTerrain': 'Terrain & Walls',
    'demo.sectionMining': 'Mining Progress (animated)',
    'demo.sectionActors': 'Player Actors',
    'demo.sectionLayered': 'Layered Tiles (children / overlays)',
    'demo.sectionMonsters': 'Dynamic Monsters',
    'demo.pickaxeSwing': 'pickaxe swing (animated)',
    'demo.idleHighlight': 'idle + highlight tint',
    'demo.floorBeast': 'floor + beast overlay',
    'demo.autoTileTitle': 'Auto-Tiling & Layered Cells',
    'demo.autoTileBody':
      'Click a tile to mine it out (air). Buried rock is culled; exposed rock renders a wall face, and exposed gold veins render a tinted mineral face with inner corners. A corridor is pre-mined so you can see the effect immediately.',
    'demo.autoTileReset': 'Reset',
    'demo.autoTileRestore': 'Restore tile',
    'demo.autoTileMine': 'Mine tile',
    'demo.legendGold': 'gold vein (mineral tint)',
    'demo.legendRock': 'exposed rock wall',
    'demo.legendFloor': 'mined floor (air)',
    'demo.legendDwarf': 'dwarf occupant',
    // ------------------------------------------------------------ chrome accessibility
    'chrome.guildEmblemAlt': 'Dwarf Fortress Delve Guild Emblem',
    'chrome.siteLogoAlt': 'Dwarven Scriptures logo',
  },
};
