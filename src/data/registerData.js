// Mock content for the "Citadel of Granite // Scribe Registration Terminal"
// page. Values are placeholders until the real auth flow and i18n land.
// Class strings are Tailwind utilities resolved from tailwind.config.js.

export const REGISTER_CARD = {
  logoAlt: 'Logo of Dwarven Scriptures',
  logoUrl:
    'favicon.png',
  title: '[ CITADEL OF GRANITE ]',
  heading: 'SCRIBE REGISTRATION TERMINAL',
  subtitle: 'Deep Delve Guild • New Scribe Enlistment',
  status: '[STATUS: RECRUITING]',
  terminalId: 'TERM_ID: #84-R',
  guidance: {
    rune: 'ᚱ',
    text: 'Engrave your life on a stone',
    version: '',
  },
};

export const REGISTER_FORM = {
  callsign: {
    rune: 'ᛗ',
    label: '[ Dwarven identity ]',
    hint: '[username]',
    placeholder: 'Joe Mama',
  },
  password: {
    rune: 'ᛝ',
    label: '[ CIPHER ]',
    hint: '[password]',
    placeholder: '••••••••••••',
  },
  confirmPassword: {
    rune: 'ᛟ',
    label: '[ RE-CIPHER ]',
    hint: '[confirm]',
    placeholder: '••••••••••••',
  },
  terms: 'I swear the Guild Charter oath and accept the stonebound terms',
  submit: '[ ENGRAVE // CREATE ACCOUNT ]',
};

export const AUTH_ALTERNATIVES = {
  divider: '─── [ OR ATTUNE VIA EXTERNAL FORGE ] ───',
  providers: [
    { id: 'github', label: 'Forge with GitHub' },
    { id: 'discord', label: 'Attune Discord' },
  ],
  login: {
    prompt: 'Already a sworn member of the guild?',
    label: '[ RETURN TO SCRIBE ACCESS → ]',
    href: '/login',
  },
  security: '• 256-BIT BASALT ENCRYPTION • GUILD PROTOCOL ASCII_V2 •',
};

export const ART_SHOWCASE = {
  ariaLabel: 'Citadel Fortress Live Feed',
  topLeft: '[ CITADEL HALL ARCHIVE // EXPEDITION #84 ]',
  feedStatus: '● FEED SYNCED',
  image: {
    alt: 'Detailed pixel art scene of an ancient subterranean Dwarven fortress hall in Dwarf Fortress Steam Edition style. Grand stone carved pillars, warm glowing lava forge channels in the distance, mining carts on tracks, glowing runic engravings in emerald and amber, rugged dwarven scribes and miners at basalt desks with quills and picks, intricate stone masonry borders, atmospheric dark slate cavern with warm torchlight, retro isometric high detail 16-bit video game art',
    src: 'assets/images/dwarf-angry.gif',
  },
  hud: {
    title: '[ DEEP DELVE SANCTUM ]',
    activeScribesLabel: 'Active Scribes & Miners:',
    activeScribesValue: '4,820',
    veinLabel: 'Vein:',
    veinValue: 'Adamantine #8849',
    quote:
      'Strike the granite true, young scribes. Every keystroke fortifies the mountain hall.',
  },
  bottomLeft: '[ SECTOR: LOWER_FORGE_LEVEL ]',
  bottomRight: 'MAGMA RESERVOIR: 1,420°C // 98% CAPACITY',
};
