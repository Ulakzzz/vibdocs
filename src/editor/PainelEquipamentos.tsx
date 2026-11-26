// Triagem: condição de cada equipamento (editável), "Normal" rápido, mapa de condição dos meses
// anteriores e equipamentos adicionados à mão.
import { Fragment, useState } from 'react'
import { CONDICOES } from '../lib/condicao'
import { mesCurto } from '../lib/historico'
import { condicaoNoMes, reincidenciaAuto, TODAS_CONDICOES, type EquipRel, type Relatorio } from '../lib/relatorio'
import { Abas, btn, btnMini } from './campos'

type Atualizar = (f: (r: Relatorio) => Relatorio) => void

const ANOMALIA = ['2', '3', '4']
const LETRAS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const CHAVE_MESES = 'vibdocs.mesesHistorico'

/** Os n meses de calendário que terminam no mês do relatório (mais antigo primeiro). */
function ultimosMeses(mesRef: string, n: number) {
  const [a, m] = mesRef.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(a, m - 1 - (n - 1 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

/** Linha do tempo (B3): um ponto por mês; no mês do relatório, pré-alerta, alerta e alarme pulsam na sua cor. */
function LinhaHistorico(p: { r: Relatorio; e: EquipRel; meses: string[]; aberto: boolean; alternar: () => void }) {
  const { r, e, meses } = p
  return (
    <button
      type="button"
      className={`hist ${p.aberto ? 'aberto' : ''}`}
      onClick={p.alternar}
      aria-expanded={p.aberto}
      aria-label={`Histórico de ${e.local}: ver detalhes`}
    >
      {meses.map((m) => {
        const c = condicaoNoMes(r, e, m)
        const k = CONDICOES[c]
        const agora = m === r.mesReferencia
        if (!c || !k) return <i key={m} className={`sem ${agora ? 'agora' : ''}`} title={`${mesCurto(m)}: sem medição`} />
        const estilo = { background: k.cor, '--c': k.cor } as React.CSSProperties
        return (
          <i
            key={m}
            className={`${agora ? 'agora' : ''} ${agora && ANOMALIA.includes(c) ? 'pulsa' : ''}`}
            style={estilo}
            title={`${mesCurto(m)}: ${c} – ${k.nome}`}
          />
        )
      })}
    </button>
  )
}

/** Detalhe (B4): a área inteira mês a mês, um ponto por equipamento, com o equipamento escolhido em destaque. */
function DetalheHistorico({ r, e, meses }: { r: Relatorio; e: EquipRel; meses: string[] }) {
  const reinc = reincidenciaAuto(r, e)
  const colunas = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(r.equipamentos.length * 1.6))))
  return (
    <div className="hist-detalhe">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="tag text-white">{e.local}</span>
        <span className="text-white/60">{e.descricao}</span>
        <span className="ml-auto text-xs text-white/60">
          {reinc ? (
            <>
              Reincidente desde <b className="text-white">{reinc}</b>
            </>
          ) : (
            'Sem reincidência'
          )}
        </span>
      </div>
      <div className="hist-matriz">
        {meses.map((m) => {
          const c = condicaoNoMes(r, e, m)
          const k = CONDICOES[c]
          return (
            <div key={m} className="mes">
              <div className="pontos-mes" style={{ gridTemplateColumns: `repeat(${colunas}, 9px)` }}>
                {r.equipamentos.map((x) => {
                  const cx = condicaoNoMes(r, x, m)
                  const kx = CONDICOES[cx]
                  const tipo = ANOMALIA.includes(cx) ? 'anom' : cx === '1' ? 'normal' : cx ? 'outra' : 'sem'
                  return (
                    <i
                      key={x.local}
                      className={`${tipo} ${x.local === e.local ? 'eu' : ''}`}
                      style={ANOMALIA.includes(cx) ? { background: kx?.cor } : undefined}
                      title={`${x.local}: ${cx ? `${cx} – ${kx?.nome}` : 'sem medição'}`}
                    />
                  )
                })}
              </div>
              <small>{mesCurto(m)}</small>
              <span className="cond" style={k ? { background: k.cor, color: k.texto } : undefined}>
                {c ? `${c} · ${k?.nome ?? ''}` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Seletor de condição com aparência de etiqueta colorida. */
function SeletorCondicao({ valor, mudar }: { valor: string; mudar: (c: string) => void }) {
  // sem condição = medido (executado) mas ainda não analisado
  const k = CONDICOES[valor] ?? { nome: 'A analisar', cor: 'transparent', texto: 'currentColor' }
  return (
    <label className={`seletor-chip ${valor ? '' : 'a-analisar'}`} style={{ background: k.cor, color: k.texto }} title={`${valor || '–'} – ${k.nome}`}>
      <span className="font-semibold">{valor || '?'}</span>
      <span className="hidden truncate xl:inline">{k.nome}</span>
      <span aria-hidden className="opacity-60">▾</span>
      <select value={valor} onChange={(ev) => mudar(ev.target.value)} aria-label="Condição">
        {!valor && <option value="">? – A analisar</option>}
        {TODAS_CONDICOES.map((c) => (
          <option key={c} value={c}>
            {c} – {CONDICOES[c].nome}
          </option>
        ))}
      </select>
    </label>
  )
}

export function PainelEquipamentos({
  r,
  atualizar,
  aoMudarCondicao,
}: {
  r: Relatorio
  atualizar: Atualizar
  /** chamado quando o técnico muda a condição (o app grava na planilha de controle) */
  aoMudarCondicao?: (e: EquipRel, condicao: string) => void
}) {
  // planilhas novas têm a coluna "Execução": por padrão a lista mostra só os executados
  const temExecucao = r.equipamentos.some((e) => e.executado)
  const [filtro, setFiltro] = useState<'executados' | 'todos' | 'anomalias'>(temExecucao ? 'executados' : 'todos')
  const [novo, setNovo] = useState({ local: '', descricao: '', condicao: '3' })
  const [nMeses, setNMeses] = useState(() => Number(localStorage.getItem(CHAVE_MESES)) || 6)
  const [aberto, setAberto] = useState<string>()
  const meses = ultimosMeses(r.mesReferencia, nMeses)
  const mudarMeses = (d: number) => {
    const n = Math.min(12, Math.max(2, nMeses + d))
    setNMeses(n)
    localStorage.setItem(CHAVE_MESES, String(n))
  }

  const mudarCondicao = (local: string, condicao: string) => {
    const e = r.equipamentos.find((x) => x.local === local)
    atualizar((x) => ({ ...x, equipamentos: x.equipamentos.map((q) => (q.local === local ? { ...q, condicao } : q)) }))
    if (e && e.condicao !== condicao) aoMudarCondicao?.(e, condicao)
  }

  const remover = (local: string) => atualizar((x) => ({ ...x, equipamentos: x.equipamentos.filter((e) => e.local !== local) }))

  const adicionar = () => {
    const local = novo.local.trim()
    if (!local) return
    if (r.equipamentos.some((e) => e.local === local)) return alert('Esse Local de instalação já está no relatório.')
    atualizar((x) => ({
      ...x,
      equipamentos: [...x.equipamentos, { local, descricao: novo.descricao.trim(), condicao: novo.condicao, manual: true, executado: true }],
    }))
    setNovo({ local: '', descricao: '', condicao: novo.condicao })
  }

  const nAnom = r.equipamentos.filter((e) => r.condicoesAnomalia.includes(e.condicao)).length
  const nExec = r.equipamentos.filter((e) => e.executado).length
  const nAnalisar = r.equipamentos.filter((e) => e.executado && !e.condicao).length
  const lista = r.equipamentos.filter((e) =>
    filtro === 'todos' ? true : filtro === 'executados' ? e.executado : r.condicoesAnomalia.includes(e.condicao),
  )

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Abas
          ativa={filtro}
          mudar={setFiltro}
          itens={
            [
              ...(temExecucao ? [['executados', `Executados ${nExec}`]] : []),
              ['todos', `Todos ${r.equipamentos.length}`],
              ['anomalias', `Geram anomalia ${nAnom}`],
            ] as ['executados' | 'todos' | 'anomalias', string][]
          }
        />
        <p className="min-w-0 flex-1 text-xs text-cinza">
          {nAnalisar > 0 && (
            <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-sinal px-2 py-0.5 font-semibold text-preto">
              {nAnalisar} a analisar
            </span>
          )}
          Defina a condição depois da análise: ela é gravada na planilha de controle.
        </p>
        <div className="passo-meses" role="group" aria-label="Meses no histórico">
          <button type="button" onClick={() => mudarMeses(-1)} disabled={nMeses <= 2} aria-label="Menos meses">
            −
          </button>
          <span>{nMeses} meses</span>
          <button type="button" onClick={() => mudarMeses(1)} disabled={nMeses >= 12} aria-label="Mais meses">
            +
          </button>
        </div>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-linha text-left text-xs text-cinza">
            <th className="py-2 pr-2 pl-3 font-medium">Local de instalação</th>
            <th className="py-2 pr-2 font-medium">Descrição</th>
            <th className="py-2 pr-2 font-medium" title="Meses anteriores (clique no histórico para ver a área mês a mês)">
              <span className="hist-meses" aria-hidden>
                {meses.map((m) => (
                  <i key={m} className={m === r.mesReferencia ? 'agora' : ''} title={mesCurto(m)}>
                    {LETRAS[Number(m.slice(5)) - 1]}
                  </i>
                ))}
              </span>
              <span className="sr-only">Histórico</span>
            </th>
            <th className="py-2 pr-2 font-medium">Condição</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {lista.map((e) => {
            const alterada = e.condicaoPlanilha !== undefined && e.condicaoPlanilha !== e.condicao
            return (
              <Fragment key={e.local}>
              <tr className="linha-viva acoes-no-hover border-b border-linha/70 align-middle">
                <td className="py-2 pr-2 pl-3 whitespace-nowrap">
                  <span className="tag">{e.local}</span>
                  {e.manual && <span className="ml-1.5 rounded-full bg-sinal px-1.5 text-[11px] font-semibold text-preto">manual</span>}
                </td>
                <td className="max-w-56 truncate py-2 pr-2 text-grafite" title={e.descricao}>
                  {e.descricao}
                </td>
                <td className="py-2 pr-2">
                  <LinhaHistorico
                    r={r}
                    e={e}
                    meses={meses}
                    aberto={aberto === e.local}
                    alternar={() => setAberto(aberto === e.local ? undefined : e.local)}
                  />
                </td>
                <td className="py-2 pr-2 whitespace-nowrap">
                  <SeletorCondicao valor={e.condicao} mudar={(c) => mudarCondicao(e.local, c)} />
                  {alterada && (
                    <span className="ml-1.5 text-[11px] text-amber-700" title="Condição na planilha de controle">
                      planilha {e.condicaoPlanilha}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">
                  <span className="acoes">
                    {e.condicao !== '1' && (
                      <button className={btnMini} onClick={() => mudarCondicao(e.local, '1')}>
                        Normal
                      </button>
                    )}
                    {alterada && (
                      <button className={`${btnMini} ml-1`} onClick={() => mudarCondicao(e.local, e.condicaoPlanilha!)}>
                        Desfazer
                      </button>
                    )}
                    {e.manual && (
                      <button className={`${btnMini} ml-1`} onClick={() => remover(e.local)}>
                        Remover
                      </button>
                    )}
                  </span>
                </td>
              </tr>
              {aberto === e.local && (
                <tr className="border-b border-linha/70">
                  <td colSpan={5} className="py-2 pr-2 pl-3">
                    <DetalheHistorico r={r} e={e} meses={meses} />
                  </td>
                </tr>
              )}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      <section className="mt-6 rounded-[14px] border border-dashed border-[#cfcfca] p-4">
        <h3 className="text-sm font-semibold">Adicionar equipamento fora da planilha</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="campo tag min-w-48 flex-1"
            placeholder="Local de instalação (TAG)"
            value={novo.local}
            onChange={(e) => setNovo({ ...novo, local: e.target.value })}
          />
          <input
            className="campo min-w-48 flex-1"
            placeholder="Descrição"
            value={novo.descricao}
            onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
          />
          <SeletorCondicao valor={novo.condicao} mudar={(c) => setNovo({ ...novo, condicao: c })} />
          <button className={btn} onClick={adicionar} disabled={!novo.local.trim()}>
            Adicionar
          </button>
        </div>
      </section>
    </div>
  )
}
