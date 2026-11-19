'use client';

import { buildInlineThemeScript } from './theme';

/**
 * Pre-paint theme bootstrap (DES-05), extracted from the root layout into a
 * Client Component so React renders the raw `<script>` with `text/javascript`
 * on the server (runs synchronously during HTML parsing, before first paint)
 * but `text/plain` on the client — a data block that React 19 can re-render
 * without tripping its "script inside a component" error during error recovery
 * or Fast Refresh. `suppressHydrationWarning` accepts the `type` mismatch
 * between the server and client renders.
 */
export default function ThemeScript() {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: buildInlineThemeScript() }}
    />
  );
}
