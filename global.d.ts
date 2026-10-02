// Ambient module declaration for global CSS side-effect imports
// (e.g. `import './globals.css'` in the App Router root layout).
//
// Next regenerates these types in `next-env.d.ts` on `dev`/`build`, but that
// file is gitignored — declaring it here keeps type resolution working in the
// editor and on a fresh clone, before the first build runs.
declare module '*.css';
