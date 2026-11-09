// Content for the "Citadel of Granite // Scribe Access Terminal" login page.
// All user-visible strings live in `src/i18n/messages.ts` (I18N-01): each text
// field is a message key resolved against the active fr/en bag by the
// rendering component. Machine values (urls, hrefs, runes, provider ids) stay
// here. Class strings are Tailwind utilities resolved from tailwind.config.js.
import type { Messages } from '../i18n/messages';

export interface LoginCardData {
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

export interface LoginFormField {
  rune: string;
  labelKey: keyof Messages;
  hintKey: keyof Messages;
  placeholderKey: keyof Messages;
}

export interface LoginFormData {
  callsign: LoginFormField;
  password: LoginFormField;
  rememberKey: keyof Messages;
  submitKey: keyof Messages;
  submitPendingKey: keyof Messages;
}

export interface AuthProvider {
  id: string;
  labelKey: keyof Messages;
}

export interface AuthAlternativesData {
  dividerKey: keyof Messages;
  providers: AuthProvider[];
  register: {
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

export const LOGIN_CARD: LoginCardData = {
  logoAltKey: 'auth.login.card.logoAlt',
  logoUrl: 'favicon.png',
  titleKey: 'auth.login.card.title',
  headingKey: 'auth.login.card.heading',
  subtitleKey: 'auth.login.card.subtitle',
  statusKey: 'auth.login.card.status',
  terminalIdKey: 'auth.login.card.terminalId',
  guidance: {
    rune: 'ᚱ',
    textKey: 'auth.login.card.guidance',
    version: '',
  },
};

export const LOGIN_FORM: LoginFormData = {
  callsign: {
    rune: 'ᛗ',
    labelKey: 'auth.login.callsign.label',
    hintKey: 'auth.login.callsign.hint',
    placeholderKey: 'auth.login.callsign.placeholder',
  },
  password: {
    rune: 'ᛝ',
    labelKey: 'auth.login.password.label',
    hintKey: 'auth.login.password.hint',
    placeholderKey: 'auth.login.password.placeholder',
  },
  rememberKey: 'auth.login.remember',
  submitKey: 'auth.login.submit',
  submitPendingKey: 'auth.login.submitPending',
};

export const AUTH_ALTERNATIVES: AuthAlternativesData = {
  dividerKey: 'auth.divider',
  providers: [
    { id: 'github', labelKey: 'auth.provider.github' },
    { id: 'discord', labelKey: 'auth.provider.discord' },
  ],
  register: {
    promptKey: 'auth.login.register.prompt',
    labelKey: 'auth.login.register.label',
    href: '/register',
  },
  securityKey: 'auth.security',
};

export const ART_SHOWCASE: ArtShowcaseData = {
  ariaLabelKey: 'auth.showcase.ariaLabel',
  topLeftKey: 'auth.showcase.topLeft',
  feedStatusKey: 'auth.showcase.feedStatus',
  image: {
    altKey: 'auth.showcase.imageAlt',
    src: 'assets/images/dwarf-angry.gif',
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
