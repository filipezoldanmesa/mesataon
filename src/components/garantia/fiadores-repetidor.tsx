/**
 * O repetidor de FIADORES da garantia — dono único, montado pelas DUAS telas.
 *
 * ## Por que ele saiu do ticket
 *
 * O formulário do ticket sempre teve o repetidor completo (nome, documento,
 * estado civil, cônjuge, "+ Adicionar fiador"). O card da 01b **não coletava
 * fiador nenhum** — só o par nome+CNPJ do banco, e só na bancária.
 *
 * ⚠️ **A consequência não era cosmética.** `motivosDeInaptidao` exige
 * `temFiador` em TODO `FIANCA_*`, então uma **fiança com lastro** ou **sem
 * lastro** cadastrada pelo card **nunca ficava apta** — por construção, não por
 * erro do usuário. Dois dos quatro tipos eram impossíveis de completar ali, e o
 * subprocesso ficava em "Aguardando a indicação da garantia pelo LT" para
 * sempre. Pedido do negócio em 02/09/2026: *"os campos de fiador… deixar igual
 * ao que tá lá no ticket de pendência"*.
 *
 * ## O estado civil é POR FIADOR, e a decisão está aqui
 *
 * A pergunta ficou aberta desde 01/09/2026: o card guardava `estadoCivil` na
 * INDICAÇÃO (migration `…132`) e o ticket em cada FIADOR. "Igual ao ticket"
 * resolve — por fiador —, e é o modelo correto: uma fiança pode ter dois
 * fiadores com estados civis diferentes, e um campo por indicação não tem como
 * representar isso. `FiadorDto.estadoCivil` já é o que o backend recebe.
 *
 * ## O banco É o fiador (FB-01/FB-02)
 *
 * Numa `FIANCA_BANCARIA` o garantidor é o banco, e `nome`/`documento` guardam
 * exatamente o par que FB-01/FB-02 pedem — os rótulos mudam por `ehBanco`. Foi
 * por isso que os campos `bancoNome`/`bancoDocumento` do card puderam sair: eram
 * um segundo par para o mesmo fato.
 */
"use client";

import { SECONDARY_OUTLINE_BTN } from '@/components/button';
import { LinhaAnexo } from '@/components/garantia/matriculas-laudos-blocos';
import { Select } from '@/components/ui/select';
import { ENDERECO_VAZIO, type EnderecoPessoa } from '@/lib/garantia/indicacoes.types';
import {
  ESTADO_CIVIL_OPTIONS,
  exigeConjuge,
  fiadorEhPessoaJuridica,
  type EstadoCivil,
} from '@/lib/garantia/constants';

/** Um fiador no formulário — o mesmo shape que `FiadorDto` recebe. */
export interface FiadorField {
  nome: string;
  documento: string;
  estadoCivil: EstadoCivil | "";
  conjugeNome: string;
  conjugeDocumento: string;
  /** Contato do fiador pessoa física — digitados, o CPF não os devolve. */
  email: string;
  profissao: string;
  endereco: EnderecoPessoa;
  /** Os mesmos três do cônjuge co-obrigado (só com `exigeConjuge`). */
  conjugeEmail: string;
  conjugeProfissao: string;
  conjugeEndereco: EnderecoPessoa;
  /**
   * A certidão de casamento DESTE fiador, escolhida e ainda não enviada
   * (migration `…139`).
   *
   * O par arquivo/anexado é o mesmo de `MatriculaBloco`: o upload só acontece
   * depois de a garantia (e o fiador) existirem, então o formulário guarda o
   * `File` e o host o sobe com `fiadorOrdem`.
   */
  certidaoFile: File | null;
  /** Veredito do backend: já existe certidão anexada para este fiador. */
  certidaoAnexada: boolean;
}

export const FIADOR_EMPTY: FiadorField = {
  nome: "",
  documento: "",
  estadoCivil: "",
  conjugeNome: "",
  conjugeDocumento: "",
  email: "",
  profissao: "",
  endereco: { ...ENDERECO_VAZIO },
  conjugeEmail: "",
  conjugeProfissao: "",
  conjugeEndereco: { ...ENDERECO_VAZIO },
  certidaoFile: null,
  certidaoAnexada: false,
};

const LABEL_CLASS =
  "mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)";

function Rotulo({
  htmlFor,
  obrigatorio = true,
  children,
}: {
  htmlFor: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={LABEL_CLASS}>
      {children}
      {obrigatorio && (
        <>
          {" "}
          <span aria-hidden="true" className="text-(--color-danger)">
            *
          </span>
        </>
      )}
    </label>
  );
}

/** 00000-000 — digits only, at most 8. */
function maskCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * E-mail, profissão e endereço completo de UMA pessoa (o fiador ou o cônjuge).
 *
 * Um bloco só para as duas: o pedido foi "os mesmos campos para fiador e
 * cônjuge", e dois blocos copiados divergiriam. `idBase` mantém os `id`s
 * únicos por pessoa.
 */
function PessoaContatoCampos({
  idBase,
  rotuloPessoa,
  email,
  profissao,
  endereco,
  disabled,
  inputClassName,
  onChange,
}: {
  idBase: string;
  /** "do fiador" / "do cônjuge" — completa os rótulos. */
  rotuloPessoa: string;
  email: string;
  profissao: string;
  endereco: EnderecoPessoa;
  disabled: boolean;
  inputClassName: string;
  onChange: (
    patch: { email?: string; profissao?: string; endereco?: EnderecoPessoa },
  ) => void;
}) {
  const setEnd = (patch: Partial<EnderecoPessoa>) =>
    onChange({ endereco: { ...endereco, ...patch } });

  return (
    <>
      <div>
        <Rotulo htmlFor={`${idBase}-email`}>E-mail {rotuloPessoa}</Rotulo>
        <input
          id={`${idBase}-email`}
          type="email"
          value={email}
          onChange={(e) => onChange({ email: e.target.value })}
          disabled={disabled}
          placeholder="nome@exemplo.com.br"
          className={inputClassName}
        />
      </div>
      <div>
        <Rotulo htmlFor={`${idBase}-profissao`}>Profissão {rotuloPessoa}</Rotulo>
        <input
          id={`${idBase}-profissao`}
          type="text"
          value={profissao}
          onChange={(e) => onChange({ profissao: e.target.value })}
          disabled={disabled}
          placeholder="Ex.: Empresário"
          className={inputClassName}
        />
      </div>

      <fieldset className="mt-1 min-w-0 border-0 p-0 sm:col-span-2">
        <legend className={`${LABEL_CLASS} mb-3`}>Endereço {rotuloPessoa}</legend>
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <Rotulo htmlFor={`${idBase}-cep`}>CEP</Rotulo>
            <input
              id={`${idBase}-cep`}
              type="text"
              inputMode="numeric"
              value={endereco.cep}
              onChange={(e) => setEnd({ cep: maskCep(e.target.value) })}
              disabled={disabled}
              placeholder="00000-000"
              className={inputClassName}
            />
          </div>
          <div className="sm:col-span-4">
            <Rotulo htmlFor={`${idBase}-logradouro`}>Logradouro</Rotulo>
            <input
              id={`${idBase}-logradouro`}
              type="text"
              value={endereco.logradouro}
              onChange={(e) => setEnd({ logradouro: e.target.value })}
              disabled={disabled}
              placeholder="Rua, avenida…"
              className={inputClassName}
            />
          </div>
          <div className="sm:col-span-2">
            <Rotulo htmlFor={`${idBase}-numero`}>Número</Rotulo>
            <input
              id={`${idBase}-numero`}
              type="text"
              value={endereco.numero}
              onChange={(e) => setEnd({ numero: e.target.value })}
              disabled={disabled}
              placeholder="Ex.: 1000"
              className={inputClassName}
            />
          </div>
          <div className="sm:col-span-4">
            <Rotulo htmlFor={`${idBase}-complemento`} obrigatorio={false}>
              Complemento
            </Rotulo>
            <input
              id={`${idBase}-complemento`}
              type="text"
              value={endereco.complemento}
              onChange={(e) => setEnd({ complemento: e.target.value })}
              disabled={disabled}
              placeholder="Apto, bloco, sala…"
              className={inputClassName}
            />
          </div>
          <div className="sm:col-span-3">
            <Rotulo htmlFor={`${idBase}-bairro`}>Bairro</Rotulo>
            <input
              id={`${idBase}-bairro`}
              type="text"
              value={endereco.bairro}
              onChange={(e) => setEnd({ bairro: e.target.value })}
              disabled={disabled}
              className={inputClassName}
            />
          </div>
          <div className="sm:col-span-2">
            <Rotulo htmlFor={`${idBase}-cidade`}>Cidade</Rotulo>
            <input
              id={`${idBase}-cidade`}
              type="text"
              value={endereco.cidade}
              onChange={(e) => setEnd({ cidade: e.target.value })}
              disabled={disabled}
              className={inputClassName}
            />
          </div>
          <div className="sm:col-span-1">
            <Rotulo htmlFor={`${idBase}-uf`}>UF</Rotulo>
            <input
              id={`${idBase}-uf`}
              type="text"
              value={endereco.uf}
              onChange={(e) =>
                setEnd({ uf: e.target.value.toUpperCase().slice(0, 2) })
              }
              maxLength={2}
              disabled={disabled}
              placeholder="SP"
              className={inputClassName}
            />
          </div>
        </div>
      </fieldset>
    </>
  );
}

function FiadorItem({
  index,
  fiador,
  disabled,
  onChange,
  onRemove,
  showRemove,
  ehBanco,
  inputClassName,
}: {
  index: number;
  fiador: FiadorField;
  disabled: boolean;
  onChange: (index: number, patch: Partial<FiadorField>) => void;
  onRemove: (index: number) => void;
  showRemove: boolean;
  /**
   * FB-01/FB-02 — numa `FIANCA_BANCARIA` o fiador É o banco, então os rótulos
   * passam a dizer isso: "Nome do banco" e "CNPJ".
   *
   * Reuso, não campos novos (decisão de 31/08/2026): `nome` e `documento` já
   * guardam exatamente o par que FB-01/FB-02 pedem, e um segundo par seria a
   * duplicação que este repo evita — com o risco de os dois discordarem sobre
   * qual é o banco da garantia.
   *
   * ⚠️ Vem do TIPO da garantia, não de `fiadorEhPessoaJuridica`: aquele predicado
   * lê o documento digitado e serve para decidir sobre o estado civil, então
   * enquanto o CNPJ estiver incompleto ele responde "pessoa física" — e o rótulo
   * ficaria oscilando entre "Nome completo" e "Nome do banco" letra por letra.
   */
  ehBanco: boolean;
  /**
   * O estilo de campo DA TELA que monta o repetidor — o mesmo que os demais
   * inputs dela usam.
   *
   * ⚠️ Sem default, de propósito: os dois hosts têm estilos diferentes (o card
   * usa fundo `--neutral-40` com borda inferior grossa; o ticket usa caixa com
   * borda inteira e anel de foco), e um default aqui reproduziria o defeito que
   * o campo de matrícula teve — um terceiro estilo, de nenhuma das duas telas.
   */
  inputClassName: string;
}) {
  /*
   * A `FIANCA_BANCARIA` has the bank as fiador (a CNPJ), and a company has no
   * marital status — asking for it (with an asterisk) forced whoever filled the
   * form to invent an answer. The predicate reads the document the form already
   * collects; the same one gates the DTO, so the screen hides exactly what the
   * API stops requiring.
   */
  /*
   * ⚠️ `ehBanco` ENTRA no predicado, e não é redundante: `fiadorEhPessoaJuridica`
   * lê o documento DIGITADO, então numa fiança bancária com o CNPJ ainda em
   * branco ele responde "pessoa física" — e o formulário perguntava o estado
   * civil de um banco até a máscara completar. O tipo da garantia já sabe a
   * resposta antes de qualquer digitação.
   */
  const isPessoaJuridica = ehBanco || fiadorEhPessoaJuridica(fiador.documento);
  const needsConjuge = !isPessoaJuridica && exigeConjuge(fiador.estadoCivil);

  return (
    <div
      data-testid={`fiador-${index}`}
      className="space-y-4 rounded-[var(--radius-xs)] border border-(--color-border) p-4"
    >
      {/*
        ⚠️ Na bancária NÃO existe cabeçalho de bloco.
        
        Ele dizia "Fiador 1" acima de "Nome do banco", e foi o que levou o relato
        de 02/09/2026 a concluir que o banco "está ficando como fiador" por
        engano — o modelo está certo (o banco É o fiador, reusando os mesmos dois
        campos, FB-01/FB-02); era o rótulo que o descrevia mal.
        
        Omitido em vez de renomeado: o cabeçalho existe para DISTINGUIR blocos de
        um repetidor, e na bancária há um só. Quem nomeia o grupo é a legenda do
        host ("Banco" nas duas telas), e os campos dizem o resto. Um segundo
        rótulo ali seria "BANCO ▸ BANCO GARANTIDOR".
        
        Some com o "Remover" dentro, que na bancária já era `false` — remover o
        único garantidor deixaria a fiança sem nenhum.
      */}
      {!ehBanco && (
        <div className="flex items-center justify-between">
          <span className="text-(length:--t-small) font-bold text-(--color-text-muted) uppercase tracking-[0.3px]">
            Fiador {index + 1}
          </span>
          {showRemove && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              disabled={disabled}
              className="text-(length:--t-small) text-(--color-danger) hover:underline disabled:opacity-50"
            >
              Remover
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`fiador-${index}-nome`}
            className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
          >
            {ehBanco ? "Nome do banco" : "Nome completo"}{" "}
            <span aria-hidden="true" className="text-(--color-danger)">
              *
            </span>
          </label>
          <input
            id={`fiador-${index}-nome`}
            type="text"
            value={fiador.nome}
            onChange={(e) => onChange(index, { nome: e.target.value })}
            disabled={disabled}
            placeholder={
              ehBanco ? "Ex.: Banco do Brasil S.A." : "Nome legal completo"
            }
            className={inputClassName}
          />
        </div>

        <div>
          <label
            htmlFor={`fiador-${index}-documento`}
            className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
          >
            {ehBanco ? "CNPJ" : "CPF / CNPJ"}{" "}
            <span aria-hidden="true" className="text-(--color-danger)">
              *
            </span>
          </label>
          <input
            id={`fiador-${index}-documento`}
            type="text"
            value={fiador.documento}
            onChange={(e) => onChange(index, { documento: e.target.value })}
            disabled={disabled}
            placeholder={ehBanco ? "00.000.000/0000-00" : "123.456.789-00"}
            className={inputClassName}
          />
        </div>

        {!isPessoaJuridica && (
          <div className="sm:col-span-2">
            <label
              htmlFor={`fiador-${index}-estadoCivil`}
              className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
            >
              Estado civil{" "}
              <span aria-hidden="true" className="text-(--color-danger)">
                *
              </span>
            </label>
            <Select
              id={`fiador-${index}-estadoCivil`}
              value={fiador.estadoCivil}
              onChange={(v) => onChange(index, { estadoCivil: v as EstadoCivil | "" })}
              options={ESTADO_CIVIL_OPTIONS}
              placeholder="Selecione..."
              disabled={disabled}
              variant="boxed"
            />
          </div>
        )}

        {/* Pessoa jurídica (o banco) não tem e-mail/profissão/endereço a pedir. */}
        {!isPessoaJuridica && (
          <PessoaContatoCampos
            idBase={`fiador-${index}`}
            rotuloPessoa="do fiador"
            email={fiador.email}
            profissao={fiador.profissao}
            endereco={fiador.endereco}
            disabled={disabled}
            inputClassName={inputClassName}
            onChange={(patch) => onChange(index, patch)}
          />
        )}

        {needsConjuge && (
          <>
            {/* Divisor: separa os dados do fiador dos do cônjuge. */}
            <hr className="my-1 border-(--color-border) sm:col-span-2" />
            <div>
              <label
                htmlFor={`fiador-${index}-conjugeNome`}
                className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                Nome do cônjuge{" "}
                <span aria-hidden="true" className="text-(--color-danger)">
                  *
                </span>
              </label>
              <input
                id={`fiador-${index}-conjugeNome`}
                type="text"
                value={fiador.conjugeNome}
                onChange={(e) => onChange(index, { conjugeNome: e.target.value })}
                disabled={disabled}
                placeholder="Nome legal do cônjuge"
                className={inputClassName}
              />
            </div>
            <div>
              <label
                htmlFor={`fiador-${index}-conjugeDocumento`}
                className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                CPF/CNPJ do cônjuge{" "}
                <span aria-hidden="true" className="text-(--color-danger)">
                  *
                </span>
              </label>
              <input
                id={`fiador-${index}-conjugeDocumento`}
                type="text"
                value={fiador.conjugeDocumento}
                onChange={(e) =>
                  onChange(index, { conjugeDocumento: e.target.value })
                }
                disabled={disabled}
                placeholder="CPF ou CNPJ do cônjuge"
                className={inputClassName}
              />
            </div>
            <PessoaContatoCampos
              idBase={`fiador-${index}-conjuge`}
              rotuloPessoa="do cônjuge"
              email={fiador.conjugeEmail}
              profissao={fiador.conjugeProfissao}
              endereco={fiador.conjugeEndereco}
              disabled={disabled}
              inputClassName={inputClassName}
              onChange={(patch) =>
                onChange(index, {
                  ...(patch.email !== undefined && { conjugeEmail: patch.email }),
                  ...(patch.profissao !== undefined && {
                    conjugeProfissao: patch.profissao,
                  }),
                  ...(patch.endereco !== undefined && {
                    conjugeEndereco: patch.endereco,
                  }),
                })
              }
            />
          </>
        )}
      </div>

      {/*
        A certidão de casamento DESTE fiador (migration `…139`).

        ⚠️ Dentro do box, e é o ponto do pedido de 02/09/2026: *"a certidão de
        casamento do fiador está ficando fora do box/card de fiador, permitindo
        que se eu cadastrar mais de 1 fiador, fique apenas 1 anexo"*. Era
        literal — o slot vivia no nível da garantia, e a regra `single` do
        catálogo é escopada por garantia: dois fiadores casados disputavam um
        anexo e o segundo upload vinha 409.

        Aparece com a mesma condição do bloco do cônjuge (`needsConjuge`) — é a
        certidão do casamento que cria a co-obrigação. ⚠️ E aparece também quando
        JÁ existe uma anexada, em qualquer estado civil: linha criada antes desta
        regra, ou estado civil corrigido depois do anexo — esconder tiraria a
        única forma de substituí-la, e o documento continuaria contando no
        dossiê. Mesma doutrina de "linha com documento nunca é escondida".
      */}
      {(needsConjuge || fiador.certidaoAnexada) && (
        <LinhaAnexo
          testId={`fiador-${index}-certidao-casamento`}
          rotulo={`Certidão de casamento · fiador ${index + 1}`}
          arquivo={fiador.certidaoFile}
          anexado={fiador.certidaoAnexada}
          disabled={disabled}
          onPick={(file) => onChange(index, { certidaoFile: file })}
        />
      )}
    </div>
  );
}

/**
 * A lista de fiadores mais o "+ Adicionar fiador".
 *
 * Um componente e não dois: as duas telas montam o conjunto inteiro, e deixar a
 * lista para o host significaria duas cópias do laço, do botão e da regra de
 * "quando aparece o Remover" — a divergência por cópia que este repo persegue.
 */
export function FiadoresRepetidor({
  fiadores,
  onChange,
  disabled = false,
  ehBanco,
  inputClassName,
}: {
  fiadores: FiadorField[];
  onChange: (next: FiadorField[]) => void;
  disabled?: boolean;
  /** `true` na fiança bancária — muda os rótulos para banco/CNPJ. */
  ehBanco: boolean;
  inputClassName: string;
}) {
  const alterar = (index: number, patch: Partial<FiadorField>): void => {
    onChange(
      fiadores.map((f, i) => {
        if (i !== index) return f;
        const proximo = { ...f, ...patch };
        /*
         * Trocar o estado civil para um que não tem co-obrigado limpa o cônjuge:
         * senão o nome do cônjuge de um "casado" sobreviveria num "solteiro" e
         * viajaria no payload — o backend recusa (`@IsEmptyWhen`), e o usuário
         * receberia 400 por um campo que a tela nem mostra mais.
         *
         * O ARQUIVO escolhido cai junto, pela mesma razão: o slot desaparece, e
         * subi-lo depois gravaria a certidão de casamento de quem a tela deixou
         * de dizer que é casado. `certidaoAnexada` NÃO é limpo — o documento
         * existe no dossiê, e o flag é veredito do backend, não da tela.
         */
        if (patch.estadoCivil !== undefined && !exigeConjuge(patch.estadoCivil)) {
          proximo.conjugeNome = "";
          proximo.conjugeDocumento = "";
          proximo.conjugeEmail = "";
          proximo.conjugeProfissao = "";
          proximo.conjugeEndereco = { ...ENDERECO_VAZIO };
          proximo.certidaoFile = null;
        }
        return proximo;
      }),
    );
  };

  return (
    <div data-testid="fiadores-repetidor" className="space-y-4">
      {/*
        Na bancária, SÓ o primeiro bloco: o garantidor é um (o banco). Recortar na
        renderização, e não no estado, preserva o que já estava digitado se o
        usuário voltar para um tipo de fiança com vários — a mesma razão pela qual
        trocar o estado civil não apaga `certidaoAnexada`.
      */}
      {(ehBanco ? fiadores.slice(0, 1) : fiadores).map((fiador, i) => (
        <FiadorItem
          key={i}
          index={i}
          fiador={fiador}
          disabled={disabled}
          ehBanco={ehBanco}
          inputClassName={inputClassName}
          onChange={alterar}
          onRemove={(index) => onChange(fiadores.filter((_, j) => j !== index))}
          /* Com um fiador só, remover deixaria a fiança sem garantidor — e o
             gate de aptidão exige ao menos um. */
          showRemove={!ehBanco && fiadores.length > 1}
        />
      ))}
      {/*
        ⚠️ A fiança BANCÁRIA tem UM garantidor: o banco que emitiu a carta
        (FB-01/FB-02). Oferecer "+ Adicionar fiador" ali convidava a cadastrar um
        segundo banco para a mesma fiança — relatado do stage em 02/09/2026, e a
        própria pergunta do relato ("não deveria estar como fiador?") mostra que a
        afordância confundia o modelo: o banco É o fiador, mas é um só.

        Escondido, não desabilitado: botão que nunca pode ser pressionado é
        controle morto (mesma regra da sendbar do contrato). O "Remover" cai pela
        mesma razão — com um fiador só ele já não aparecia, e na bancária remover
        o único deixaria a fiança sem garantidor.
      */}
      {!ehBanco && (
        <button
          type="button"
          onClick={() => onChange([...fiadores, { ...FIADOR_EMPTY }])}
          disabled={disabled}
          className={SECONDARY_OUTLINE_BTN}
        >
          + Adicionar fiador
        </button>
      )}
    </div>
  );
}
