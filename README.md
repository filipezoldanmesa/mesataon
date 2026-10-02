# Gestor de Oportunidades — Protótipo

Cópia navegável do front do Gestor de Oportunidades, com **todos os dados fictícios**. O design
cria funcionalidades novas aqui, e o desenvolvimento transforma cada uma em task olhando o diff.

## Começar

Requisitos: Node 22+ e pnpm 9+.

```bash
pnpm install
pnpm dev
```

Abra http://localhost:3000, escolha um perfil e navegue. Em http://localhost:3000/prototipo você
troca de perfil, restaura os dados e simula lentidão ou falha.

## Criar uma funcionalidade (design)

Abra o Claude Code nesta pasta e descreva o que quer, por exemplo:

> Quero que o SNEG consiga marcar uma oportunidade como "prioritária" na tela de análise, com um
> motivo, e que isso apareça como selo na listagem. Task 68900.

O Claude segue a skill `nova-funcionalidade`: cria a branch, escreve a especificação com você,
monta a tela no padrão de produção, cria os dados falsos e prepara o PR. As regras estão no
[CLAUDE.md](CLAUDE.md).

## Manter em dia com a produção

```bash
pnpm sync:upstream
```

Precisa do repositório de produção (`vibra-gestor-oportunidades`) clonado na mesma pasta-mãe que
este (ou de `UPSTREAM_DIR=<caminho>`). Veja "Sincronizar com a produção" no [CLAUDE.md](CLAUDE.md).

## Estrutura

- `src/` fora de `mocks/`, `app/api/` e `app/prototipo/`: **código de produto**, idêntico ao da
  produção e copiado para lá no port.
- `src/mocks/`: dados e respostas falsas (elenco compartilhado em `src/mocks/elenco.ts`).
- `especificacoes/`: uma especificação por funcionalidade.
- Branch `upstream`: só snapshots da produção. Não faça commit nela à mão.
