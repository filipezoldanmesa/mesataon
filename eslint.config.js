// Mesmas regras do `@repo/eslint-config/next` do repositório de produção,
// copiadas aqui para o protótipo não depender do monorepo.
const { FlatCompat } = require("@eslint/eslintrc");
const compat = new FlatCompat({ baseDirectory: __dirname });

/** @type {import("eslint").Linter.Config[]} */
const config = [
  { ignores: [".upstream/**", ".next/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];

module.exports = config;
