#!/usr/bin/env node
/**
 * Cobertura dos mocks — toda URL `/api/...` que o código das telas chama tem
 * uma rota mockada que a atende?
 *
 * Varre `src/` (fora das áreas exclusivas do protótipo) atrás de literais
 * `'/api/...'` e template strings `` `/api/${x}/...` ``, normaliza cada
 * `${...}` para um parâmetro e confere contra os `pattern:` declarados em
 * `src/mocks/handlers/*.ts`.
 *
 * É heurística: URL montada por concatenação em várias etapas escapa da
 * varredura (o 501 em runtime ainda pega). O que ela garante é que nenhuma tela
 * NOVA nasce chamando uma rota que ninguém mockou.
 *
 * Uso: `pnpm mocks:cobertura` (sai com 1 se faltar mock).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const src = join(raiz, 'src');
const EXCLUIDOS = [join(src, 'mocks'), join(src, 'app', 'api'), join(src, 'app', 'prototipo')];

function arquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const p = join(dir, nome);
    if (EXCLUIDOS.some((e) => p.startsWith(e))) return [];
    if (statSync(p).isDirectory()) return arquivos(p);
    return /\.(ts|tsx)$/.test(nome) ? [p] : [];
  });
}

const normalizar = (url) =>
  url
    // `${id}` no meio vira parâmetro; `${query}` colado ao fim de um segmento
    // (`/requer-acao${qs}`) é query string e sai.
    .replace(/([^/])\$\{[^}]*\}$/, '$1')
    .replace(/\$\{[^}]*\}/g, ':p')
    .split('?')[0]
    .replace(/\/+$/, '')
    .split('/')
    .map((seg) => (seg.startsWith(':') ? ':p' : seg))
    .join('/');

// 1) URLs usadas pelas telas
const usadas = new Map();
const reUrl = /['"`](\/api\/[^'"`\s]*)['"`]/g;
for (const f of arquivos(src)) {
  const linhas = readFileSync(f, 'utf8').split('\n');
  for (const linha of linhas) {
    // Docblocks e comentários citam URLs de exemplo (`/api/x`, `[id]`) — não são chamadas.
    if (/^\s*(\*|\/\/|\/\*)/.test(linha)) continue;
    for (const m of linha.matchAll(reUrl)) {
      const url = normalizar(m[1].replace(/^\/api/, ''));
      if (!url || url === '/:p' || /\*|\.\.\./.test(url)) continue;
      if (!usadas.has(url)) usadas.set(url, new Set());
      usadas.get(url).add(relative(raiz, f).split(sep).join('/'));
    }
  }
}

// 2) Rotas mockadas — resolve constantes simples do arquivo (`const P = '/x/:id'`
// e `pattern: \`${P}/dados\``).
const mockadas = new Set();
const dirHandlers = join(src, 'mocks', 'handlers');
for (const nome of readdirSync(dirHandlers)) {
  const texto = readFileSync(join(dirHandlers, nome), 'utf8');
  const consts = Object.fromEntries(
    [...texto.matchAll(/const\s+(\w+)\s*=\s*['"`](\/[^'"`$]*)['"`]/g)].map((m) => [m[1], m[2]]),
  );
  for (const m of texto.matchAll(/pattern:\s*['"`]([^'"`]+)['"`]/g)) {
    const resolvido = m[1].replace(/\$\{(\w+)\}/g, (inteiro, nomeConst) => consts[nomeConst] ?? inteiro);
    mockadas.add(normalizar(resolvido));
  }
}

// Um uso termina em `/:p` quando a tela anexa o resto depois (`${base}/x`);
// aceita se alguma rota mockada começa com o prefixo literal.
const coberta = (url) =>
  mockadas.has(url) || [...mockadas].some((r) => r === url || (url.endsWith('/:p') && r.startsWith(url.slice(0, -3))));

const faltando = [...usadas.entries()].filter(([url]) => !coberta(url)).sort(([a], [b]) => a.localeCompare(b));

console.log(`URLs /api usadas pelas telas: ${usadas.size} · rotas mockadas: ${mockadas.size}`);
if (faltando.length === 0) {
  console.log('✓ Toda URL encontrada tem mock.');
  process.exit(0);
}
console.log(`\n✗ ${faltando.length} URL(s) sem mock:\n`);
for (const [url, onde] of faltando) console.log(`  /api${url}\n      usada em: ${[...onde].slice(0, 3).join(', ')}`);
console.log('\nCrie a rota em src/mocks/handlers/<dominio>.ts (ver CLAUDE.md, "Como criar um mock").');
process.exit(1);
