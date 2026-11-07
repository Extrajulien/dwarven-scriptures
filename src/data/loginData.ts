// Mock content for the "Citadel of Granite // Scribe Access Terminal" login
// page. Values are placeholders until the real auth flow and i18n land.
// Class strings are Tailwind utilities resolved from tailwind.config.js.

export interface LoginCardData {
  logoAlt: string;
  logoUrl: string;
  title: string;
  heading: string;
  subtitle: string;
  status: string;
  terminalId: string;
  guidance: {
    rune: string;
    text: string;
    version: string;
  };
}

export interface LoginFormField {
  rune: string;
  label: string;
  hint: string;
  placeholder: string;
}

export interface LoginFormData {
  callsign: LoginFormField;
  password: LoginFormField;
  remember: string;
  submit: string;
  submitPending: string;
  errors: {
    username: Record<string, string>;
    password: Record<string, string>;
    form: Record<string, string>;
  };
}

export interface AuthProvider {
  id: string;
  label: string;
}

export interface AuthAlternativesData {
  divider: string;
  providers: AuthProvider[];
  register: {
    prompt: string;
    label: string;
    href: string;
  };
  security: string;
}

export interface ArtShowcaseData {
  ariaLabel: string;
  topLeft: string;
  feedStatus: string;
  image: {
    alt: string;
    src: string;
  };
  hud: {
    title: string;
    activeScribesLabel: string;
    activeScribesValue: string;
    veinLabel: string;
    veinValue: string;
    quote: string;
  };
  bottomLeft: string;
  bottomRight: string;
}

export const LOGIN_CARD: LoginCardData = {
  logoAlt: 'Logo of Dwarven Scriptures',
  logoUrl: 'favicon.png',
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

export const LOGIN_FORM: LoginFormData = {
  callsign: {
    rune: 'ᛗ',
    label: '[ Dwarven identity ]',
    hint: '[username]',
    placeholder: 'moe lester',
  },
  password: {
    rune: 'ᛝ',
    label: '[ CIPHER ]',
    hint: '[password]',
    placeholder: '••••••••••••',
  },
  remember: 'Remember Scribe Rune-Stone for 30 cycles',
  submit: '[ ENTER THE DELVE // LOGIN ]',
  submitPending: '[ VERIFYING… ]',
  errors: {
    username: {
      required: 'A name is required.',
    },
    password: {
      required: 'A password is required.',
    },
    form: {
      invalidCredentials: 'Incorrect username or password.',
      unexpected: 'Something went wrong. Please try again.',
    },
  },
};

export const AUTH_ALTERNATIVES: AuthAlternativesData = {
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

export const ART_SHOWCASE: ArtShowcaseData = {
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
