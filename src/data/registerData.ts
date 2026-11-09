// Content for the "Citadel of Granite // Scribe Registration Terminal" page.
// All user-visible strings live in `src/i18n/messages.ts` (I18N-01): each text
// field is a message key resolved against the active fr/en bag by the
// rendering component. Machine values (urls, hrefs, runes, provider ids) stay
// here. Class strings are Tailwind utilities resolved from tailwind.config.js.
import type { Messages } from '../i18n/messages';

export interface RegisterCardData {
  logoAltKey: keyof Messages;
  logoUrl: string;
  titleKey: keyof Messages;
  headingKey: keyof Messages;
  subtitleKey: keyof Messages;
  statusKey: keyof Messages;
  terminalIdKey: keyof Messages;
  guidance: {
    rune: string;
    textKey: keyof Messages;
    version: string;
  };
}

export interface RegisterFormField {
  rune: string;
  labelKey: keyof Messages;
  hintKey: keyof Messages;
  placeholderKey: keyof Messages;
}

export interface RegisterFormData {
  callsign: RegisterFormField;
  password: RegisterFormField;
  confirmPassword: RegisterFormField;
  termsKey: keyof Messages;
  submitKey: keyof Messages;
  submitPendingKey: keyof Messages;
  strength: {
    labelKey: keyof Messages;
    emptyKey: keyof Messages;
    weakKey: keyof Messages;
    acceptableKey: keyof Messages;
    strongKey: keyof Messages;
  };
}

export interface AuthProvider {
  id: string;
  labelKey: keyof Messages;
}

export interface AuthAlternativesData {
  dividerKey: keyof Messages;
  providers: AuthProvider[];
  login: {
    promptKey: keyof Messages;
    labelKey: keyof Messages;
    href: string;
  };
  securityKey: keyof Messages;
}

export interface ArtShowcaseData {
  ariaLabelKey: keyof Messages;
  topLeftKey: keyof Messages;
  feedStatusKey: keyof Messages;
  image: {
    altKey: keyof Messages;
    src: string;
  };
  hud: {
    titleKey: keyof Messages;
    activeScribesLabelKey: keyof Messages;
    /** Mock number — data, not copy. */
    activeScribesValue: string;
    veinLabelKey: keyof Messages;
    /** Proper noun — data, not copy. */
    veinValue: string;
    quoteKey: keyof Messages;
  };
  bottomLeftKey: keyof Messages;
  bottomRightKey: keyof Messages;
}

export const REGISTER_CARD: RegisterCardData = {
  logoAltKey: 'auth.register.card.logoAlt',
  logoUrl: 'favicon.png',
  titleKey: 'auth.register.card.title',
  headingKey: 'auth.register.card.heading',
  subtitleKey: 'auth.register.card.subtitle',
  statusKey: 'auth.register.card.status',
  terminalIdKey: 'auth.register.card.terminalId',
  guidance: {
    rune: 'ᚱ',
    textKey: 'auth.register.card.guidance',
    version: '',
  },
};

export const REGISTER_FORM: RegisterFormData = {
  callsign: {
    rune: 'ᛗ',
    labelKey: 'auth.register.callsign.label',
    hintKey: 'auth.register.callsign.hint',
    placeholderKey: 'auth.register.callsign.placeholder',
  },
  password: {
    rune: 'ᛝ',
    labelKey: 'auth.register.password.label',
    hintKey: 'auth.register.password.hint',
    placeholderKey: 'auth.register.password.placeholder',
  },
  confirmPassword: {
    rune: 'ᛟ',
    labelKey: 'auth.register.confirmPassword.label',
    hintKey: 'auth.register.confirmPassword.hint',
    placeholderKey: 'auth.register.confirmPassword.placeholder',
  },
  termsKey: 'auth.register.terms',
  submitKey: 'auth.register.submit',
  submitPendingKey: 'auth.register.submitPending',
  strength: {
    labelKey: 'auth.register.strength.label',
    emptyKey: 'auth.register.strength.empty',
    weakKey: 'auth.register.strength.weak',
    acceptableKey: 'auth.register.strength.acceptable',
    strongKey: 'auth.register.strength.strong',
  },
};

export const AUTH_ALTERNATIVES: AuthAlternativesData = {
  dividerKey: 'auth.divider',
  providers: [
    { id: 'github', labelKey: 'auth.provider.github' },
    { id: 'discord', labelKey: 'auth.provider.discord' },
  ],
  login: {
    promptKey: 'auth.register.login.prompt',
    labelKey: 'auth.register.login.label',
    href: '/login',
  },
  securityKey: 'auth.security',
};

export const ART_SHOWCASE: ArtShowcaseData = {
  ariaLabelKey: 'auth.showcase.ariaLabel',
  topLeftKey: 'auth.showcase.topLeft',
  feedStatusKey: 'auth.showcase.feedStatus',
  image: {
    altKey: 'auth.showcase.imageAlt',
    src: 'assets/images/gnome_drip.jpg',
  },
  hud: {
    titleKey: 'auth.showcase.hudTitle',
    activeScribesLabelKey: 'auth.showcase.activeScribesLabel',
    activeScribesValue: '4,820',
    veinLabelKey: 'auth.showcase.veinLabel',
    veinValue: 'Adamantine #8849',
    quoteKey: 'auth.showcase.quote',
  },
  bottomLeftKey: 'auth.showcase.bottomLeft',
  bottomRightKey: 'auth.showcase.bottomRight',
};
