// Triagem: condição de cada equipamento (editável), "Normal" rápido, mapa de condição dos meses
// anteriores e equipamentos adicionados à mão.
import { useState } from 'react'
import { CONDICOES } from '../lib/condicao'
import { mesCurto } from '../lib/historico'
import { TODAS_CONDICOES, type EquipRel, type Relatorio } from '../lib/relatorio'
import { Abas, btn, btnMini } from './campos'

type Atualizar = (f: (r: Relatorio) => Relatorio) => void

/** Quadradinhos com a condição das últimas medições (mais antiga à esquerda). */
function MapaCondicao({ r, e }: { r: Relatorio; e: EquipRel }) {
  const meses = Object.entries(r.historico?.condicoes[e.local] ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
  const vazios = 6 - meses.length
  return (
    <span className="mapa" aria-label="Condição nas medições anteriores">
      {Array.from({ length: vazios }, (_, i) => (
        <span key={`v${i}`} className="vazio" />
      ))}
      {meses.map(([m, c]) => {
        const k = CONDICOES[c] ?? CONDICOES.X
        return <span key={m} style={{ background: k.cor }} title={`${mesCurto(m)}: ${c} – ${k.nome}`} />
      })}
    </span>
  )
}

/** Seletor de condição com aparência de etiqueta colorida. */
function SeletorCondicao({ valor, mudar }: { valor: string; mudar: (c: string) => void }) {
  const k = CONDICOES[valor] ?? CONDICOES.X
  return (
    <label className="seletor-chip" style={{ background: k.cor, color: k.texto }} title={`${valor} – ${k.nome}`}>
      <span className="font-semibold">{valor || '–'}</span>
      <span className="hidden truncate xl:inline">{k.nome}</span>
      <span aria-hidden className="opacity-60">▾</span>
      <select value={valor} onChange={(ev) => mudar(ev.target.value)} aria-label="Condição">
        {TODAS_CONDICOES.map((c) => (
          <option key={c} value={c}>
            {c} – {CONDICOES[c].nome}
          </option>
        ))}
      </select>
    </label>
  )
}

export function PainelEquipamentos({ r, atualizar }: { r: Relatorio; atualizar: Atualizar }) {
  const [filtro, setFiltro] = useState<'todos' | 'anomalias'>('todos')
  const [novo, setNovo] = useState({ local: '', descricao: '', condicao: '3' })

  const mudarCondicao = (local: string, condicao: string) =>
    atualizar((x) => ({ ...x, equipamentos: x.equipamentos.map((e) => (e.local === local ? { ...e, condicao } : e)) }))

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
  const lista = r.equipamentos.filter((e) => filtro === 'todos' || r.condicoesAnomalia.includes(e.condicao))

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Abas
          ativa={filtro}
          mudar={setFiltro}
          itens={[
            ['todos', `Todos ${r.equipamentos.length}`],
            ['anomalias', `Geram anomalia ${nAnom}`],
          ]}
        />
        <p className="text-xs text-cinza">Marque como Normal o que não precisa de página. A condição original da planilha fica guardada.</p>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-linha text-left text-xs text-cinza">
            <th className="py-2 pr-2 pl-3 font-medium">Local de instalação</th>
            <th className="py-2 pr-2 font-medium">Descrição</th>
            <th className="py-2 pr-2 font-medium" title="Últimas medições">
              Histórico
            </th>
            <th className="py-2 pr-2 font-medium">Condição</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {lista.map((e) => {
            const alterada = e.condicaoPlanilha !== undefined && e.condicaoPlanilha !== e.condicao
            return (
              <tr key={e.local} className="linha-viva acoes-no-hover border-b border-linha/70 align-middle">
                <td className="py-2 pr-2 pl-3 whitespace-nowrap">
                  <span className="tag">{e.local}</span>
                  {e.manual && <span className="ml-1.5 rounded-full bg-sinal-claro px-1.5 text-[11px]">manual</span>}
                </td>
                <td className="max-w-56 truncate py-2 pr-2 text-grafite" title={e.descricao}>
                  {e.descricao}
                </td>
                <td className="py-2 pr-2">
                  <MapaCondicao r={r} e={e} />
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
