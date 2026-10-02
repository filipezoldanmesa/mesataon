/**
 * Respostas do mock — no MESMO formato que a BFF de produção devolve.
 *
 * Erro da BFF em produção é `{ error: string }` com o status do backend (ver
 * `lib/server/backend-error.ts`), e é esse o corpo que os `*.api.ts` leem.
 */

export function json<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

/** `DELETE` na BFF responde 204. */
export function semConteudo(): Response {
  return new Response(null, { status: 204 });
}

/** Rotas de ação (`POST .../remover`, `.../encerrar`) respondem 200 com corpo vazio. */
export function okVazio(): Response {
  return new Response(null, { status: 200 });
}

export function erro(status: number, mensagem: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error: mensagem, ...extra }, { status });
}

export const naoEncontrado = (o = 'Recurso') => erro(404, `${o} não encontrado.`);
export const naoAutenticado = () => erro(401, 'Não autenticado.');
export const semPermissao = () => erro(403, 'Seu perfil não tem permissão para esta ação.');

/** Lê um campo do corpo, seja JSON ou FormData. */
export function campo<T = unknown>(body: unknown, nome: string): T | undefined {
  if (body instanceof FormData) return (body.get(nome) ?? undefined) as T | undefined;
  if (body && typeof body === 'object') return (body as Record<string, unknown>)[nome] as T | undefined;
  return undefined;
}

/** Nome do arquivo enviado num upload multipart (campo `file` por padrão). */
export function arquivoEnviado(body: unknown, nome = 'file'): { nome: string; tamanho: number; tipo: string } | null {
  if (!(body instanceof FormData)) return null;
  const f = body.get(nome);
  if (!f || typeof f === 'string') return null;
  return { nome: f.name, tamanho: f.size, tipo: f.type || 'application/octet-stream' };
}

/**
 * PDF mínimo e válido, com um título — para todo download/stream de documento
 * (minuta, parecer, contrato assinado, COF, Anexo J...). O conteúdo é sempre de
 * exemplo; o que importa no protótipo é o fluxo de abrir/baixar funcionar.
 */
export function pdf(titulo: string, nomeArquivo = 'documento.pdf', inline = true): Response {
  const texto = titulo.replace(/[()\\]/g, ' ').slice(0, 80);
  const stream = `BT /F1 18 Tf 72 720 Td (${texto}) Tj ET\nBT /F1 11 Tf 72 690 Td (Documento de exemplo - prototipo do Gestor de Oportunidades) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Response(out, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${nomeArquivo}"`,
    },
  });
}

/** Imagem SVG de exemplo (fotos do posto, imagens de garantia, anexos). */
export function imagem(rotulo: string, cor = '#3c781e'): Response {
  const t = rotulo.replace(/[<>&"]/g, ' ').slice(0, 40);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="${cor}" opacity="0.15"/><rect x="20" y="20" width="760" height="460" fill="none" stroke="${cor}" stroke-width="4" stroke-dasharray="12 8"/><text x="400" y="240" font-family="Arial" font-size="32" text-anchor="middle" fill="${cor}">${t}</text><text x="400" y="290" font-family="Arial" font-size="18" text-anchor="middle" fill="${cor}">imagem de exemplo · protótipo</text></svg>`;
  return new Response(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
}

/** CSV para exportações (auditoria). */
export function csv(conteudo: string, nomeArquivo: string): Response {
  return new Response(`﻿${conteudo}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
    },
  });
}
