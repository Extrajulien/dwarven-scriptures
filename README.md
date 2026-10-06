# Deep Delve // Typist Expedition

Competitive typing-race web app for students, inspired by Monkeytype and Kahoot. Players type the same text and compete in real time.

Built with [Next.js](https://nextjs.org) (App Router) + React + TypeScript + Tailwind CSS.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start the dev server (Turbopack)     |
| `npm run build`      | Create an optimized production build |
| `npm run start`      | Serve the production build           |
| `npm run lint`       | Run ESLint                           |
| `npm run test`       | Run Jest once                        |
| `npm run test:watch` | Run Jest in watch mode               |

## Structure

- `src/app/` — Next.js App Router entry (`layout.tsx`, `page.tsx`, global styles)
- `src/components/` — presentational UI components
- `src/sprites/` — sprite registry, auto-tiling and tile rendering
- `src/data/` — mock content (placeholders until the real-time backend, auth and i18n land)
- `public/assets/tiles/` — sprite-sheet images
- `stitch/` — design mockup reference text

See `AGENTS.md` for architecture, conventions and contribution guidance.
