/**
 * A frase do modo leitura das tabelas de franquia — a MESMA dos cards da
 * Governança (`campos-obrigatorios-card`, `padroes-bp-card`).
 *
 * Matriz RBAC v2.1 (28/09/2026), "GOVERNANÇA · Parametrizações": o SPCOM
 * VISUALIZA; só os executores escrevem. Esconder o CTA nunca esconde o FATO —
 * a tabela continua inteira, e esta frase diz por que não há botões.
 */
export function SomenteLeituraHint() {
  return (
    <p
      data-testid="franquia-somente-leitura"
      className="mb-3 text-(length:--t-small) text-(--color-text-muted)"
    >
      Somente leitura — seu perfil consulta esta tabela, mas não a altera.
    </p>
  );
}
