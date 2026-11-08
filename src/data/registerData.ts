// Mock content for the "Citadel of Granite // Scribe Registration Terminal"
// page. Values are placeholders until the real auth flow and i18n land.
// Class strings are Tailwind utilities resolved from tailwind.config.js.

export interface RegisterCardData {
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

export interface RegisterFormField {
  rune: string;
  label: string;
  hint: string;
  placeholder: string;
}

export interface RegisterFormData {
  callsign: RegisterFormField;
  password: RegisterFormField;
  confirmPassword: RegisterFormField;
  terms: string;
  submit: string;
  submitPending: string;
  strength: {
    label: string;
    empty: string;
    weak: string;
    acceptable: string;
    strong: string;
  };
  errors: {
    username: Record<string, string>;
    password: Record<string, string>;
    confirmPassword: Record<string, string>;
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
  login: {
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

export const REGISTER_CARD: RegisterCardData = {
  logoAlt: 'Logo of Dwarven Scriptures',
  logoUrl: 'favicon.png',
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

export const REGISTER_FORM: RegisterFormData = {
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
  submitPending: '[ ENGRAVING… ]',
  strength: {
    label: 'Password strength',
    empty: 'No password',
    weak: 'Too weak',
    acceptable: 'Good enough',
    strong: 'Strong',
  },
  errors: {
    username: {
      required: 'A name is required.',
      usernameTooLong: 'Name must be 32 characters or fewer.',
      usernameTaken: 'That name is already taken.',
    },
    password: {
      required: 'A password is required.',
      passwordTooShort: 'Password must be at least 12 characters.',
      passwordTooLong: 'Password must be 128 characters or fewer.',
      passwordWeak:
        'Password needs more variety — mix upper/lowercase letters, numbers and symbols.',
    },
    confirmPassword: {
      required: 'Please confirm your password.',
      passwordsDoNotMatch: 'Passwords do not match.',
    },
    form: {
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
  login: {
    prompt: 'Already a sworn member of the guild?',
    label: '[ RETURN TO SCRIBE ACCESS → ]',
    href: '/login',
  },
  security: '• 256-BIT BASALT ENCRYPTION • GUILD PROTOCOL ASCII_V2 •',
};

export const ART_SHOWCASE: ArtShowcaseData = {
  ariaLabel: 'Citadel Fortress Live Feed',
  topLeft: '[ CITADEL HALL ARCHIVE // EXPEDITION #84 ]',
  feedStatus: '● FEED SYNCED',
  image: {
    alt: 'Detailed pixel art scene of an ancient subterranean Dwarven fortress hall in Dwarf Fortress Steam Edition style. Grand stone carved pillars, warm glowing lava forge channels in the distance, mining carts on tracks, glowing runic engravings in emerald and amber, rugged dwarven scribes and miners at basalt desks with quills and picks, intricate stone masonry borders, atmospheric dark slate cavern with warm torchlight, retro isometric high detail 16-bit video game art',
    src: 'assets/images/gnome_drip.jpg',
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
