// Prévia do relatório em páginas A4. O MESMO componente é usado na tela e na impressão/PDF.
// Segue a geometria do modelo .docx (DWS): capa, moldura de página inteira, rosto, seções numeradas
// e páginas de anomalia. Com o modelo carregado, usa as imagens dele (capa, moldura, legenda, logos);
// sem modelo, desenha uma moldura simples no mesmo lugar.
import { useLayoutEffect, useRef, useState } from 'react'
import { CONDICOES, severidade } from '../lib/condicao'
import { mesCurto } from '../lib/historico'
import { calcularIndicadores } from '../lib/indicadores'
import type { VisualModelo } from '../lib/modelo'
import { AreaLivre } from './AreaLivre'
import { graficosDoMes } from './graficos'
import {
  anomaliaDe,
  colunasQuadro,
  condicaoNoMes,
  dataPorExtenso,
  localizacaoPadrao,
  reincidenciaFinal,
  rotulosUsina,
  VAZIO,
  equipamentosAnomalia,
  equipamentosQuadro,
  juntar,
  type ImagemRef,
  type Relatorio,
} from '../lib/relatorio'

const ENDERECO = ['José P. Xavier Sobrinho, 101 - B. Triângulo', 'Pedro Leopoldo – MG – Brasil - CEP:33600-000']

/** Linhas do cabeçalho: as do modelo, com telefone e e-mail de quem assina (mesma regra do Word). */
function linhasCabecalho(r: Relatorio, v?: VisualModelo) {
  const doModelo = !!v?.cabecalho.length
  const base = doModelo ? v!.cabecalho : [...ENDERECO, 'Telefone: ', 'Email – ']
  const tel = r.contato?.telefone?.trim()
  const email = r.contato?.email?.trim()
  return base
    .map((l) => {
      if (/^\s*(Phone|Telefone|Tel)\b/i.test(l) && tel) {
        const atual = l.replace(/^[^:]*:\s*/, '')
        const fixo = atual.includes('/') ? `${atual.split('/')[0].trim()}/ ` : ''
        return { rot: `${l.split(':')[0]}: `, valor: `${fixo}${tel}` }
      }
      if (/^\s*E-?mail/i.test(l)) {
        const [rot, ...resto] = l.split(/(?<=–|:)\s*/)
        return { rot: `${rot} `, valor: email || resto.join(' ').trim(), link: true }
      }
      return { rot: l, valor: '' }
    })
    // sem modelo, telefone e e-mail só aparecem se o perfil tiver
    .filter((x) => (doModelo ? x.rot.trim() || x.valor : x.valor || !/^(Telefone|Email)/.test(x.rot)))
}

/** Página com a moldura do modelo (cabeçalho com endereço, faixa lateral, site e ART no rodapé). */
function Moldura({ r, v, children, classe = '' }: { r: Relatorio; v?: VisualModelo; children: React.ReactNode; classe?: string }) {
  return (
    <section
      className={`pagina pg-mold ${v?.moldura ? '' : 'sem-moldura'} ${classe}`}
      style={v?.moldura ? { backgroundImage: `url(${v.moldura})` } : undefined}
    >
      <div className="mold-cab">
        {linhasCabecalho(r, v).map((l, i) => (
          <div key={i}>
            {l.rot}
            {l.valor && <span className={l.link ? 'mold-link' : ''}>{l.valor}</span>}
          </div>
        ))}
      </div>
      {!v?.moldura && (
        <>
          <div className="mold-marca">
            PRÜFTECHNIK <b>MGS</b>
            <small>Machinery Service</small>
          </div>
          <div className="mold-site">www.pruftechnik.com/br</div>
        </>
      )}
      {children}
      {(r.art?.trim() || v?.art) && <div className="mold-art">ART: {r.art?.trim() || v?.art}</div>}
    </section>
  )
}

const Titulo = ({ n, children }: { n: number | string; children: React.ReactNode }) => (
  <h2 className="tit-num">
    <span>{n}.</span>
    {children}
  </h2>
)

/** Legenda das condições (no modelo é uma imagem; sem modelo, a mesma tabela em HTML). */
function LegendaCondicoes({ v }: { v?: VisualModelo }) {
  if (v?.legenda) return <img src={v.legenda} alt="Legenda das condições" className="legenda-img" />
  const esq = ['1', '2', '3', '4', '5', '6', '7']
  const dir = ['8', '9', '10', '11', '12', '13', 'X']
  const celulas = (c: string) => {
    const k = CONDICOES[c]
    return (
      <>
        <td className="leg-num" style={{ background: k.cor, color: k.texto }}>
          {c}
        </td>
        <td>{k.nome.toUpperCase()}</td>
      </>
    )
  }
  return (
    <table className="legenda-tab">
      <thead>
        <tr>
          <th colSpan={4}>
            PRÜFTECHNIK <b>MGS</b>
          </th>
        </tr>
      </thead>
      <tbody>
        {esq.map((c, i) => (
          <tr key={c}>
            {celulas(c)}
            {celulas(dir[i])}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Quadro({ r }: { r: Relatorio }) {
  const eqs = equipamentosQuadro(r)
  const meses = colunasQuadro(r)
  if (!eqs.length) return <p className="mt-4 text-[10pt] text-gray-500">Nenhum equipamento com as condições selecionadas.</p>
  return (
    <table className="quadro">
      <colgroup>
        <col style={{ width: '11%' }} />
        <col />
        <col style={{ width: '27%' }} />
        {meses.map((m) => (
          <col key={m} style={{ width: '8.6%' }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th colSpan={3 + meses.length}>{r.areaTitulo || r.sigla}</th>
        </tr>
        <tr>
          <th>Plano manutenção</th>
          <th>Descrição</th>
          <th>Local de instalação</th>
          {meses.map((m) => (
            <th key={m}>{mesCurto(m)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {eqs.map((e) => (
          <tr key={e.local}>
            <td>{e.plano ?? ''}</td>
            <td>{e.descricao}</td>
            <td>{e.local}</td>
            {meses.map((m) => {
              const c = condicaoNoMes(r, e, m)
              const k = CONDICOES[c]
              return (
                <td key={m} className="font-bold" style={k ? { background: k.cor, color: k.texto } : undefined}>
                  {c}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const SEV = ['Alarme', 'Alerta', 'Pré-alerta'] as const
const SEV_COR: Record<string, string> = { Alarme: '#ff0000', Alerta: '#ffc000', 'Pré-alerta': '#ffff00' }

function PaginaAnomalia({
  r,
  local,
  v,
  editarImagens,
}: {
  r: Relatorio
  local: string
  v?: VisualModelo
  editarImagens?: (local: string, imagens: ImagemRef[]) => void
}) {
  const e = r.equipamentos.find((x) => x.local === local)!
  const a = anomaliaDe(r, e)
  const sev = severidade(e.condicao)
  const rot = rotulosUsina(r.usina)
  const situacao = a.eixos.map((x) => [x.id, x.nome, juntar(x.situacaoPadrao, x.situacaoTecnico)] as const).filter(([, , t]) => t)
  const recomendacao = a.eixos.map((x) => [x.id, x.nome, juntar(x.recomendacaoPadrao, x.recomendacaoTecnico)] as const).filter(([, , t]) => t)
  return (
    <section className="pagina pg-anom" data-local={e.local}>
      <div className="anom-logos">
        {v?.logoEsq ? <img src={v.logoEsq} alt="" className="logo-esq" /> : <span className="logo-texto">PRÜFTECHNIK MGS</span>}
        {v?.logoDir ? <img src={v.logoDir} alt="" className="logo-dir" /> : <span className="logo-texto">vallourec</span>}
      </div>
      <div className="anom-titulo">
        <span>Relatório de Análise de Vibração</span>
        <small>Anomalia pendente</small>
      </div>
      <div className="anom-topo">
        <div className="anom-campos">
          <p>
            <b>Localização:</b> {a.localizacao || localizacaoPadrao(r, e)}
          </p>
          <p>
            <b>Equipamento:</b> {a.equipamento || e.descricao}
          </p>
          <p>
            <b>{rot.data}:</b> {a.dataMedicao || VAZIO}
          </p>
          <p>
            <b>Reincidente desde:</b> {reincidenciaFinal(r, e, a) || VAZIO}
          </p>
          <p>
            <b>Nota PR:</b> {a.notasPR || VAZIO}
          </p>
        </div>
        <table className="anom-sev">
          <tbody>
            {rot.severidades.map((s, i) => (
              <tr key={s}>
                <td className="caixinha" style={{ background: sev === SEV[i] ? SEV_COR[SEV[i]] : '#fff' }} />
                <td className="rotulo">{s}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="caixa-modelo">
        <p className="rot">Situação:</p>
        {situacao.map(([id, nome, t]) => (
          <p key={id}>
            <b>{nome}:</b> {t}
          </p>
        ))}
      </div>
      <div className="caixa-modelo">
        <p className="rot">Recomendação:</p>
        {recomendacao.map(([id, nome, t]) => (
          <p key={id}>
            {recomendacao.length > 1 && <b>{nome}: </b>}
            {t}
          </p>
        ))}
      </div>
      <AreaLivre
        imagens={a.imagens}
        editar={editarImagens && a.layoutImagens === 'livre' ? (imgs) => editarImagens(e.local, imgs) : undefined}
      />
    </section>
  )
}

/** editarImagens: só na prévia da tela — permite arrastar/redimensionar imagens no layout livre. */
export function Previa({
  r,
  editarImagens,
  visual: v,
}: {
  r: Relatorio
  editarImagens?: (local: string, imagens: ImagemRef[]) => void
  visual?: VisualModelo
}) {
  const anomalias = equipamentosAnomalia(r)
  const comIndicadores = r.incluirIndicadores !== false
  const nDados = comIndicadores ? 4 : 2
  const g = comIndicadores ? graficosDoMes(calcularIndicadores(r), r.mesReferencia, v?.graficos) : undefined
  const selos = [...new Set([r.equipe.seloColeta, r.equipe.seloAnalise].filter(Boolean) as string[])]
  const plataforma = r.plataforma === undefined ? v?.plataforma : r.plataforma ? `Plataforma Web Dynamox: ${r.plataforma}` : undefined
  const ponto = (s: string) => (s && !/[.!?]$/.test(s) ? `${s}.` : s)

  return (
    <div className="previa">
      {v?.capa && (
        <section className="pagina pg-capa">
          <img src={v.capa} alt="Capa" />
        </section>
      )}

      {/* Rosto */}
      <Moldura r={r} v={v}>
        <h1 className="rosto-titulo">Relatório de Análise de Vibração</h1>
        <div className="rosto-numero">
          Número do Relatório: {r.codigo}
          {r.areaTitulo ? ` - ${r.areaTitulo}` : ''}
        </div>
        <div className="rosto-data">
          {r.cidade ? `${r.cidade}, ` : ''}
          {dataPorExtenso(r.dataExpedicao).replace(/^0/, '')}
        </div>
      </Moldura>

      {/* 1. Condição dos equipamentos */}
      <Moldura r={r} v={v}>
        <Titulo n={1}>Condição dos equipamentos da rota</Titulo>
        <LegendaCondicoes v={v} />
        <Quadro r={r} />
      </Moldura>

      {/* 2 e 3. Indicadores */}
      {g && (
        <Moldura r={r} v={v}>
          <Titulo n={2}>Índice de execução</Titulo>
          {/* SVG gerado pelo próprio VibDocs (textos escapados) */}
          <div className="grafico-modelo" dangerouslySetInnerHTML={{ __html: g.execucao }} />
          <Titulo n={3}>Indicadores de anomalia</Titulo>
          <div className="grafico-modelo" dangerouslySetInnerHTML={{ __html: g.anomalias }} />
          <div className="grafico-modelo" dangerouslySetInnerHTML={{ __html: g.reincidencia }} />
        </Moldura>
      )}

      {/* 4. Dados operacionais, equipe e 5. Anomalias */}
      <Moldura r={r} v={v} classe="pg-dados">
        <Titulo n={nDados}>Dados operacionais</Titulo>
        <h3>{nDados}.1 Equipamentos utilizados</h3>
        {r.aparelho !== '' && <p>Aparelho: {ponto(r.aparelho || VAZIO)}</p>}
        {r.software !== '' && <p>Software para tratamento dos dados medidos: {ponto(r.software || VAZIO)}</p>}
        {plataforma && <p>{ponto(plataforma)}</p>}
        <h3 className="mt-[17mm]">{nDados}.2 Equipe Técnica</h3>
        <p>Técnico responsável pela coleta de dados: {ponto(r.equipe.coleta || VAZIO)}</p>
        <p>Técnico responsável pela análise de dados: {ponto(r.equipe.analise || VAZIO)}</p>
        {selos.length > 0 && (
          <div className="selos">
            {selos.map((s) => (
              <img key={s.slice(-40)} src={s} alt="Selo de certificação" />
            ))}
          </div>
        )}
        {anomalias.length > 0 && (
          <>
            <h3 className={selos.length ? 'mt-[3mm]' : 'mt-[6mm]'}>{nDados + 1}. Anomalias registradas</h3>
            <p>A seguir as anomalias detectadas nos equipamentos monitorados.</p>
          </>
        )}
      </Moldura>

      {anomalias.map((e) => (
        <PaginaAnomalia key={e.local} r={r} local={e.local} v={v} editarImagens={editarImagens} />
      ))}
    </div>
  )
}

/** Na tela, encolhe as folhas A4 para caberem na largura do painel (na impressão não se aplica). */
export function AjustarLargura({ children, largura = 826 }: { children: React.ReactNode; largura?: number }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  useLayoutEffect(() => {
    const el = caixa.current!
    const obs = new ResizeObserver(() => setZoom(Math.min(1, el.clientWidth / largura)))
    obs.observe(el)
    return () => obs.disconnect()
  }, [largura])
  return (
    <div ref={caixa} className="w-full">
      <div style={{ zoom }}>{children}</div>
    </div>
  )
}
