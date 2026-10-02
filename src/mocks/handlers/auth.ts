import { SESSION_COOKIE } from '@/lib/auth-guard';
import type { LoginOptions } from '@/lib/auth-login-options-mapping';

import { configuracao, type ConfiguracaoPrototipo } from '../core/configuracao';
import { erro, json, naoAutenticado } from '../core/respostas';
import { rotas, listarRotas } from '../core/router';
import { PERFIS, perfilPorChave, usuarioDoPerfil } from '../core/session';
import { restaurarDados } from '../core/store';
import { OPORTUNIDADES } from '../elenco';

/**
 * Sessão do protótipo: o picker de perfil do produto (o mesmo da tela de login
 * em dev) escolhe o perfil, e o cookie guarda a chave dele. Sem Entra, sem token.
 */
function cookieDeSessao(valor: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function encerrar(): Response {
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookieDeSessao('', 0) } });
}

rotas('auth', [
  {
    method: 'GET',
    pattern: '/auth/login-options',
    publica: true,
    handler: () =>
      json<LoginOptions>({
        mockEnabled: true,
        mockProfileEnabled: true,
        profiles: PERFIS.map((p) => ({
          key: p.key,
          label: p.label,
          description: p.description,
          entraGroup: p.entraGroup,
          roles: p.roles,
          userName: p.userName,
        })),
      }),
  },
  {
    method: 'POST',
    pattern: '/auth/session',
    publica: true,
    handler: ({ body }) => {
      const b = (body ?? {}) as { code?: string; mockProfileHint?: string };
      const perfil = perfilPorChave(b.mockProfileHint ?? b.code);
      if (!perfil) return erro(401, 'Falha na autenticação.');
      const user = usuarioDoPerfil(perfil);
      return new Response(
        JSON.stringify({ user: { id: user.id, email: user.email, name: user.name, roles: user.roles } }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookieDeSessao(perfil.key, 8 * 3600) },
        },
      );
    },
  },
  { method: 'DELETE', pattern: '/auth/session', publica: true, handler: encerrar },
  { method: 'POST', pattern: '/auth/session/encerrar', publica: true, handler: encerrar },
  {
    method: 'GET',
    pattern: '/auth/me',
    handler: ({ user }) =>
      user ? json({ id: user.id, email: user.email, name: user.name, roles: user.roles }) : naoAutenticado(),
  },

  // ───────────── Controles do protótipo (página /prototipo) ─────────────
  // Prefixo `__prototipo` para nunca colidir com uma rota real da BFF.
  {
    method: 'GET',
    pattern: '/__prototipo/estado',
    publica: true,
    handler: () =>
      json({
        configuracao: configuracao(),
        perfis: PERFIS.map(({ key, label, userName, roles }) => ({ key, label, userName, roles })),
        cenarios: OPORTUNIDADES.map(({ id, code, titulo, fase, cenario }) => ({ id, code, titulo, fase, cenario })),
        rotas: listarRotas(),
      }),
  },
  {
    method: 'POST',
    pattern: '/__prototipo/restaurar',
    publica: true,
    handler: () => {
      restaurarDados();
      return json({ ok: true });
    },
  },
  {
    method: 'PUT',
    pattern: '/__prototipo/configuracao',
    publica: true,
    handler: ({ body }) => {
      Object.assign(configuracao(), body as Partial<ConfiguracaoPrototipo>);
      return json(configuracao());
    },
  },
  {
    method: 'POST',
    pattern: '/__prototipo/entrar-como',
    publica: true,
    handler: ({ body }) => {
      const perfil = perfilPorChave((body as { perfil?: string } | undefined)?.perfil);
      if (!perfil) return erro(400, 'Perfil desconhecido.');
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookieDeSessao(perfil.key, 8 * 3600) },
      });
    },
  },
]);
