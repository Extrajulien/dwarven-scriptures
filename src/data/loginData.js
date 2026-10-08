// Mock content for the "Citadel of Granite // Scribe Access Terminal" login
// page. Values are placeholders until the real auth flow and i18n land.
// Class strings are Tailwind utilities resolved from tailwind.config.js.

export const TERMINAL_HEADER = {
  node: '[ FORTRESS_NODE // OZ_DEEP_DELVE ]',
  protocol: '[ PROTOCOL: FORGE_ENCRYPT_256 ]',
  depth: '[ DEPTH: Z-LEVEL -42 ]',
  carrierLabel: 'RUNIC CARRIER:',
  carrierStatus: '99.8% STABLE',
};

export const LOGIN_CARD = {
  logoAlt: 'Logo of Dwarven Scriptures',
  logoUrl:
    'favicon.png',
  title: '[ CITADEL OF GRANITE ]',
  heading: 'SCRIBE ACCESS TERMINAL',
  subtitle: 'Deep Delve Guild • Scribe Verification',
  status: '[STATUS: ONLINE]',
  terminalId: 'TERM_ID: #84-S',
  guidance: {
    rune: 'ᚱ',
    text: 'Connect to the dwarven servers',
    version: '',
  },
};

export const LOGIN_FORM = {
  callsign: {
    rune: 'ᛗ',
    label: '[ SCRIBE_CALLSIGN / USERNAME ]',
    hint: '[RUNIC ID REQUIRED]',
    placeholder: 'e.g. Urist_Stonewright',
  },
  password: {
    rune: 'ᛝ',
    label: '[ RUNIC_CIPHER / PASSWORD ]',
    forgot: '[ FORGOT CIPHER? ]',
    placeholder: '••••••••••••',
  },
  remember: 'Remember Scribe Rune-Stone for 30 cycles',
  submit: '[ ENTER THE DELVE // LOGIN ]',
};

export const AUTH_ALTERNATIVES = {
  divider: '─── [ OR ATTUNE VIA EXTERNAL FORGE ] ───',
  providers: [
    { id: 'github', label: 'Forge with GitHub' },
    { id: 'discord', label: 'Attune Discord' },
  ],
  register: {
    prompt: 'New to the subterranean guild?',
    label: '[ ENGRAVE NEW SCRIBE DOSSIER → ]',
    href: '/register',
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
  bottomLeft: '╚════ [ SECTOR: LOWER_FORGE_LEVEL ]',
  bottomRight: 'MAGMA RESERVOIR: 1,420°C // 98% CAPACITY ════╝',
};

export const LOGIN_FOOTER = {
  left: 'ᛞ CITADEL KEEPER',
  leftNote: '— Built for apprentice coders & dwarf cartographers',
  links: [
    {
      label: '[ GUILD CHARTER ]',
      href: '#guild-charter',
      className: 'transition hover:text-dwarf-parchment',
    },
    {
      label: '[ RUNIC CIPHER HELP ]',
      href: '#terminal-help',
      className: 'transition hover:text-dwarf-parchment',
    },
    {
      label: '[ ALL VEINS ONLINE ]',
      href: '#matrix-status',
      className: 'text-[#4f7942] transition hover:text-dwarf-runeBright',
    },
  ],
};
