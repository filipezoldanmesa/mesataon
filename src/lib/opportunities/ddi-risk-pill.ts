import type { PillVariant } from '@/components/status-pill';

import type { DdiRiskLevel } from './ddi.types';

/**
 * Rótulo pt-BR + cor da pílula por nível de risco DDI — o único lugar em que
 * `DdiRiskLevel` vira texto de tela.
 *
 * Vive em módulo próprio porque tem DOIS consumidores: o card "Análises" da
 * oportunidade (protótipo `01b`, `.anpanel`) e o cabeçalho da Visão 360º do
 * cliente (protótipo `11-cliente-360.html`, `pill s Risco DDI Baixo`). A mesma
 * análise não pode ler diferente em duas telas — era exatamente isso que uma
 * segunda tabela permitiria, e é por isso que ela não existe.
 *
 * ⚠️ `high` é **danger**, e a cor não é decoração: um risco alto pintado de
 * verde afirma o contrário do que a análise apurou. O protótipo só desenha o
 * caminho feliz (`pill s`), então copiar o `variant="success"` dele para todos
 * os níveis era um defeito esperando um cliente de risco alto.
 *
 * Traduzir aqui, e não no backend, é o precedente já estabelecido para este
 * dado: `ddi-mapping.ts` normaliza `BAIXO｜MEDIO｜ALTO` para o enum, e a tela
 * rotula o enum — o que o CLAUDE.md permite explicitamente ("o front pode exibir
 * um enum como rótulo (`Record<Enum, string>`), mas nunca ramificar lógica de
 * negócio sobre ele").
 */
export const DDI_RISK_PILL: Record<DdiRiskLevel, { variant: PillVariant; label: string }> = {
  low: { variant: 'success', label: 'Baixo' },
  medium: { variant: 'warning', label: 'Médio' },
  high: { variant: 'danger', label: 'Alto' },
};
