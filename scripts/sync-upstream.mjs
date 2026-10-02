#!/usr/bin/env node
/**
 * Traz para o protótipo o que mudou no front de PRODUÇÃO (`apps/web` do
 * `vibra-gestor-oportunidades`), sem perder o que o design criou aqui.
 *
 * ## Como funciona
 *
 * A branch `upstream` deste repositório contém SÓ snapshots do `apps/web` de
 * produção, já no formato do protótipo (sem a BFF real, sem testes). Cada sync:
 *
 *   1. lê o `apps/web` do `origin/develop` do repositório de produção (local);
 *   2. grava esse snapshot como um commit novo na branch `upstream`;
 *   3. faz `git merge upstream` na branch atual.
 *
 * Como `main` nasceu da `upstream`, o merge é de três vias: o que só a produção
 * mudou entra limpo, o que só o design mudou fica, e o que os dois mudaram no
 * mesmo trecho vira CONFLITO — resolvido por quem conhece a tela, nunca no
 * automático.
 *
 * Efeito colateral útil: `git diff upstream main -- src` é, exatamente, o que o
 * protótipo tem e a produção ainda não tem. É a matéria-prima das tasks.
 *
 * ## Uso
 *
 *   pnpm sync:upstream
 *
 * Variáveis (opcionais):
 *   UPSTREAM_DIR  caminho do clone de produção (padrão: ../vibra-gestor-oportunidades)
 *   UPSTREAM_REF  ref a espelhar (padrão: origin/develop)
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const raiz = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const upstreamDir = resolve(raiz, process.env.UPSTREAM_DIR ?? '../vibra-gestor-oportunidades');
const ref = process.env.UPSTREAM_REF ?? 'origin/develop';
const trabalho = join(raiz, '.upstream');
const snapshot = join(trabalho, 'snapshot');
const wt = join(trabalho, 'wt');

const git = (args, cwd = raiz, env = process.env) =>
  execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const sair = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

/**
 * O que, de `apps/web`, pertence ao snapshot. Tudo o mais (package.json,
 * configs, CLAUDE.md, mocks) é do protótipo e nunca é sobrescrito.
 */
export function pertenceAoSnapshot(p) {
  if (['global.d.ts', 'next-env.d.ts', 'postcss.config.mjs'].includes(p)) return true;
  if (p.startsWith('public/')) return true;
  if (!p.startsWith('src/')) return false;
  if (p.startsWith('src/app/api/')) return false; // BFF real — no protótipo é a rota coringa
  if (/\.(test|spec)\.(ts|tsx)$/.test(p)) return false;
  return true;
}

function listar(dir, base = dir) {
  return readdirSync(dir).flatMap((nome) => {
    const p = join(dir, nome);
    return statSync(p).isDirectory() ? listar(p, base) : [relative(base, p).split(sep).join('/')];
  });
}

// ── 0. Pré-condições ───────────────────────────────────────────────────────
if (!existsSync(join(upstreamDir, '.git'))) {
  sair(`Repositório de produção não encontrado em ${upstreamDir}. Clone-o ou defina UPSTREAM_DIR.`);
}
if (git(['status', '--porcelain'])) sair('Há mudanças não commitadas. Faça commit (ou stash) antes do sync.');
try {
  git(['rev-parse', '--verify', 'upstream']);
} catch {
  sair('A branch `upstream` não existe neste repositório. Ela é criada uma única vez, no setup (ver README).');
}

// ── 1. Snapshot do apps/web de produção ───────────────────────────────────
console.log(`→ Atualizando ${ref} em ${upstreamDir}`);
const [remoto, ...resto] = ref.split('/');
if (resto.length) git(['fetch', remoto, resto.join('/'), '--quiet'], upstreamDir);
const sha = git(['rev-parse', ref], upstreamDir);
const resumo = git(['log', '-1', '--format=%h %s', sha], upstreamDir);
console.log(`  ${resumo}`);

rmSync(snapshot, { recursive: true, force: true });
mkdirSync(snapshot, { recursive: true });
// Índice temporário: extrai `apps/web` sem tocar no índice nem na árvore de
// trabalho do repositório de produção (que pode estar no meio de outra tarefa).
const indice = join(trabalho, 'index.tmp');
const env = { ...process.env, GIT_INDEX_FILE: indice };
git(['read-tree', `${sha}:apps/web`], upstreamDir, env);
// Só o que entra no snapshot (+ o package.json, para o aviso de dependências).
// Extrair tudo esbarrava no limite de 260 caracteres do Windows nas rotas
// profundas da BFF (`src/app/api/opportunities/[id]/contrato/...`), que o
// protótipo nem usa.
const doSnapshot = git(['ls-files'], upstreamDir, env)
  .split('\n')
  .filter((p) => p && (pertenceAoSnapshot(p) || p === 'package.json'));
execFileSync('git', ['-c', 'core.longpaths=true', '--work-tree', snapshot, 'checkout-index', '-f', '--stdin'], {
  cwd: upstreamDir,
  env,
  input: doSnapshot.join('\n'),
  stdio: ['pipe', 'pipe', 'pipe'],
});
rmSync(indice, { force: true });

// ── 2. Commit do snapshot na branch `upstream` ────────────────────────────
rmSync(wt, { recursive: true, force: true });
try {
  git(['worktree', 'prune']);
  git(['worktree', 'add', '--quiet', wt, 'upstream']);

  for (const p of listar(wt).filter((x) => !x.startsWith('.git'))) {
    if (pertenceAoSnapshot(p) || p === '.upstream-ref') rmSync(join(wt, p));
  }
  for (const p of listar(snapshot).filter(pertenceAoSnapshot)) {
    mkdirSync(dirname(join(wt, p)), { recursive: true });
    cpSync(join(snapshot, p), join(wt, p));
  }
  writeFileSync(join(wt, '.upstream-ref'), `${sha}\n${resumo}\n`);

  git(['add', '-A'], wt);
  if (!git(['status', '--porcelain'], wt)) {
    console.log('✓ Produção não mudou desde o último sync (nada a trazer).');
  } else {
    git(['commit', '--quiet', '-m', `upstream: apps/web @ ${resumo}`], wt);
    console.log('✓ Snapshot gravado na branch `upstream`.');
  }
} finally {
  try {
    git(['worktree', 'remove', '--force', wt]);
  } catch {
    /* já removida */
  }
}

// ── 3. Merge na branch atual ──────────────────────────────────────────────
const atual = git(['rev-parse', '--abbrev-ref', 'HEAD']);
console.log(`→ git merge upstream (em ${atual})`);
try {
  git(['merge', 'upstream', '--no-edit', '-m', `sync: traz a produção (${resumo})`]);
  console.log('✓ Merge limpo.');
} catch {
  const conflitos = git(['diff', '--name-only', '--diff-filter=U']);
  console.log(`\n⚠ CONFLITOS — a produção e o protótipo mudaram o mesmo trecho:\n\n${conflitos
    .split('\n')
    .map((f) => `  ${f}`)
    .join('\n')}\n`);
  console.log('Resolva cada arquivo (peça ao Claude: "resolva os conflitos do sync com a produção"),');
  console.log('depois `git add` + `git commit`. Para desistir: `git merge --abort`.');
}

// ── 4. Dependências que a produção ganhou ─────────────────────────────────
const deps = (pkg) => ({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });
const prod = deps(JSON.parse(readFileSync(join(snapshot, 'package.json'), 'utf8')));
const proto = deps(JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')));
const IGNORAR = /^@repo\/|vitest|testing-library|playwright|jsdom|coverage-v8|plugin-react/;
const faltam = Object.keys(prod).filter((d) => !proto[d] && !IGNORAR.test(d));
if (faltam.length) {
  console.log(`\n⚠ A produção usa dependências que o protótipo não tem: ${faltam.join(', ')}`);
  console.log(`  Rode: pnpm add ${faltam.map((d) => `${d}@${prod[d]}`).join(' ')}`);
}

// ── 5. Rotas novas da BFF que o protótipo ainda não mocka ─────────────────
console.log('\n→ Conferindo cobertura dos mocks (pnpm mocks:cobertura)…');
try {
  console.log(execFileSync('node', [join(raiz, 'scripts', 'cobertura-mocks.mjs')], { encoding: 'utf8' }));
} catch (e) {
  console.log(e.stdout ?? '');
  console.log('Telas de produção novas podem estar chamando rotas sem mock — crie-as antes de usar.');
}
