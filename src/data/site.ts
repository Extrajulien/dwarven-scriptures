export interface SiteIdentity {
  name: string;
  logoUrl: string;
}

/**
 * Shared site identity used by the app chrome (navbar, metadata, footers).
 * Kept in one place so the name and logo stay in sync across pages.
 */
export const SITE: SiteIdentity = {
  name: 'Dwarven Scriptures',
  logoUrl: '/favicon.png',
};
