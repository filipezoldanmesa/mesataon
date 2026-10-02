/**
 * Estado em memória do protótipo.
 *
 * Cada domínio declara a SUA fatia com `fatia(nome, semente)`: a semente roda
 * na primeira leitura e o resultado vive até o servidor reiniciar ou alguém
 * clicar em "Restaurar dados" em `/prototipo`. Ações (POST/PUT/PATCH/DELETE)
 * mutam a fatia, então os fluxos andam de verdade: enviar para análise muda a
 * fase, a tela recarrega e mostra a fase nova.
 *
 * Fica em `globalThis` porque o `next dev` recompila módulos a cada edição — sem
 * isso o estado zeraria a cada save e o designer perderia o fluxo que montou.
 */

type Semente<T> = () => T;

interface Registro {
  valores: Map<string, unknown>;
  sementes: Map<string, Semente<unknown>>;
  /** Junto do estado: se zerasse numa recompilação, `novoId` repetiria ids que ainda existem. */
  contador: number;
}

const g = globalThis as typeof globalThis & { __prototipoStore?: Registro };
const registro: Registro = (g.__prototipoStore ??= { valores: new Map(), sementes: new Map(), contador: 1000 });
// Registro criado por uma versão anterior deste módulo (o `next dev` mantém o
// `globalThis` entre recompilações) pode não ter o campo.
registro.contador ??= 1000;

/**
 * Fatia de estado de um domínio. Devolve uma FUNÇÃO de leitura (e não o objeto)
 * para que o reset troque o objeto inteiro sem deixar referência velha presa.
 */
export function fatia<T>(nome: string, semente: Semente<T>): () => T {
  registro.sementes.set(nome, semente as Semente<unknown>);
  return () => {
    if (!registro.valores.has(nome)) {
      // structuredClone: a semente pode reutilizar constantes do elenco; mutar
      // o estado nunca pode alterar a constante.
      registro.valores.set(nome, structuredClone(semente()));
    }
    return registro.valores.get(nome) as T;
  };
}

/** Volta todas as fatias à semente. */
export function restaurarDados(): void {
  registro.valores.clear();
}

/** Id novo, legível e estável dentro da sessão do servidor. */
export function novoId(prefixo: string): string {
  registro.contador += 1;
  return `${prefixo}-${registro.contador}`;
}

export function agoraIso(): string {
  return new Date().toISOString();
}
