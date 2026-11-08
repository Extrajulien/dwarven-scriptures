// jest.config.mjs is loaded as ESM. `next/jest` ships a CommonJS entry whose
// default export is the config builder, which Node exposes via interop. The
// explicit `.js` extension is required because Node's ESM resolver does not
// resolve the extensionless `next/jest` subpath.
import nextJest from 'next/jest.js';

/** @type {import('jest').Config} */
const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config and .env files.
  dir: './',
});

const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.mjs'],
};

export default createJestConfig(config);
