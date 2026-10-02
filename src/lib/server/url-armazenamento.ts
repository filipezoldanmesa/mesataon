/**
 * Trava de origem do segundo salto das rotas de stream (anti-SSRF).
 *
 * As rotas que servem documento fazem dois saltos: pedem ao backend a URL
 * presigned e, com ela, buscam os bytes no document store. O segundo salto
 * usava a URL **verbatim**, sem validar nada.
 *
 * ⚠️ **A trava é deliberadamente estreita.** Ela recusa o que nunca é legítimo
 * aqui — esquema não-HTTP e a faixa link-local, onde vive o endpoint de
 * metadados do cloud. Uma allowlist de host seria mais forte, mas exigiria a BFF
 * conhecer a configuração do document store (que é do backend) por uma variável
 * `NEXT_PUBLIC_*` — build-time, cujo modo de falha é silencioso: o bundle sai
 * sem o valor e a trava recusa tudo, sem nada acusando. O aviso no topo do
 * `CLAUDE.md` nasceu de um caso desses.
 *
 * O cenário coberto exige que a resposta do nosso backend já esteja sob controle
 * de quem ataca; é defesa em profundidade, o mesmo `toAllowedUrl` que os clients
 * da ACL aplicam — e a BFF era a única camada sem ele.
 */

/** `169.254.0.0/16` (IPv4) e `fd00:ec2::254` (IPv6) — metadados de instância. */
function ehLinkLocal(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  // O endereço IPv6 que AWS e GCP usam para o serviço de metadados.
  if (host === 'fd00:ec2::254' || host.startsWith('fe80:')) return true;
  return false;
}

/**
 * Devolve a URL do document store validada, ou lança.
 *
 * Loopback **não** é recusado de propósito: o compose resolve o storage por DNS
 * interno (`http://minio:9000`) e há quem rode o MinIO em `localhost` — bloquear
 * quebraria o desenvolvimento sem ganho, já que o cenário exige controlar a
 * resposta do backend antes.
 */
export function urlDeArmazenamentoSegura(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Documento com origem não permitida.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Documento com origem não permitida.');
  }

  if (ehLinkLocal(parsed.hostname)) {
    throw new Error('Documento com origem não permitida.');
  }

  return parsed;
}
