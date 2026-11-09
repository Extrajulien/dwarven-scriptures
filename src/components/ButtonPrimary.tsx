import type { MouseEventHandler, ReactNode } from 'react';
import Link from 'next/link';

type BaseProps = {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
};

type LinkButton = BaseProps & {
  href: string;
  type?: undefined;
  disabled?: undefined;
  onClick?: undefined;
};

type ElementButton = BaseProps & {
  href?: undefined;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

export type ButtonPrimaryProps = LinkButton | ElementButton;

const BASE_CLASSES =
  'btn-chisel-gold group inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded px-4 py-3 text-xs font-extrabold uppercase tracking-widest text-on-primary-container shadow-gold-glow sm:text-sm';

/**
 * Primary (gold chisel) call-to-action. Renders its `children` in a
 * left-to-right flex row so callers only pass content (e.g. an icon + a label).
 * Pass `href` to render a `next/link` navigation element, otherwise a button.
 * Width is layout-specific and left to `className` (e.g. `w-full`).
 */
export default function ButtonPrimary(props: ButtonPrimaryProps) {
  const className = `${BASE_CLASSES} ${props.className ?? ''}`.trim();

  if (typeof props.href === 'string') {
    return (
      <Link
        href={props.href}
        className={className}
        aria-label={props['aria-label']}
      >
        {props.children}
      </Link>
    );
  }

  return (
    <button
      type={props.type ?? 'button'}
      disabled={props.disabled}
      onClick={props.onClick}
      className={className}
      aria-label={props['aria-label']}
    >
      {props.children}
    </button>
  );
}
