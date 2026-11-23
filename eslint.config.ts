// @ts-nocheck
//
// ESLint flat config for TypeScript projects.
// Division of labor: ESLint owns code quality, Prettier owns formatting
// (see .prettierrc in the same directory) — do not add formatting rules here.
// eslint.config.ts is loaded natively by ESLint >= 9.14 (jiti) — no flags,
// and the config itself gets type-checked.
// Dev dependencies: pnpm add -D eslint @eslint/js typescript-eslint
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ESLint 10 lints .ts files too, and would have this file's own
  // @ts-nocheck against its ban-ts-comment rule.
  { ignores: ['eslint.config.ts'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
