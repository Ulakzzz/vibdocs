// Cálculo GUT da anomalia (uso interno) e os lembretes que ele gera.
import { CONDICOES, severidade } from '../lib/condicao'
import { calcularGut, CRITICIDADE, DICA_NOTA, gutPadrao, lembretes, MODOS_FALHA, type Criticidade, type Gut } from '../lib/gut'
import type { Anomalia, EquipRel, Relatorio } from '../lib/relatorio'
import { Contador } from '../ui/Contador'
import { Seletor } from '../ui/Seletor'

/** Cinco bolinhas 1–5 com um marcador que escorrega até a escolhida (ideia "gooey radio"). */
function Notas({ valor, mudar, rotulo, dica }: { valor: number; mudar: (n: number) => void; rotulo: string; dica: string }) {
  return (
    <div className="gut-linha">
      <span className="gut-rotulo" title={dica}>
        {rotulo}
      </span>
      <div className="gut-notas" role="radiogroup" aria-label={rotulo} style={{ ['--pos' as string]: valor - 1 }}>
        <span className="gut-marcador" aria-hidden />
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={valor === n} onClick={() => mudar(n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

export function PainelGut({ r, e, a, mudar }: { r: Relatorio; e: EquipRel; a: Anomalia; mudar: (f: (a: Anomalia) => Anomalia) => void }) {
  const g = a.gut ?? gutPadrao()
  const set = (p: Partial<Gut>) => mudar((an) => ({ ...an, gut: { ...(an.gut ?? gutPadrao()), ...p } }))
  const res = calcularGut(g)
  const atual = severidade(e.condicao)
  const diverge = !!g.modo && atual && atual !== res.situacao
  const avisos = lembretes(r, a, e.condicao)
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <section className="gut">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="titulo text-base">Priorização GUT</h3>
        <span className="text-xs text-cinza">uso interno, não sai no relatório</span>
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
              opcoes={[{ valor: '', rotulo: 'Escolha…' }, ...MODOS_FALHA.map((m) => ({ valor: m, rotulo: m }))]}
            />
          </div>
          <Notas rotulo="G" dica={DICA_NOTA.g} valor={g.g} mudar={(n) => set({ g: n })} />
          <Notas rotulo="U" dica={DICA_NOTA.u} valor={g.u} mudar={(n) => set({ u: n })} />
          <Notas rotulo="T" dica={DICA_NOTA.t} valor={g.t} mudar={(n) => set({ t: n })} />
          <div className="gut-linha">
            <span className="gut-rotulo" title="Fator de correção pela criticidade SAP do equipamento">
              Crit.
            </span>
            <div className="gut-crit" role="radiogroup" aria-label="Criticidade SAP">
              {(Object.keys(CRITICIDADE) as Criticidade[]).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={g.criticidade === c} onClick={() => set({ criticidade: c })}>
                  {c}
                  <small>×{CRITICIDADE[c].toLocaleString('pt-BR')}</small>
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
            {g.g}×{g.u}×{g.t} = {res.bruto} × {CRITICIDADE[g.criticidade].toLocaleString('pt-BR')}
          </span>
          <span className="mt-2 font-semibold">{res.prioridade}</span>
          <span className="text-xs">{res.prazoDias ? `Laudo vence em ${res.prazoDias} dias` : 'Monitoramento'}</span>
          <span className="text-xs">Situação: {res.situacao}</span>
        </div>
      </div>
      {diverge && (
        <p className="mt-3 rounded-[10px] border border-dashed border-sinal px-3 py-2 text-xs">
          O GUT indica <b>{res.situacao}</b>, mas a condição marcada é <b>{CONDICOES[e.condicao]?.nome}</b>. Confira antes de emitir.
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
