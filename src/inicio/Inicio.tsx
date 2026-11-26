// Página inicial depois do login: escolha da usina, rascunhos recentes, calendário do mês e atalhos.
import { useEffect, useState } from 'react'
import { mesesDisponiveis, USINAS, type Usina } from '../lib/controle'
import { mesCurto } from '../lib/historico'
import { rascunhosRecentes, resumoUsina } from '../lib/rascunho'
import { hojeISO, type Relatorio } from '../lib/relatorio'
import { btnFantasma } from '../editor/campos'

const DESCRICAO: Record<string, string> = {
  Barreiro: 'Laminação, aciaria e utilidades. Código SIGLA-446V.',
  Jeceaba: 'Rotas por TAG e posições. Código por área (ex.: UPS).',
  Mineração: 'Áreas identificadas só pela sigla. Código VMN-446M.',
}

interface Resumo {
  ultimoMes?: string
  rascunhos: number
  emitidos: number
}

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

/** Calendário do mês com os dias em que houve rascunho salvo ou data de expedição. */
function Calendario({ recentes }: { recentes: Relatorio[] }) {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()
  const primeiro = new Date(ano, mes, 1).getDay()
  const dias = new Date(ano, mes + 1, 0).getDate()
  const marcados = new Map<number, string[]>()
  for (const r of recentes) {
    for (const iso of [r.dataExpedicao, r.atualizadoEm?.slice(0, 10)]) {
      if (!iso) continue
      const [a, m, d] = iso.split('-').map(Number)
      if (a === ano && m === mes + 1) marcados.set(d, [...new Set([...(marcados.get(d) ?? []), r.codigo])])
    }
  }
  const nomeMes = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return (
    <section className="cartao-inicio surgir-lista" style={{ ['--i' as string]: 5 }}>
      <div className="flex items-baseline justify-between">
        <h2 className="titulo text-lg first-letter:uppercase">{nomeMes}</h2>
        <span className="text-xs text-cinza">avisos em breve</span>
      </div>
      <div className="calendario mt-3" role="grid" aria-label={`Calendário de ${nomeMes}`}>
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <span key={`c${i}`} className="cab">
            {d}
          </span>
        ))}
        {Array.from({ length: primeiro }, (_, i) => (
          <span key={`v${i}`} />
        ))}
        {Array.from({ length: dias }, (_, i) => {
          const d = i + 1
          const m = marcados.get(d)
          return (
            <span key={d} className={`dia ${d === hoje.getDate() ? 'hoje' : ''} ${m ? 'marcado' : ''}`} title={m?.join(', ')}>
              {d}
            </span>
          )
        })}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-cinza">
        Os pontos marcam dias com rascunho salvo ou data de expedição. Lembretes de relatório pendente virão aqui e no celular.
      </p>
    </section>
  )
}

export function Inicio(p: {
  nome: string
  raiz?: FileSystemDirectoryHandle
  fonte: string
  abrirUsina: (u: string) => void
  continuar: (r: Relatorio) => void
  avulso: (usina: string) => void
}) {
  const [resumos, setResumos] = useState<Record<string, Resumo>>({})
  const [recentes, setRecentes] = useState<Relatorio[]>()
  const mesRef = hojeISO().slice(0, 7)

  useEffect(() => {
    rascunhosRecentes(6).then(setRecentes).catch(() => setRecentes([]))
  }, [])

  useEffect(() => {
    if (!p.raiz) return
    let vivo = true
    for (const u of USINAS) {
      Promise.all([mesesDisponiveis(p.raiz, u as Usina).catch(() => ({}) as Record<string, string[]>), resumoUsina(p.raiz, u, mesRef)]).then(
        ([meses, r]) => {
          const anos = Object.keys(meses).sort()
          const ano = anos.at(-1)
          const ultimoMes = ano ? `${meses[ano].at(-1)!.slice(3)} ${ano}` : undefined
          if (vivo) setResumos((x) => ({ ...x, [u]: { ultimoMes, ...r } }))
        },
      )
    }
    return () => {
      vivo = false
    }
  }, [p.raiz, mesRef])

  const primeiroNome = p.nome.split(' ')[0]
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="inicio mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
      <header className="surgir-lista" style={{ ['--i' as string]: 0 }}>
        <p className="text-sm text-cinza first-letter:uppercase">{hoje}</p>
        <h1 className="titulo-grande mt-1 text-4xl leading-tight lg:text-5xl">
          {saudacao()}, {primeiroNome}.
        </h1>
        <p className="mt-2 text-grafite">Qual usina você vai analisar hoje?</p>
      </header>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {USINAS.map((u, i) => {
          const r = resumos[u]
          return (
            <button key={u} className="cartao-usina surgir-lista text-left" style={{ ['--i' as string]: i + 1 }} onClick={() => p.abrirUsina(u)}>
              <span className="malha-cartao" aria-hidden />
              <span className="relative flex items-start justify-between gap-3">
                <span>
                  <span className="titulo block text-2xl">{u}</span>
                  <span className="mt-1 block text-sm text-cinza">{DESCRICAO[u]}</span>
                </span>
                <span className="seta-cartao" aria-hidden>
                  →
                </span>
              </span>
              {p.raiz ? (
                <span className="relative mt-6 grid grid-cols-3 gap-2 text-sm">
                  <span>
                    <b className="titulo-grande block text-2xl">{r ? r.rascunhos : '…'}</b>
                    <span className="text-xs text-cinza">áreas em rascunho</span>
                  </span>
                  <span>
                    <b className="titulo-grande block text-2xl">{r ? r.emitidos : '…'}</b>
                    <span className="text-xs text-cinza">emitidos no mês</span>
                  </span>
                  <span>
                    <b className="block pt-1.5 text-sm font-semibold">{r?.ultimoMes ?? '…'}</b>
                    <span className="text-xs text-cinza">planilha mais recente</span>
                  </span>
                </span>
              ) : (
                <span className="relative mt-6 block text-xs text-cinza">Dados: {p.fonte}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="cartao-inicio surgir-lista" style={{ ['--i' as string]: 4 }}>
          <div className="flex items-baseline justify-between">
            <h2 className="titulo text-lg">Continuar de onde parou</h2>
            <span className="text-xs text-cinza">neste navegador</span>
          </div>
          {recentes === undefined ? (
            <p className="mt-4 text-sm text-cinza">Carregando…</p>
          ) : recentes.length === 0 ? (
            <p className="mt-4 text-sm text-cinza">Nenhum rascunho ainda. Escolha uma usina acima para começar.</p>
          ) : (
            <ul className="mt-3 divide-y divide-linha">
              {recentes.map((r) => (
                <li key={`${r.usina}/${r.mesReferencia}/${r.sigla}/${r.codigo}`}>
                  <button className="linha-recente" onClick={() => p.continuar(r)}>
                    <span className="tag">{r.codigo}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {r.usina} · {r.areaTitulo || r.sigla} · {mesCurto(r.mesReferencia)}
                      {r.avulso && <span className="ml-1.5 rounded-full bg-sinal-claro px-1.5 text-[11px] text-preto">avulso</span>}
                    </span>
                    <span className="text-xs text-cinza">
                      {new Date(r.atualizadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span aria-hidden className="seta-linha">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-linha pt-4">
            <button className={btnFantasma} onClick={() => p.avulso('Florestal')}>
              Relatório avulso (Florestal ou outra área)
            </button>
          </div>
        </section>
        <Calendario recentes={recentes ?? []} />
      </div>
    </div>
  )
}
