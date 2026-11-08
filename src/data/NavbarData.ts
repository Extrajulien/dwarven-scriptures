import type { Messages } from '../i18n/messages';

export const LOGIN = {
  button: {
    id: 'login',
    labelKey: 'nav.login',
    icon: 'Login',
    className:
      'bg-primary text-on-primary hover:bg-primary-fixed transition-transform shadow-md',
  },
} as const satisfies {
  button: { id: string; labelKey: keyof Messages; icon: string; className: string };
};
