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

export type ButtonSecondaryProps = LinkButton | ElementButton;

const BASE_CLASSES =
  'btn-chisel-stone group inline-flex min-h-[44px] items-center justify-center gap-2 rounded bg-dwarf-basalt px-3 py-2.5 text-xs text-dwarf-parchment transition hover:text-white';

/**
 * Secondary (stone chisel) action. Renders its `children` in a left-to-right
 * flex row so callers only pass content (e.g. an icon + a label), not markup.
 * Pass `href` to render a `next/link` navigation element, otherwise a button.
 */
export default function ButtonSecondary(props: ButtonSecondaryProps) {
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
