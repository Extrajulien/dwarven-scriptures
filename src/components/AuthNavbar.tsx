import Link from 'next/link';
import { SITE } from '../data/site';

/**
 * Lean auth navbar: just the site name linking back to the home page.
 * Shared by the `/login` and `/register` screens via the `(auth)` layout.
 */
export default function AuthNavbar() {
  return (
    <header className="sticky top-0 z-30 flex w-full items-center justify-between border-b border-dwarf-border bg-dwarf-bg/90 px-4 py-2.5 backdrop-blur-sm">
      <Link
        href="/"
        className="flex items-center space-x-2.5"
        aria-label={SITE.name}
      >
        <img
          alt={`${SITE.name} logo`}
          className="h-6 w-6 rounded-sm object-contain"
          src={SITE.logoUrl}
        />
        <span className="font-display text-sm font-bold tracking-wider text-dwarf-gold">
          {SITE.name}
        </span>
      </Link>
    </header>
  );
}
