'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

/**
 * ⚠️ EXCLUSIVO DO PROTÓTIPO — não existe em produção e NUNCA é portado.
 *
 * Painel de controle de quem revisa o protótipo: trocar de perfil sem passar
 * pelo login, voltar os dados à semente, deixar as respostas lentas (para ver
 * os carregamentos) e forçar falha nas ações (para ver os estados de erro).
 */

interface Estado {
  configuracao: { latenciaMs: number; falharAcoes: boolean; statusFalha: number; mensagemFalha: string };
  perfis: Array<{ key: string; label: string; userName: string; roles: string[] }>;
  cenarios: Array<{ id: string; code: string; titulo: string; fase: string; cenario: string }>;
  rotas: Array<{ method: string; pattern: string; dominio: string }>;
}

const card: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-xs)',
  boxShadow: 'var(--shadow-card)',
  padding: 'var(--space-24)',
};

export default function PrototipoPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtroRota, setFiltroRota] = useState('');

  const carregar = useCallback(async () => {
    const res = await fetch('/api/__prototipo/estado');
    setEstado((await res.json()) as Estado);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function configurar(parcial: Partial<Estado['configuracao']>) {
    await fetch('/api/__prototipo/configuracao', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parcial),
    });
    await carregar();
  }

  async function restaurar() {
    await fetch('/api/__prototipo/restaurar', { method: 'POST' });
    setAviso('Dados restaurados para a semente.');
    await carregar();
  }

  async function entrarComo(perfil: string) {
    await fetch('/api/__prototipo/entrar-como', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ perfil }),
    });
    // O AuthProvider guarda o usuário em cache no browser: recarregar a página
    // inteira é o que faz o header e as permissões trocarem de perfil.
    window.location.href = '/';
  }

  if (!estado) return <main style={{ padding: 'var(--space-32)' }}>Carregando…</main>;

  const rotas = estado.rotas.filter((r) =>
    `${r.method} ${r.pattern} ${r.dominio}`.toLowerCase().includes(filtroRota.toLowerCase()),
  );

  return (
    <main
      style={{
        maxWidth: 'var(--grid-max)',
        margin: '0 auto',
        padding: 'var(--space-32) var(--space-16)',
        display: 'grid',
        gap: 'var(--space-24)',
      }}
    >
      <header>
        <p style={{ fontSize: 'var(--t-small)', color: 'var(--color-text-muted)', margin: 0 }}>
          Protótipo · dados 100% fictícios
        </p>
        <h1 style={{ fontSize: 'var(--t-h2)', margin: 'var(--space-4) 0' }}>Painel do protótipo</h1>
        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
          Nada aqui fala com sistema real. As ações mudam o estado em memória, que vale até restaurar os dados
          ou reiniciar o servidor. <Link href="/">Voltar ao sistema</Link>
        </p>
        {aviso && <p style={{ color: 'var(--color-success)' }}>{aviso}</p>}
      </header>

      <section style={card}>
        <h2 style={{ fontSize: 'var(--t-h4)', marginTop: 0 }}>Entrar como</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)' }}>
          {estado.perfis.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => void entrarComo(p.key)}
              title={`${p.userName} · ${p.roles.join(', ')}`}
              style={{
                border: '1px solid var(--color-interactive)',
                color: 'var(--color-interactive)',
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-full)',
                padding: 'var(--space-8) var(--space-16)',
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 'var(--t-h4)', marginTop: 0 }}>Simulação</h2>
        <div style={{ display: 'grid', gap: 'var(--space-16)' }}>
          <label style={{ display: 'flex', gap: 'var(--space-12)', alignItems: 'center' }}>
            Latência das respostas
            <select
              value={estado.configuracao.latenciaMs}
              onChange={(e) => void configurar({ latenciaMs: Number(e.target.value) })}
            >
              <option value={0}>Nenhuma</option>
              <option value={250}>250 ms (padrão)</option>
              <option value={1500}>1,5 s</option>
              <option value={4000}>4 s</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: 'var(--space-12)', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={estado.configuracao.falharAcoes}
              onChange={(e) => void configurar({ falharAcoes: e.target.checked })}
            />
            Toda ação (salvar, enviar, remover) falha com
            <select
              value={estado.configuracao.statusFalha}
              onChange={(e) => void configurar({ statusFalha: Number(e.target.value) })}
            >
              <option value={400}>400 · validação</option>
              <option value={403}>403 · sem permissão</option>
              <option value={409}>409 · conflito</option>
              <option value={503}>503 · indisponível</option>
            </select>
          </label>
          <div>
            <button type="button" onClick={() => void restaurar()} style={{ cursor: 'pointer' }}>
              Restaurar dados
            </button>
          </div>
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 'var(--t-h4)', marginTop: 0 }}>Cenários (oportunidades do elenco)</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-caption)' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)' }}>
              <th>Código</th>
              <th>Fase</th>
              <th>O que mostra</th>
            </tr>
          </thead>
          <tbody>
            {estado.cenarios.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: 'var(--space-8) 0' }}>
                  <Link href={`/oportunidades/${c.id}`}>{c.code}</Link>
                </td>
                <td>{c.fase}</td>
                <td>
                  <strong>{c.titulo}</strong>
                  <br />
                  {c.cenario}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 'var(--t-h4)', marginTop: 0 }}>Rotas mockadas ({estado.rotas.length})</h2>
        <input
          placeholder="Filtrar (ex.: garantia, POST, :id/parecer)"
          value={filtroRota}
          onChange={(e) => setFiltroRota(e.target.value)}
          style={{ width: '100%', padding: 'var(--space-8)', marginBottom: 'var(--space-12)' }}
        />
        <ul style={{ fontFamily: 'monospace', fontSize: 'var(--t-small)', margin: 0, paddingLeft: 'var(--space-16)' }}>
          {rotas.map((r) => (
            <li key={`${r.method} ${r.pattern}`}>
              {r.method.padEnd(6, ' ')} /api{r.pattern}{' '}
              <span style={{ color: 'var(--color-text-muted)' }}>· {r.dominio}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
