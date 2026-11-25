// Triagem: condição de cada equipamento (editável), "Normal" rápido e equipamentos adicionados à mão.
import { useState } from 'react'
import { CONDICOES } from '../lib/condicao'
import { TODAS_CONDICOES, type Relatorio } from '../lib/relatorio'
import { btn, btnMini } from './campos'

type Atualizar = (f: (r: Relatorio) => Relatorio) => void

export function PainelEquipamentos({ r, atualizar }: { r: Relatorio; atualizar: Atualizar }) {
  const [filtro, setFiltro] = useState<'todos' | 'anomalias'>('todos')
  const [novo, setNovo] = useState({ local: '', descricao: '', condicao: '3' })

  const mudarCondicao = (local: string, condicao: string) =>
    atualizar((x) => ({ ...x, equipamentos: x.equipamentos.map((e) => (e.local === local ? { ...e, condicao } : e)) }))

  const remover = (local: string) =>
    atualizar((x) => ({ ...x, equipamentos: x.equipamentos.filter((e) => e.local !== local) }))

  const adicionar = () => {
    const local = novo.local.trim()
    if (!local) return
    if (r.equipamentos.some((e) => e.local === local)) return alert('Esse Local de instalação já está no relatório.')
    atualizar((x) => ({
      ...x,
      equipamentos: [...x.equipamentos, { local, descricao: novo.descricao.trim(), condicao: novo.condicao, manual: true }],
    }))
    setNovo({ local: '', descricao: '', condicao: novo.condicao })
  }

  const lista = r.equipamentos.filter((e) => filtro === 'todos' || r.condicoesAnomalia.includes(e.condicao))
  const nAnom = r.equipamentos.filter((e) => r.condicoesAnomalia.includes(e.condicao)).length

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="font-semibold">{r.equipamentos.length} equipamentos</span>
        <span className="text-zinc-400">·</span>
        <span>{nAnom} com página de anomalia</span>
        <select className="ml-auto rounded border px-1 py-0.5" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
          <option value="todos">Mostrar todos</option>
          <option value="anomalias">Só os que geram anomalia</option>
        </select>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-zinc-100 text-left">
            <th className="p-1">Local de instalação</th>
            <th className="p-1">Descrição</th>
            <th className="p-1">Condição</th>
            <th className="p-1" />
          </tr>
        </thead>
        <tbody>
          {lista.map((e) => {
            const k = CONDICOES[e.condicao] ?? CONDICOES.X
            const alterada = e.condicaoPlanilha !== undefined && e.condicaoPlanilha !== e.condicao
            return (
              <tr key={e.local} className="border-b align-middle">
                <td className="p-1 font-mono whitespace-nowrap">
                  {e.local}
                  {e.manual && <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] text-blue-800">manual</span>}
                </td>
                <td className="p-1">{e.descricao}</td>
                <td className="p-1">
                  <select
                    className="rounded border px-1 py-0.5"
                    style={{ background: k.cor, color: k.texto }}
                    value={e.condicao}
                    onChange={(ev) => mudarCondicao(e.local, ev.target.value)}
                    title={k.nome}
                  >
                    {TODAS_CONDICOES.map((c) => (
                      <option key={c} value={c} style={{ background: '#fff', color: '#000' }}>
                        {c} – {CONDICOES[c].nome}
                      </option>
                    ))}
                  </select>
                  {alterada && (
                    <span className="ml-1 text-[10px] text-amber-700" title={`Na planilha: ${e.condicaoPlanilha}`}>
                      (planilha: {e.condicaoPlanilha})
                    </span>
                  )}
                </td>
                <td className="p-1 text-right whitespace-nowrap">
                  {e.condicao !== '1' && (
                    <button className={btnMini} onClick={() => mudarCondicao(e.local, '1')}>
                      Normal
                    </button>
                  )}
                  {alterada && (
                    <button className={btnMini + ' ml-1'} onClick={() => mudarCondicao(e.local, e.condicaoPlanilha!)}>
                      desfazer
                    </button>
                  )}
                  {e.manual && (
                    <button className={btnMini + ' ml-1'} onClick={() => remover(e.local)}>
                      remover
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <fieldset className="mt-4 rounded border border-zinc-200 p-2">
        <legend className="px-1 text-xs font-semibold">Adicionar equipamento fora da planilha</legend>
        <div className="flex flex-wrap gap-2">
          <input
            className="min-w-48 flex-1 rounded border px-2 py-1 font-mono text-sm"
            placeholder="Local de instalação (TAG)"
            value={novo.local}
            onChange={(e) => setNovo({ ...novo, local: e.target.value })}
          />
          <input
            className="min-w-48 flex-1 rounded border px-2 py-1 text-sm"
            placeholder="Descrição"
            value={novo.descricao}
            onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
          />
          <select className="rounded border px-1 py-1 text-sm" value={novo.condicao} onChange={(e) => setNovo({ ...novo, condicao: e.target.value })}>
            {TODAS_CONDICOES.map((c) => (
              <option key={c} value={c}>
                {c} – {CONDICOES[c].nome}
              </option>
            ))}
          </select>
          <button className={btn} onClick={adicionar} disabled={!novo.local.trim()}>
            Adicionar
          </button>
        </div>
      </fieldset>
    </div>
  )
}
