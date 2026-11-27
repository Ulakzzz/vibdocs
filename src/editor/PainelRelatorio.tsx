// Dados gerais do relatório (automáticos, mas editáveis) e escolha das condições que entram nele.
import { CONDICOES } from '../lib/condicao'
import {
  gerarCodigo,
  textoRelatorio,
  lembrarArt,
  MESES_QUADRO_PADRAO,
  PADRAO_ANOMALIA,
  PADRAO_QUADRO,
  TODAS_CONDICOES,
  USINAS_RELATORIO,
  type PerfilTecnico,
  type Relatorio,
} from '../lib/relatorio'
import { btnMini, Campo, Texto, TextoLongo } from './campos'
import { ModeloWord } from './ModeloWord'

type Atualizar = (f: (r: Relatorio) => Relatorio) => void

function SeletorCondicoes(p: {
  titulo: string
  dica: string
  marcadas: string[]
  padrao: string[]
  contagem: Record<string, number>
  mudar: (v: string[]) => void
}) {
  const alternar = (c: string) =>
    p.mudar(p.marcadas.includes(c) ? p.marcadas.filter((x) => x !== c) : TODAS_CONDICOES.filter((x) => x === c || p.marcadas.includes(x)))
  return (
    <fieldset className="rounded-[14px] border border-linha p-4">
      <legend className="titulo px-1 text-sm">{p.titulo}</legend>
      <p className="mb-2 text-[11px] text-cinza">{p.dica}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {TODAS_CONDICOES.map((c) => {
          const k = CONDICOES[c]
          return (
            <label key={c} className="cond-opcao flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs">
              <input type="checkbox" checked={p.marcadas.includes(c)} onChange={() => alternar(c)} />
              <span className="chip" style={{ background: k.cor, color: k.texto, boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / .08)' }}>
                {c}
              </span>
              <span className="truncate">{k.nome}</span>
              {p.contagem[c] ? <span className="ml-auto text-cinza">{p.contagem[c]}</span> : null}
            </label>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1">
        <button className={btnMini} onClick={() => p.mudar([...p.padrao])}>
          Padrão
        </button>
        <button className={btnMini} onClick={() => p.mudar([...TODAS_CONDICOES])}>
          Todas
        </button>
        <button className={btnMini} onClick={() => p.mudar([])}>
          Nenhuma
        </button>
      </div>
    </fieldset>
  )
}

/** Técnico do relatório: escolhe uma conta (traz nome completo e selo) ou digita um nome. */
function Tecnico(p: {
  rotulo: string
  nome: string
  selo?: string
  tecnicos: PerfilTecnico[]
  mudar: (nome: string, selo?: string, perfil?: PerfilTecnico) => void
}) {
  const id = `tec-${p.rotulo.replace(/\W/g, '')}`
  return (
    <Campo rotulo={p.rotulo} dica={p.selo ? 'Selo de certificação vem do perfil.' : 'Sem selo: escolha uma conta com selo no perfil.'}>
      <div className="flex items-center gap-2">
        <input
          className="campo"
          list={id}
          value={p.nome}
          onChange={(e) => {
            const perfil = p.tecnicos.find((t) => t.nome === e.target.value)
            p.mudar(e.target.value, perfil?.selo ?? (perfil ? '' : p.selo), perfil)
          }}
        />
        <datalist id={id}>
          {p.tecnicos.map((t) => (
            <option key={t.nome} value={t.nome} />
          ))}
        </datalist>
        {p.selo && <img src={p.selo} alt="" className="h-9 max-w-20 shrink-0 rounded bg-white object-contain p-0.5" />}
      </div>
    </Campo>
  )
}

export function PainelRelatorio({
  r,
  atualizar,
  tecnicos = [],
  raiz,
}: {
  r: Relatorio
  atualizar: Atualizar
  tecnicos?: PerfilTecnico[]
  raiz?: FileSystemDirectoryHandle
}) {
  const set = <K extends keyof Relatorio>(k: K, v: Relatorio[K]) => atualizar((x) => ({ ...x, [k]: v }))
  const contagem: Record<string, number> = {}
  for (const e of r.equipamentos) contagem[e.condicao] = (contagem[e.condicao] ?? 0) + 1

  return (
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Usina">
          <select
            className="campo"
            value={r.usina}
            onChange={(e) => set('usina', e.target.value)}
            disabled={!r.avulso}
          >
            {USINAS_RELATORIO.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Sigla da área">
          <Texto valor={r.sigla} mudar={(v) => set('sigla', v.toUpperCase())} />
        </Campo>
        <Campo rotulo="Título da área (aparece no relatório)">
          <Texto valor={r.areaTitulo} mudar={(v) => set('areaTitulo', v)} />
        </Campo>
        <Campo rotulo="Mês de referência">
          <Texto tipo="month" valor={r.mesReferencia} mudar={(v) => v && set('mesReferencia', v)} />
        </Campo>
        <Campo rotulo="Sequência no mês (usina)">
          <Texto tipo="number" valor={String(r.sequencia)} mudar={(v) => set('sequencia', Math.max(1, Number(v) || 1))} />
        </Campo>
        <Campo
          rotulo="Código do relatório"
          dica={r.codigoManual ? 'Editado à mão.' : 'Automático: sigla + 446 + AAMM + sequência.'}
        >
          <div className="flex gap-1">
            <Texto valor={r.codigo} mudar={(v) => atualizar((x) => ({ ...x, codigo: v, codigoManual: true }))} />
            {r.codigoManual && (
              <button
                className={btnMini}
                title="Voltar ao código automático"
                onClick={() =>
                  atualizar((x) => ({ ...x, codigoManual: false, codigo: gerarCodigo(x.usina, x.sigla, x.mesReferencia, x.sequencia, x.setor, x.contrato) }))
                }
              >
                auto
              </button>
            )}
          </div>
        </Campo>
        <Campo rotulo="Data de expedição">
          <Texto tipo="date" valor={r.dataExpedicao} mudar={(v) => v && set('dataExpedicao', v)} />
        </Campo>
        <Campo rotulo="Cidade">
          <Texto valor={r.cidade} mudar={(v) => set('cidade', v)} />
        </Campo>
        <Campo rotulo="Contrato (cliente)" dica="Define o padrão do código e o modelo do Word. Vazio = Vallourec.">
          <Texto valor={r.contrato ?? ''} placeholder="Vallourec" mudar={(v) => set('contrato', v || undefined)} />
        </Campo>
        <Tecnico
          rotulo="Técnico da coleta"
          nome={r.equipe.coleta}
          selo={r.equipe.seloColeta}
          tecnicos={tecnicos}
          mudar={(nome, selo) => set('equipe', { ...r.equipe, coleta: nome, seloColeta: selo })}
        />
        <Tecnico
          rotulo="Técnico da análise"
          nome={r.equipe.analise}
          selo={r.equipe.seloAnalise}
          tecnicos={tecnicos}
          mudar={(nome, selo, perfil) =>
            atualizar((x) => ({
              ...x,
              equipe: { ...x.equipe, analise: nome, seloAnalise: selo },
              // quem analisa assina o contato do cabeçalho
              ...(perfil ? { contato: { email: perfil.email ?? '', telefone: perfil.telefone ?? '' }, } : {}),
            }))
          }
        />
        <Campo rotulo="E-mail no cabeçalho">
          <Texto valor={r.contato?.email ?? ''} mudar={(v) => set('contato', { telefone: r.contato?.telefone ?? '', email: v })} />
        </Campo>
        <Campo rotulo="Telefone no cabeçalho">
          <Texto valor={r.contato?.telefone ?? ''} mudar={(v) => set('contato', { email: r.contato?.email ?? '', telefone: v })} />
        </Campo>
        <Campo rotulo="ART (rodapé)" dica="Vazio = a ART do modelo do Word. Fica lembrada para a usina.">
          <Texto
            valor={r.art ?? ''}
            placeholder="como no modelo"
            mudar={(v) => {
              set('art', v)
              lembrarArt(r.usina, v)
            }}
          />
        </Campo>
        <div />
        <Campo rotulo="Aparelho (4.1)">
          <Texto valor={r.aparelho ?? ''} mudar={(v) => set('aparelho', v)} />
        </Campo>
        <Campo rotulo="Software (4.1)">
          <Texto valor={r.software ?? ''} mudar={(v) => set('software', v)} />
        </Campo>
        <Campo rotulo="Plataforma (4.1)" dica="Vazio = mantém a linha do modelo. Escreva “-” para tirar a linha.">
          <Texto
            valor={r.plataforma ?? ''}
            placeholder="como no modelo"
            mudar={(v) => set('plataforma', v === '' ? undefined : v.trim() === '-' ? '' : v)}
          />
        </Campo>
        <Campo rotulo="Meses no quadro de condição" dica="Inclui o mês do relatório. Os anteriores vêm do histórico.">
          <Texto
            tipo="number"
            valor={String(r.mesesNoQuadro ?? MESES_QUADRO_PADRAO)}
            mudar={(v) => set('mesesNoQuadro', Math.min(12, Math.max(1, Number(v) || 1)))}
          />
        </Campo>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={r.incluirIndicadores !== false}
          onChange={(e) => set('incluirIndicadores', e.target.checked)}
        />
        Incluir página de indicadores (execução, anomalias, reincidência e tipo de falhas)
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!r.mostrarDiagnostico} onChange={(e) => set('mostrarDiagnostico', e.target.checked)} />
        Mostrar a linha “Diagnóstico” nas páginas de anomalia (condição normal, alerta, alarme)
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!r.incluirResumo} onChange={(e) => set('incluirResumo', e.target.checked)} />
        Incluir as seções “Resumo” e “Definição da atividade”
      </label>
      {r.incluirResumo && (
        <div className="grid gap-3">
          <Campo rotulo="Resumo" dica="Vazio = texto padrão (Cadastros › Textos do relatório).">
            <TextoLongo valor={r.resumo ?? ''} placeholder={textoRelatorio(r, 'resumo')} mudar={(v) => set('resumo', v)} linhas={4} />
          </Campo>
          <Campo rotulo="Definição da atividade" dica="Vazio = texto padrão (Cadastros › Textos do relatório).">
            <TextoLongo valor={r.definicao ?? ''} placeholder={textoRelatorio(r, 'definicao')} mudar={(v) => set('definicao', v)} linhas={4} />
          </Campo>
        </div>
      )}

      <ModeloWord raiz={raiz} usina={r.usina} contrato={r.contrato || 'Vallourec'} />

      <div className="rounded-[14px] bg-nevoa p-3 text-xs leading-relaxed">
        <b>Histórico: </b>
        {r.historico ? (
          <>
            {Object.keys(r.historico.condicoes).length} de {r.equipamentos.length} equipamentos com medições anteriores · fonte: {r.historico.fonte}
          </>
        ) : (
          <span className="text-cinza">
            ainda não carregado. Com a pasta conectada ele é lido de todas as planilhas de controle da usina; no modo manual, importe várias
            planilhas de uma vez.
          </span>
        )}
      </div>

      <SeletorCondicoes
        titulo="Condições no quadro de condição"
        dica="Equipamentos com estas condições aparecem na tabela do início do relatório."
        marcadas={r.condicoesQuadro}
        padrao={PADRAO_QUADRO}
        contagem={contagem}
        mudar={(v) => set('condicoesQuadro', v)}
      />
      <SeletorCondicoes
        titulo="Condições que geram página de anomalia"
        dica="Cada equipamento com estas condições ganha uma página própria."
        marcadas={r.condicoesAnomalia}
        padrao={PADRAO_ANOMALIA}
        contagem={contagem}
        mudar={(v) => set('condicoesAnomalia', v)}
      />
    </div>
  )
}
