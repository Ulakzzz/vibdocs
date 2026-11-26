// Página inicial depois do login (rolável): ondas com a saudação, escolha da usina, lembretes,
// rascunhos recentes, calendário do mês, status das áreas e o que está em desenvolvimento.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { mesesDisponiveis, USINAS, type Usina } from '../lib/controle'
import { lembretes } from '../lib/gut'
import { arquivoIcs, lembretesDoRelatorio } from '../lib/lembretesArquivo'
import { mesCurto } from '../lib/historico'
import { rascunhosRecentes, resumoUsina } from '../lib/rascunho'
import { equipamentosAnomalia, hojeISO, STATUS_RELATORIO, type Relatorio, type StatusRelatorio } from '../lib/relatorio'
import { btnFantasma } from '../editor/campos'
import { Contador } from '../ui/Contador'
import { Ondas } from '../ui/Ondas'

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
interface Lembrete {
  quando: Date
  texto: string
  tipo: 'enviar' | 'reanalisar'
  r: Relatorio
  local: string
}

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}
const dia = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const quantoFalta = (d: Date) => {
  const n = Math.ceil((d.getTime() - Date.now()) / 86400000)
  return n < 0 ? `atrasado ${-n} d` : n === 0 ? 'hoje' : `em ${n} d`
}

/** Bloco que aparece (sobe e clareia) quando entra na tela ao rolar. */
function Revelar({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current!
    const obs = new IntersectionObserver(
      ([x]) => {
        if (x.isIntersecting) {
          el.classList.add('visivel')
          obs.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={`revelar ${className}`}>
      {children}
    </div>
  )
}

/** Calendário do mês: dias com rascunho/expedição (amarelo) e lembretes (vermelho = enviar, contorno = reanalisar). */
function Calendario({ recentes, avisos }: { recentes: Relatorio[]; avisos: Lembrete[] }) {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()
  const primeiro = new Date(ano, mes, 1).getDay()
  const dias = new Date(ano, mes + 1, 0).getDate()
  const marcados = new Map<number, string[]>()
  for (const r of recentes)
    for (const iso of [r.dataExpedicao, r.atualizadoEm?.slice(0, 10)]) {
      if (!iso) continue
      const [a, m, d] = iso.split('-').map(Number)
      if (a === ano && m === mes + 1) marcados.set(d, [...new Set([...(marcados.get(d) ?? []), r.codigo])])
    }
  const lembDia = new Map<number, Lembrete[]>()
  for (const l of avisos)
    if (l.quando.getFullYear() === ano && l.quando.getMonth() === mes) lembDia.set(l.quando.getDate(), [...(lembDia.get(l.quando.getDate()) ?? []), l])
  const nomeMes = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return (
    <section className="cartao-inicio h-full">
      <div className="flex items-baseline justify-between">
        <h2 className="titulo text-lg first-letter:uppercase">{nomeMes}</h2>
        <span className="text-xs text-cinza">rascunhos e lembretes</span>
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
          const l = lembDia.get(d)
          const titulo = [...(m ?? []), ...(l ?? []).map((x) => x.texto)].join('\n')
          return (
            <span
              key={d}
              className={`dia ${d === hoje.getDate() ? 'hoje' : ''} ${m ? 'marcado' : ''} ${l?.some((x) => x.tipo === 'enviar') ? 'enviar' : l ? 'reanalisar' : ''}`}
              title={titulo || undefined}
            >
              {d}
            </span>
          )
        })}
      </div>
    </section>
  )
}

/** Interruptor (ideia do CodePen "Toggle switch with :has()"); por enquanto só mostra o que virá. */
function Interruptor({ rotulo, desligado = true }: { rotulo: string; desligado?: boolean }) {
  return (
    <label className="interruptor" title="Em breve">
      <input type="checkbox" disabled={desligado} />
      <span className="trilho" aria-hidden>
        <span className="bolinha" />
      </span>
      {rotulo}
    </label>
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
    rascunhosRecentes(40)
      .then(setRecentes)
      .catch(() => setRecentes([]))
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

  const lista = recentes ?? []
  const lista2 = lista
  const avisos: Lembrete[] = lista
    .flatMap((r) =>
      equipamentosAnomalia(r).flatMap((e) => {
        const a = r.anomalias[e.local]
        return a ? lembretes(r, a, e.condicao).map((l) => ({ ...l, r, local: e.local })) : []
      }),
    )
    .sort((a, b) => a.quando.getTime() - b.quando.getTime())
  const doMes = lista.filter((r) => r.mesReferencia === mesRef)
  const anomaliasMes = doMes.reduce((n, r) => n + equipamentosAnomalia(r).length, 0)
  const primeiroNome = p.nome.split(' ')[0]
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="inicio mx-auto w-full max-w-6xl px-6 pt-6 pb-16 lg:px-10">
      {/* Saudação sobre as ondas */}
      <header className="inicio-hero surgir-lista" style={{ ['--i' as string]: 0 }}>
        <Ondas className="absolute inset-0 h-full w-full" />
        <div className="relative">
          <p className="text-sm text-white/60 first-letter:uppercase">{hoje}</p>
          <h1 className="titulo-grande mt-1 text-4xl leading-tight text-white lg:text-5xl">
            {saudacao()}, {primeiroNome}.
          </h1>
          <p className="mt-2 text-white/70">Qual usina você vai analisar hoje?</p>
        </div>
        <div className="relative mt-8 grid max-w-xl grid-cols-3 gap-4 text-white">
          <div>
            <b className="titulo-grande block text-3xl">
              <Contador valor={doMes.length} />
            </b>
            <span className="text-xs text-white/60">rascunhos no mês</span>
          </div>
          <div>
            <b className="titulo-grande block text-3xl">
              <Contador valor={anomaliasMes} />
            </b>
            <span className="text-xs text-white/60">anomalias no mês</span>
          </div>
          <div>
            <b className="titulo-grande block text-3xl">
              <Contador valor={avisos.filter((a) => a.quando.getTime() - Date.now() < 7 * 86400000).length} />
            </b>
            <span className="text-xs text-white/60">lembretes em 7 dias</span>
          </div>
        </div>
      </header>

      {/* Usinas */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
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
                    <b className="titulo-grande block text-2xl">{r ? <Contador valor={r.rascunhos} /> : '…'}</b>
                    <span className="text-xs text-cinza">áreas em rascunho</span>
                  </span>
                  <span>
                    <b className="titulo-grande block text-2xl">{r ? <Contador valor={r.emitidos} /> : '…'}</b>
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

      {/* Lembretes + calendário */}
      <Revelar className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="cartao-inicio">
          <div className="flex items-baseline justify-between">
            <h2 className="titulo text-lg">Lembretes</h2>
            <span className="flex items-center gap-3 text-xs text-cinza">
              pelo GUT e pelos alarmes
              {avisos.length > 0 && (
                <button
                  className="bt bt-sec bt-mini"
                  title="Baixa um arquivo .ics: abra no Outlook para os lembretes irem para o seu calendário (com aviso na véspera)"
                  onClick={() => {
                    const lista = [...new Map(lista2.flatMap((r) => lembretesDoRelatorio(r)).map((l) => [`${l.codigo}|${l.tag}|${l.tipo}`, l])).values()]
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(arquivoIcs(lista))
                    a.download = 'Lembretes VibDocs.ics'
                    a.click()
                    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
                  }}
                >
                  Adicionar ao Outlook (.ics)
                </button>
              )}
            </span>
          </div>
          {avisos.length === 0 ? (
            <p className="mt-4 text-sm text-cinza">
              Sem lembretes. Eles aparecem quando uma anomalia tem GUT preenchido (data de nova análise) ou está em alarme (prazo para
              enviar o relatório).
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-linha">
              {avisos.slice(0, 8).map((l, i) => (
                <li key={`${l.r.codigo}-${l.local}-${l.tipo}-${i}`}>
                  <button className="linha-recente" onClick={() => p.continuar(l.r)}>
                    <span className={`marca-lembrete ${l.tipo}`} aria-hidden />
                    <b className="w-12">{dia(l.quando)}</b>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="tag mr-2">{l.local}</span>
                      {l.texto}
                    </span>
                    <span className={`text-xs ${l.quando.getTime() < Date.now() ? 'font-semibold text-red-600' : 'text-cinza'}`}>
                      {quantoFalta(l.quando)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Calendario recentes={lista} avisos={avisos} />
      </Revelar>

      {/* Andamento dos relatórios do mês (quadro) */}
      <Revelar className="mt-6">
        <section className="cartao-inicio">
          <div className="flex items-baseline justify-between">
            <h2 className="titulo text-lg">Relatórios do mês</h2>
            <span className="text-xs text-cinza">por andamento</span>
          </div>
          <div className="quadro-status mt-3">
            {(Object.keys(STATUS_RELATORIO) as StatusRelatorio[]).map((s) => {
              const doStatus = doMes.filter((r) => (r.status ?? 'rascunho') === s)
              return (
                <div key={s} className="coluna-status">
                  <h3>
                    <i style={{ background: STATUS_RELATORIO[s].cor }} />
                    {STATUS_RELATORIO[s].nome} <small>{doStatus.length}</small>
                  </h3>
                  {doStatus.map((r) => (
                    <button key={`${r.usina}${r.sigla}${r.codigo}`} className="cartao-status" onClick={() => p.continuar(r)}>
                      <b>{r.areaTitulo || r.sigla}</b>
                      <small>
                        {r.usina} · {r.codigo}
                      </small>
                      <small>{equipamentosAnomalia(r).length} anomalia(s)</small>
                    </button>
                  ))}
                  {!doStatus.length && <p className="text-xs text-cinza">nenhum</p>}
                </div>
              )
            })}
          </div>
        </section>
      </Revelar>

      {/* Continuar */}
      <Revelar className="mt-6">
        <section className="cartao-inicio">
          <div className="flex items-baseline justify-between">
            <h2 className="titulo text-lg">Continuar de onde parou</h2>
            <span className="text-xs text-cinza">salvos neste navegador{p.raiz ? ' e no SharePoint' : ''}</span>
          </div>
          {recentes === undefined ? (
            <p className="mt-4 text-sm text-cinza">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="mt-4 text-sm text-cinza">Nenhum rascunho ainda. Escolha uma usina acima para começar.</p>
          ) : (
            <ul className="mt-3 grid gap-x-6 divide-linha md:grid-cols-2">
              {lista.slice(0, 8).map((r) => (
                <li key={`${r.usina}/${r.mesReferencia}/${r.sigla}/${r.codigo}`} className="border-b border-linha">
                  <button className="linha-recente" onClick={() => p.continuar(r)}>
                    <span className="tag">{r.codigo}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {r.usina} · {r.areaTitulo || r.sigla} · {mesCurto(r.mesReferencia)}
                      {r.avulso && <span className="ml-1.5 rounded-full bg-sinal px-1.5 text-[11px] font-semibold text-preto">avulso</span>}
                    </span>
                    <span className="text-xs text-cinza" title="Último salvamento">
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
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={btnFantasma} onClick={() => p.avulso('Florestal')}>
              Relatório avulso (Florestal ou outra área)
            </button>
          </div>
        </section>
      </Revelar>

      {/* Em desenvolvimento */}
      <Revelar className="mt-6">
        <section className="cartao-inicio">
          <div className="flex items-baseline justify-between">
            <h2 className="titulo text-lg">Em desenvolvimento</h2>
            <span className="text-xs text-cinza">ideias registradas para as próximas versões</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <article className="ideia">
              <h3>Avisos no celular</h3>
              <p>
                Lembrar quem fez o relatório de <b>enviá-lo</b> (alarme tem prazo curto desde a identificação) e de fazer uma{' '}
                <b>nova análise</b> na data que o GUT indica (7, 15, 30 ou 60 dias). O VibDocs já grava os lembretes de cada relatório em{' '}
                <b>VibDocs/lembretes</b> (um arquivo por relatório); falta só o fluxo do Power Automate que lê a pasta todo dia e avisa no
                Teams.
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer font-semibold">Como montar o fluxo (Power Automate)</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>Fluxo de nuvem agendado: todo dia às 7h.</li>
                  <li>SharePoint “Listar pastas” em VibDocs/lembretes e “Obter conteúdo do arquivo” de cada .json.</li>
                  <li>“Analisar JSON” (campo lembretes: codigo, tag, tipo, quando, texto, responsavel, email).</li>
                  <li>Filtrar os itens com quando = hoje (ou até 2 dias antes).</li>
                  <li>Teams “Publicar mensagem em um chat” para o email do responsável: chega como notificação no celular.</li>
                </ol>
              </details>
              <Interruptor rotulo="Avisar no celular" />
            </article>
            <article className="ideia">
              <h3>Calendário de rotas</h3>
              <p>
                Lista no SharePoint com a programação (usina, área, data, responsável, status). O calendário acima passa a mostrar as
                rotas do mês e exporta para o Outlook (.ics).
              </p>
              <Interruptor rotulo="Mostrar rotas" />
            </article>
            <article className="ideia">
              <h3>Banco de vibração</h3>
              <p>
                Ler os bancos do Omnitrend (.mdb) direto no navegador: tendência dos globais, alarmes e severidade sugerida, com o
                vínculo máquina ↔ TAG.
              </p>
              <Interruptor rotulo="Usar o banco" />
            </article>
          </div>
        </section>
      </Revelar>
    </div>
  )
}
