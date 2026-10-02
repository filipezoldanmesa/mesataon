import type { BackendParametrizationItem, mapRepositoryDoc } from '@/lib/documents/documents-mapping';

/** Forma do backend de um documento do repositório (o que `mapRepositoryDoc` lê). */
export type DocRepositorio = Parameters<typeof mapRepositoryDoc>[1];

/**
 * Catálogo de tipos de documento (`document_parametrizations`) no estado atual da
 * produção: sem `Cartão CNPJ`, CPF/RG unificados e o contrato social por bandeira
 * (migrations `…005`, `…125`). A linha legada da FAP fica com `selectable: false`
 * — sai do picker, nunca da listagem.
 */
export const CATALOGO_DOCUMENTOS: BackendParametrizationItem[] = [
  { category: 'Cliente (PJ)', type: 'Contrato social', acceptedTypes: ['pdf'] },
  { category: 'Cliente (PF)', type: 'CPF / RG do cliente', acceptedTypes: ['pdf', 'png', 'jpeg'] },
  { category: 'Cliente (PF)', type: 'Comprovante de residência', acceptedTypes: ['pdf', 'png', 'jpeg'] },
  { category: 'Sócio', type: 'CPF / RG dos sócios', acceptedTypes: ['pdf', 'png', 'jpeg'] },
  { category: 'Sócio', type: 'Contrato social do sócio (PJ)', acceptedTypes: ['pdf', 'png', 'jpeg'] },
  { category: 'Representante do sócio', type: 'CPF / RG do representante', acceptedTypes: ['pdf', 'png', 'jpeg'] },
  { category: 'Posto', type: 'Fotos do posto', acceptedTypes: ['png', 'jpeg'] },
  { category: 'Posto', type: 'Certificado / Registro ANP', acceptedTypes: ['pdf'] },
  { category: 'Posto', type: 'Licença ambiental', acceptedTypes: ['pdf'] },
  { category: 'BR Mania / Lubrax+', type: 'Contrato social BR Mania', acceptedTypes: ['pdf'] },
  { category: 'BR Mania / Lubrax+', type: 'Contrato social Lubrax+', acceptedTypes: ['pdf'] },
  {
    category: 'BR Mania / Lubrax+',
    type: 'FAP BR Mania (legado — não usar em novos anexos)',
    acceptedTypes: ['pdf'],
    selectable: false,
  },
];

let seq = 0;
function doc(
  category: string,
  type: string,
  fileName: string,
  uploadedAt: string,
  extra: Partial<DocRepositorio> = {},
): DocRepositorio {
  seq += 1;
  const pdf = fileName.endsWith('.pdf');
  return {
    id: `doc-rep-${String(seq).padStart(3, '0')}`,
    category,
    type,
    fileName,
    mimeType: pdf ? 'application/pdf' : 'image/jpeg',
    sizeBytes: pdf ? 284_000 + seq * 1_317 : 1_240_000 + seq * 9_011,
    uploadedAt,
    expiresAt: null,
    origem: 'REPOSITORIO',
    opportunityId: null,
    opportunityCode: null,
    situacao: 'NO_REPOSITORIO',
    ...extra,
  };
}

/** Da oportunidade: vínculo com o checklist de lá — a tela do cliente mostra em leitura. */
function daOportunidade(opportunityId: string, opportunityCode: string, validado: boolean): Partial<DocRepositorio> {
  return { origem: 'OPORTUNIDADE', opportunityId, opportunityCode, situacao: validado ? 'VALIDADO' : 'ANEXADO' };
}

/** Semente do repositório, por id de rota do cliente (SAP, ou CRM id do prospect). */
export function sementeRepositorio(): Record<string, DocRepositorio[]> {
  seq = 0;
  return {
    '900101': [
      doc('Cliente (PJ)', 'Contrato social', 'contrato-social-horizonte-azul.pdf', '2026-05-20T13:00:00Z', daOportunidade('opp-009', 'OPP-0009', true)),
      doc('Sócio', 'CPF / RG dos sócios', 'documentos-socios-horizonte.pdf', '2026-05-20T13:05:00Z', daOportunidade('opp-009', 'OPP-0009', true)),
      doc('Posto', 'Licença ambiental', 'licenca-ambiental-2025.pdf', '2025-02-10T10:00:00Z', { expiresAt: '2026-02-10', situacao: 'VENCIDO' }),
      doc('Posto', 'Fotos do posto', 'fachada-horizonte.jpg', '2026-09-23T15:20:00Z'),
    ],
    '900102': [
      doc('Cliente (PJ)', 'Contrato social', 'contrato-social-serra-verde.pdf', '2026-03-05T12:00:00Z', daOportunidade('opp-010', 'OPP-0010', true)),
      doc('Sócio', 'Contrato social do sócio (PJ)', 'contrato-social-serra-verde-participacoes.pdf', '2026-03-05T12:10:00Z', daOportunidade('opp-010', 'OPP-0010', true)),
      doc('Posto', 'Certificado / Registro ANP', 'registro-anp-serra-verde.pdf', '2026-09-11T09:00:00Z', { expiresAt: '2027-09-11' }),
      doc('BR Mania / Lubrax+', 'Contrato social Lubrax+', 'contrato-social-lubrax-serra-verde.pdf', '2026-09-12T09:30:00Z'),
    ],
    '900103': [
      doc('Cliente (PJ)', 'Contrato social', 'contrato-social-litoral-sul.pdf', '2026-08-29T11:00:00Z', daOportunidade('opp-003', 'OPP-0003', false)),
      doc('Posto', 'Fotos do posto', 'pista-litoral-sul.jpg', '2026-08-29T11:15:00Z', daOportunidade('opp-003', 'OPP-0003', false)),
    ],
    '900104': [
      doc('Cliente (PJ)', 'Contrato social', 'contrato-social-cerrado.pdf', '2026-08-16T14:00:00Z', daOportunidade('opp-004', 'OPP-0004', false)),
      doc('Posto', 'Licença ambiental', 'licenca-ambiental-cerrado.pdf', '2024-06-01T10:00:00Z', { expiresAt: '2026-06-01', situacao: 'VENCIDO' }),
    ],
    '900105': [
      doc('Cliente (PJ)', 'Contrato social', 'contrato-social-baia-formosa.pdf', '2026-08-21T10:00:00Z', daOportunidade('opp-005', 'OPP-0005', false)),
      doc('BR Mania / Lubrax+', 'Contrato social BR Mania', 'contrato-social-brmania-baia.pdf', '2026-08-21T10:20:00Z'),
    ],
    '900106': [
      doc('Cliente (PJ)', 'Contrato social', 'contrato-social-vale-do-rio.pdf', '2026-07-31T16:00:00Z', daOportunidade('opp-006', 'OPP-0006', true)),
      doc('Sócio', 'CPF / RG dos sócios', 'socios-vale-do-rio.pdf', '2026-07-31T16:05:00Z', daOportunidade('opp-006', 'OPP-0006', true)),
      doc('Posto', 'Certificado / Registro ANP', 'registro-anp-vale.pdf', '2026-01-15T10:00:00Z', { expiresAt: '2027-01-15' }),
    ],
    '900107': [
      doc('Cliente (PJ)', 'Contrato social', 'contrato-social-planalto.pdf', '2026-07-13T09:00:00Z', daOportunidade('opp-007', 'OPP-0007', true)),
      doc('Representante do sócio', 'CPF / RG do representante', 'representante-planalto.pdf', '2026-07-13T09:10:00Z', daOportunidade('opp-007', 'OPP-0007', true)),
    ],
    '900108': [
      doc('Cliente (PJ)', 'Contrato social', 'contrato-social-pampa.pdf', '2026-06-26T10:00:00Z', daOportunidade('opp-008', 'OPP-0008', true)),
      doc('Sócio', 'Contrato social do sócio (PJ)', 'contrato-social-pampa-participacoes.pdf', '2026-06-26T10:05:00Z', daOportunidade('opp-008', 'OPP-0008', true)),
      doc('Posto', 'Licença ambiental', 'licenca-ambiental-pampa.pdf', '2026-04-02T10:00:00Z', { expiresAt: '2028-04-02' }),
      doc('Posto', 'Fotos do posto', 'obra-pampa.jpg', '2026-09-02T17:00:00Z'),
    ],
    '900205': [doc('BR Mania / Lubrax+', 'Contrato social BR Mania', 'contrato-social-brmania-unidade.pdf', '2026-08-21T10:30:00Z')],
    '001PRS000000001': [],
    '001PRS000000002': [doc('Cliente (PJ)', 'Contrato social', 'contrato-social-estrela-agreste.pdf', '2026-09-18T14:00:00Z')],
  };
}
