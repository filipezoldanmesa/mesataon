/**
 * Esta garantia estava no conjunto que a CCOB recusou?
 *
 * O aviso amarelo do ticket afirma a recusa do CONJUNTO (VBR-500 — o subprocesso
 * é 1:1 com a oportunidade, e a prévia analisa tudo junto), e deliberadamente
 * NÃO diz que cada linha listada foi reprovada. O rótulo por linha é a
 * afirmação mais forte, e só é honesta com esta pergunta: a garantia existia
 * quando a CCOB decidiu?
 *
 * ⚠️ Rotular TODAS as persistidas seria falso justamente no caso em que o LT já
 * começou a corrigir. Ele existe: `handleSubmeterLote` faz DUAS passadas —
 * `indicar` cria todas as linhas, depois os anexos —, e uma falha na segunda
 * deixa garantia NOVA persistida com o ticket ainda aberto. Mandar retirar uma
 * garantia que a CCOB nunca viu é o oposto do que o aviso pede.
 *
 * A comparação é com `concluidaEm` (quando a CCOB decidiu), não com `abertaEm`.
 * Hoje as duas coincidem na prática: `indicacaoMutavel` fecha a escrita enquanto
 * o subprocesso está em `EM_ANALISE_PREVIA` (não há pendência de garantia ativa
 * ali), então ninguém cadastra durante a análise. Se essa janela abrir, o
 * critério mais conservador passa a ser `abertaEm`.
 *
 * ⚠️ Falta de data dos dois lados responde `false` — nunca `true`. "Não sei"
 * não pode virar uma acusação na tela; o aviso continua dizendo o que o backend
 * de fato sustenta (o conjunto foi recusado). Vale para data ilegível também: a
 * comparação com `NaN` é sempre falsa, mas o `Number.isNaN` explícito diz que é
 * decisão, não acidente de ponto flutuante.
 */
export function foiRecusadaNaPrevia(
  criadaEm: string | null | undefined,
  previaConcluidaEm: string | null | undefined,
): boolean {
  if (!criadaEm || !previaConcluidaEm) return false;

  const criada = Date.parse(criadaEm);
  const decidida = Date.parse(previaConcluidaEm);
  if (Number.isNaN(criada) || Number.isNaN(decidida)) return false;

  return criada < decidida;
}
