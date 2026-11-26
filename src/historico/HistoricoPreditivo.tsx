// Página "Histórico preditivo": busca relatórios antigos do mesmo equipamento no site Histórico Preditivo.
import { useMemo, useState } from 'react'
import {
  abrirHistorico,
  buscarHistorico,
  dadosHistorico,
  fecharHistorico,
  SITE_HISTORICO,
  tipoRelatorio,
  type RegistroHP,
} from '../lib/historicoPreditivo'
import { btnFantasma, btnPri } from '../editor/campos'
import { Carregando, Copiar } from '../ui/Contador'

const COR_CRIT: Record<string, string> = { alarme: '#ff2a2a', alerta: '#ffc000', 'pre-alerta': '#ffff00', 'pré-alerta': '#ffff00', normal: '#00b050' }
const corCrit = (c: string) => COR_CRIT[c.toLowerCase().replace(/\s/g, '-')] ?? '#bdbdbd'
const data = (d?: Date) => (d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'sem data')

function Cartao({ r }: { r: RegistroHP }) {
  return (
    <li className="hp-item">
      <span className="hp-ponto" style={{ background: corCrit(r.criticidade) }} aria-hidden />
      <div className="hp-cartao">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <b className="titulo">{data(r.data)}</b>
          {r.criticidade && (
            <span className="hp-crit" style={{ background: corCrit(r.criticidade) }}>
              {r.criticidade}
            </span>
          )}
          <span className="tag">{r.equipamento}</span>
          {r.localizacao && <span className="text-sm text-cinza">{r.localizacao}</span>}
        </div>
        {r.situacao && (
          <div className="hp-texto">
            <span className="hp-rot">Situação</span>
            <p>{r.situacao}</p>
            <Copiar texto={r.situacao} rotulo="situação" />
          </div>
        )}
        {r.recomendacao && (
          <div className="hp-texto">
            <span className="hp-rot">Recomendação</span>
            <p>{r.recomendacao}</p>
            <Copiar texto={r.recomendacao} rotulo="recomendação" />
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cinza">
          {r.origem && <span>Relatório: {r.origem}</span>}
          {r.notaPR && <span>Nota PR: {r.notaPR}</span>}
          {r.reincidente && <span>Reincidente desde: {r.reincidente}</span>}
        </div>
      </div>
    </li>
  )
}

export function HistoricoPreditivo({ buscaInicial = '', sugestoes = [] }: { buscaInicial?: string; sugestoes?: string[] }) {
  const [dados, setDados] = useState(dadosHistorico())
  const [senha, setSenha] = useState('')
  const [abrindo, setAbrindo] = useState('')
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState(buscaInicial)
  const [tipo, setTipo] = useState<'todos' | 'vibracao' | 'termografia'>('vibracao')
  const [limite, setLimite] = useState(30)

  const abrir = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setErro('')
    setAbrindo('abrindo a chave…')
    try {
      setDados(await abrirHistorico(senha, (f, t) => setAbrindo(`planilha ${f} de ${t}…`)))
      setSenha('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setAbrindo('')
    }
  }

  const achados = useMemo(() => {
    if (!dados) return []
    const filtrados = tipo === 'todos' ? dados.registros : dados.registros.filter((r) => tipoRelatorio(r) === tipo)
    return buscarHistorico(filtrados, busca)
  }, [dados, busca, tipo])

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pt-8 pb-16 lg:px-10">
      <header className="surgir-lista">
        <p className="text-sm text-cinza">Integração</p>
        <h1 className="titulo-grande mt-1 text-4xl">Histórico preditivo</h1>
        <p className="mt-2 max-w-2xl text-grafite">
          Relatórios antigos do mesmo equipamento, lidos do site{' '}
          <a className="underline decoration-sinal decoration-2 underline-offset-4" href={SITE_HISTORICO} target="_blank" rel="noreferrer">
            Histórico Preditivo
          </a>
          . Use para comparar a situação de antes e reaproveitar recomendações.
        </p>
      </header>

      {!dados ? (
        <form className="cartao-inicio surgir-lista mt-8 max-w-lg" style={{ ['--i' as string]: 1 }} onSubmit={abrir}>
          <h2 className="titulo text-lg">Abrir o histórico</h2>
          <p className="mt-1 text-sm text-cinza">
            Os dados são cifrados. A senha é a mesma do site Histórico Preditivo; ela abre os dados só neste navegador e não é guardada.
          </p>
          {abrindo ? (
            <Carregando texto={abrindo} />
          ) : (
            <>
              <input
                type="password"
                className="campo mt-4"
                placeholder="Senha do Histórico Preditivo"
                aria-label="Senha do Histórico Preditivo"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
              {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
              <button type="submit" className={`${btnPri} mt-4`} disabled={!senha}>
                Abrir
              </button>
            </>
          )}
        </form>
      ) : (
        <>
          <div className="hp-barra surgir-lista mt-8" style={{ ['--i' as string]: 1 }}>
            <input
              className="campo flex-1"
              placeholder="TAG, descrição, área ou relatório (ex.: AJU-180-0310 ou ESMERI)"
              aria-label="Buscar no histórico"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setLimite(30)
              }}
            />
            <div className="abas">
              {(['vibracao', 'termografia', 'todos'] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tipo === t} onClick={() => setTipo(t)} className={tipo === t ? 'hp-aba-on' : ''}>
                  {t === 'vibracao' ? 'Vibração' : t === 'termografia' ? 'Termografia' : 'Todos'}
                </button>
              ))}
            </div>
          </div>
          {sugestoes.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-cinza">Buscar por:</span>
              {sugestoes.map((s) => (
                <button key={s} className="hp-sugestao" onClick={() => setBusca(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <p className="mt-4 text-sm text-cinza">
            {achados.length} registro(s) de {dados.registros.length} · {dados.arquivos} planilha(s)
            {dados.atualizado ? ` · atualizado em ${new Date(dados.atualizado).toLocaleDateString('pt-BR')}` : ''}
            <button
              className={`${btnFantasma} bt-mini ml-3`}
              onClick={() => {
                fecharHistorico()
                setDados(undefined)
              }}
            >
              Fechar o histórico
            </button>
          </p>
          {achados.length === 0 ? (
            <p className="cartao-inicio mt-4 text-sm text-cinza">Nada encontrado. Tente só um pedaço da TAG ou da descrição.</p>
          ) : (
            <ul className="hp-linha mt-4">
              {achados.slice(0, limite).map((r, i) => (
                <Cartao key={`${r.equipamento}-${r.origem}-${i}`} r={r} />
              ))}
            </ul>
          )}
          {achados.length > limite && (
            <button className={`${btnFantasma} mt-4`} onClick={() => setLimite((l) => l + 30)}>
              Mostrar mais ({achados.length - limite})
            </button>
          )}
        </>
      )}
    </div>
  )
}
