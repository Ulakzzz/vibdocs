// Cálculo GUT da anomalia (uso interno) e os lembretes que ele gera.
import { CONDICOES, severidade } from '../lib/condicao'
import { calcularGut, CRITICIDADE, DICA_NOTA, gutPadrao, lembretes, MODOS_FALHA, type Criticidade, type Gut } from '../lib/gut'
import type { Anomalia, EquipRel, Relatorio } from '../lib/relatorio'
import { Contador } from '../ui/Contador'
import { Seletor } from '../ui/Seletor'
import { useConfig } from '../lib/config'
import { criterioDoModo, type CriteriosGut } from '../lib/gutCriterios'

/** Notas 1–5 (ou até 6, se o critério tiver) com marcador que escorrega; embaixo, o significado da nota escolhida. */
function Notas({
  valor,
  mudar,
  rotulo,
  dica,
  descricoes,
}: {
  valor: number
  mudar: (n: number) => void
  rotulo: string
  dica: string
  descricoes?: Record<string, string>
}) {
  const max = Math.max(5, ...Object.keys(descricoes ?? {}).map(Number))
  return (
    <div className="gut-bloco">
      <div className="gut-linha">
        <span className="gut-rotulo" title={dica}>
          {rotulo}
        </span>
        <div className="gut-notas" role="radiogroup" aria-label={rotulo} style={{ ['--pos' as string]: valor - 1 }}>
          <span className="gut-marcador" aria-hidden />
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={valor === n} title={descricoes?.[n] ?? ''} onClick={() => mudar(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      {descricoes?.[valor] && <p className="gut-desc">{descricoes[valor]}</p>}
    </div>
  )
}

const CONDICAO_DA_SITUACAO = { Alarme: '4', Alerta: '3', 'Pré-alerta': '2' } as const

export function PainelGut({
  r,
  e,
  a,
  mudar,
  mudarCondicao,
}: {
  r: Relatorio
  e: EquipRel
  a: Anomalia
  mudar: (f: (a: Anomalia) => Anomalia) => void
  /** o resultado do GUT vira a condição do equipamento (e vai para a planilha de controle) */
  mudarCondicao?: (c: string) => void
}) {
  const criterios = useConfig<CriteriosGut>('gut-criterios')
  const g = a.gut ?? gutPadrao()
  const criterio = criterioDoModo(g.modo, criterios)
  const fatores = criterios?.fatores ?? CRITICIDADE
  const set = (p: Partial<Gut>) => {
    const novo = { ...g, ...p }
    mudar((an) => ({ ...an, gut: { ...(an.gut ?? gutPadrao()), ...p } }))
    if (novo.modo) {
      const c = CONDICAO_DA_SITUACAO[calcularGut(novo, criterios).situacao]
      if (c !== e.condicao) mudarCondicao?.(c)
    }
  }
  const res = calcularGut(g, criterios)
  const atual = severidade(e.condicao)
  const diverge = !!g.modo && atual && atual !== res.situacao

  if (!a.gut)
    return (
      <section className="gut gut-vazio">
        <div>
          <h3 className="titulo text-base">Priorização GUT</h3>
          <p className="text-xs text-cinza">Sem GUT nesta anomalia. Ao calcular, o resultado define a condição (pré-alerta, alerta ou alarme).</p>
        </div>
        <button type="button" className="bt bt-sec" onClick={() => mudar((an) => ({ ...an, gut: gutPadrao() }))}>
          Calcular GUT
        </button>
      </section>
    )
  const avisos = lembretes(r, a, e.condicao, criterios)
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <section className="gut">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="titulo text-base">Priorização GUT</h3>
        <span className="flex items-center gap-3 text-xs text-cinza">
          define a condição e a conclusão desejada
          <button type="button" className="bt bt-fantasma bt-mini" onClick={() => mudar((an) => ({ ...an, gut: undefined }))}>
            Remover GUT
          </button>
        </span>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[17rem] flex-1 space-y-2.5">
          <div className="gut-linha">
            <span className="gut-rotulo">Modo de falha</span>
            <Seletor
              classe="seletor-campo"
              rotulo="Modo de falha"
              valor={g.modo}
              mudar={(modo) => set({ modo })}
              opcoes={[
                { valor: '', rotulo: 'Escolha…' },
                ...(criterios?.modos.length ? criterios.modos.map((m) => m.nome) : [...MODOS_FALHA]).map((m) => ({ valor: m, rotulo: m })),
              ]}
            />
          </div>
          <Notas rotulo="G" dica={DICA_NOTA.g} valor={g.g} descricoes={criterio?.G} mudar={(n) => set({ g: n })} />
          <Notas rotulo="U" dica={DICA_NOTA.u} valor={g.u} descricoes={criterio?.U} mudar={(n) => set({ u: n })} />
          <Notas rotulo="T" dica={DICA_NOTA.t} valor={g.t} descricoes={criterio?.T} mudar={(n) => set({ t: n })} />
          <div className="gut-linha">
            <span className="gut-rotulo" title="Fator de correção pela criticidade SAP do equipamento">
              Crit.
            </span>
            <div className="gut-crit" role="radiogroup" aria-label="Criticidade SAP">
              {(Object.keys(fatores) as Criticidade[]).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={g.criticidade === c} onClick={() => set({ criticidade: c })}>
                  {c}
                  <small>×{fatores[c].toLocaleString('pt-BR')}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={`gut-resultado faixa-${res.situacao === 'Alarme' ? 'alarme' : res.situacao === 'Alerta' ? 'alerta' : 'pre'}`}>
          <small>GUT</small>
          <b className="titulo-grande">
            <Contador valor={res.valor} casas={Number.isInteger(res.valor) ? 0 : 1} />
          </b>
          <span className="text-xs opacity-75">
            {g.g}×{g.u}×{g.t} = {res.bruto} × {(fatores[g.criticidade] ?? 1).toLocaleString('pt-BR')}
          </span>
          <span className="mt-2 font-semibold">{res.prioridade}</span>
          <span className="text-xs">{res.prazoDias ? `Laudo vence em ${res.prazoDias} dias` : 'Monitoramento'}</span>
          <span className="text-xs">Situação: {res.situacao}</span>
        </div>
      </div>
      {criterio ? (
        <details className="gut-tabela">
          <summary>Ver todos os critérios de “{criterio.nome}”</summary>
          <table>
            <thead>
              <tr>
                <th>Nota</th>
                <th>G · Gravidade</th>
                <th>U · Urgência</th>
                <th>T · Tendência</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.max(...[criterio.G, criterio.U, criterio.T].flatMap((x) => Object.keys(x).map(Number))) }, (_, i) => String(i + 1)).map((n) => (
                <tr key={n}>
                  <td>{n}</td>
                  {(['G', 'U', 'T'] as const).map((k) => (
                    <td key={k} className={String(g[k.toLowerCase() as 'g' | 'u' | 't']) === n ? 'escolhida' : ''}>
                      {criterio[k][n] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : (
        g.modo && (
          <p className="mt-2 text-xs text-cinza">
            {criterios ? 'Este modo não tem critérios na planilha do GUT.' : 'Critérios do GUT ainda não importados: o administrador importa a planilha em Cadastros.'}
          </p>
        )
      )}
      {diverge && (
        <p className="mt-3 rounded-[10px] border border-dashed border-sinal px-3 py-2 text-xs">
          O GUT indica <b>{res.situacao}</b>, mas a condição marcada é <b>{CONDICOES[e.condicao]?.nome ?? 'a analisar'}</b>. Mude qualquer
          nota para aplicar o GUT, ou mantenha a condição escolhida.
        </p>
      )}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold">
          Lembretes
          <span className="rounded-full bg-sinal px-2 py-0.5 text-[10px] text-preto">aviso no celular em breve</span>
        </div>
        {avisos.length ? (
          <ul className="space-y-1.5 text-sm">
            {avisos.map((l) => (
              <li key={l.tipo} className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${l.tipo === 'enviar' ? 'bg-red-500' : 'bg-sinal'}`} />
                <b>{fmt(l.quando)}</b>
                <span className="text-cinza">{l.texto}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-cinza">Escolha o modo de falha para gerar a data de nova análise.</p>
        )}
      </div>
    </section>
  )
}
