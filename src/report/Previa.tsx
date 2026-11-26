// Prévia do relatório em páginas A4. O MESMO componente é usado na tela e na impressão/PDF.
import { useEffect, useState } from 'react'
import { CONDICOES, severidade } from '../lib/condicao'
import { urlImagem } from '../lib/imagens'
import { mesCurto } from '../lib/historico'
import { calcularIndicadores } from '../lib/indicadores'
import { AreaLivre } from './AreaLivre'
import { graficosDoRelatorio } from './graficos'
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
  type Slot,
} from '../lib/relatorio'

function Cabecalho({ r }: { r: Relatorio }) {
  const tel = r.contato?.telefone
  const email = r.contato?.email
  return (
    <div className="pg-cab">
      <div className="text-[8px] leading-tight">
        José P. Xavier Sobrinho, 101 - B. Triângulo
        <br />
        Pedro Leopoldo – MG – Brasil - CEP:33600-000
        {tel && (
          <>
            <br />
            Telefone: {tel}
          </>
        )}
        {email && (
          <>
            <br />
            Email – <span className="text-[#0563c1] underline">{email}</span>
          </>
        )}
      </div>
      <div className="font-bold tracking-wide">PRÜFTECHNIK · MGS</div>
    </div>
  )
}

/** Rodapé das páginas: ART (quando houver). */
function Rodape({ r }: { r: Relatorio }) {
  return r.art ? <div className="pg-rodape">ART: {r.art}</div> : null
}

function Celula({ c }: { c: string }) {
  const k = CONDICOES[c] ?? CONDICOES.X
  return (
    <td className="border border-black text-center" style={{ background: k.cor, color: k.texto }}>
      {c}
    </td>
  )
}

function Imagem({ img }: { img: ImagemRef }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    urlImagem(img.id).then(setUrl)
  }, [img.id])
  if (!url) return <div className="flex h-full w-full items-center justify-center text-[9px] text-gray-400">carregando…</div>
  return (
    <img
      src={url}
      alt={img.nome}
      className="h-full w-full"
      style={{ objectFit: img.ajuste === 'preencher' ? 'cover' : 'contain' }}
    />
  )
}

function Espaco({ slot, imagens, rotulo, classe }: { slot: Slot; imagens: ImagemRef[]; rotulo: string; classe: string }) {
  const dela = imagens.filter((i) => i.slot === slot)
  return (
    <div className={`slot ${classe} ${dela.length ? '' : 'slot-vazio'}`}>
      {dela.length ? (
        dela.map((i) => (
          <div key={i.id} className="min-h-0 min-w-0 flex-1">
            <Imagem img={i} />
          </div>
        ))
      ) : (
        <span className="no-print-texto">{rotulo}</span>
      )}
    </div>
  )
}

function PaginaIndicadores({ r }: { r: Relatorio }) {
  const g = graficosDoRelatorio(calcularIndicadores(r), r.usina)
  const bloco = (titulo: string, svg: string) => (
    <>
      <h2 className="mt-5 mb-2 text-sm font-bold">{titulo}</h2>
      {/* SVG gerado pelo próprio VibDocs (textos escapados) */}
      <div className="grafico" dangerouslySetInnerHTML={{ __html: svg }} />
    </>
  )
  return (
    <section className="pagina">
      <Cabecalho r={r} />
      {bloco('2. Índice de execução', g.execucao)}
      {bloco('3. Indicadores de anomalias', g.anomalias)}
      {bloco('4. Dados operacionais', g.reincidencia)}
      <Rodape r={r} />
    </section>
  )
}

/** editarImagens: só na prévia da tela — permite arrastar/redimensionar imagens no layout livre. */
/** Tabela que relaciona o número com a condição do equipamento (como nos relatórios emitidos). */
const NIVEIS = ['Alarme', 'Alerta', 'Pré-alerta'] as const

export const LEGENDA_ESQ = ['1', '2', '3', '4', '5', '6', '7']
export const LEGENDA_DIR = ['8', '9', '10', '11', '12', '13', 'X']

function LegendaCondicoes() {
  const celulas = (c: string) => {
    const k = CONDICOES[c]
    return (
      <>
        <td className="w-10 border border-black text-center font-bold" style={{ background: k.cor, color: k.texto }}>
          {c}
        </td>
        <td className="border border-black px-1">{k.nome.toUpperCase()}</td>
      </>
    )
  }
  return (
    <table className="mb-3 w-full border-collapse text-[8.5px]">
      <thead>
        <tr>
          <th colSpan={4} className="border border-black py-0.5 text-[10px] font-bold">
            CONDIÇÃO DO EQUIPAMENTO
          </th>
        </tr>
      </thead>
      <tbody>
        {LEGENDA_ESQ.map((c, i) => (
          <tr key={c}>
            {celulas(c)}
            {celulas(LEGENDA_DIR[i])}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Previa({ r, editarImagens }: { r: Relatorio; editarImagens?: (local: string, imagens: ImagemRef[]) => void }) {
  const quadro = equipamentosQuadro(r)
  const anomalias = equipamentosAnomalia(r)
  const colunas = colunasQuadro(r)

  return (
    <div className="previa">
      {/* Página de rosto */}
      <section className="pagina">
        <Cabecalho r={r} />
        <div className="mt-24 text-center">
          <div className="text-3xl font-bold">Relatório de Análise de Vibração</div>
          <div className="mt-16 text-sm">
            Número do Relatório: <b>{r.codigo}</b>
            {r.areaTitulo ? ` – ${r.areaTitulo}` : ''}
          </div>
          <div className="mt-40 text-sm">
            {r.cidade ? `${r.cidade}, ` : ''}
            {dataPorExtenso(r.dataExpedicao)}
          </div>
        </div>
        <Rodape r={r} />
      </section>

      {/* 1. Condição dos equipamentos */}
      <section className="pagina">
        <Cabecalho r={r} />
        <h2 className="mt-4 mb-2 text-sm font-bold">1. Condição dos equipamentos da rota</h2>
        <LegendaCondicoes />
        {quadro.length ? (
          <table className="w-full border-collapse text-[9px]">
            <thead>
              <tr className="bg-[#002060] text-white">
                <th className="border border-black px-1">Local de instalação</th>
                <th className="border border-black px-1">Descrição</th>
                {colunas.map((m) => (
                  <th key={m} className="w-12 border border-black px-1">
                    {mesCurto(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quadro.map((e) => (
                <tr key={e.local}>
                  <td className="border border-black px-1">{e.local}</td>
                  <td className="border border-black px-1">{e.descricao}</td>
                  {colunas.map((m) => (
                    <Celula key={m} c={condicaoNoMes(r, e, m)} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[10px] text-gray-500">Nenhum equipamento com as condições selecionadas.</p>
        )}
        <Rodape r={r} />
      </section>

      {/* Indicadores (seções 2 a 4 do modelo VMN) */}
      {r.incluirIndicadores !== false && <PaginaIndicadores r={r} />}

      {/* 4.1 Equipamentos utilizados, 4.2 Equipe técnica (com selos), 5. Anomalias registradas */}
      <section className="pagina">
        <Cabecalho r={r} />
        <h2 className="mt-5 mb-2 text-sm font-bold">4.1 Equipamentos utilizados</h2>
        <p className="text-[11px] leading-relaxed">
          Aparelho: {r.aparelho || VAZIO}
          <br />
          Software: {r.software || VAZIO}
        </p>
        <h2 className="mt-6 mb-2 text-sm font-bold">4.2 Equipe Técnica</h2>
        <p className="text-[11px] leading-relaxed">
          Técnico responsável pela coleta de dados: {r.equipe.coleta || VAZIO}
          <br />
          Técnico responsável pela análise de dados: {r.equipe.analise || VAZIO}
        </p>
        {(r.equipe.seloColeta || r.equipe.seloAnalise) && (
          <div className="mt-4 flex flex-wrap items-center gap-6">
            {[...new Set([r.equipe.seloColeta, r.equipe.seloAnalise].filter(Boolean) as string[])].map((s) => (
              <img key={s.slice(-40)} src={s} alt="Selo de certificação" className="h-[30mm] max-w-[75mm] object-contain" />
            ))}
          </div>
        )}
        {anomalias.length > 0 && (
          <>
            <h2 className="mt-8 mb-1 text-sm font-bold">5. Anomalias registradas</h2>
            <p className="text-[11px]">A seguir as anomalias detectadas nos equipamentos monitorados.</p>
          </>
        )}
        <Rodape r={r} />
      </section>

      {/* Uma página por anomalia */}
      {anomalias.map((e) => {
        const a = anomaliaDe(r, e)
        const sev = severidade(e.condicao)
        const rot = rotulosUsina(r.usina)
        const cor = (s: string) => (s === 'Alarme' ? '#ff0000' : s === 'Alerta' ? '#ffc000' : '#ffff00')
        return (
          <section className="pagina" key={e.local} data-local={e.local}>
            <div className="flex items-end justify-between border-b-2 border-black pb-1">
              <div className="text-lg font-bold text-red-600">Relatório de Análise de Vibração</div>
              <div className="text-[10px] font-bold">Anomalia pendente</div>
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-bold">
              <div className="space-y-0.5">
                <div>Localização: {a.localizacao || localizacaoPadrao(r, e)}</div>
                <div>Equipamento: {a.equipamento || e.descricao}</div>
                <div>
                  {rot.data}: {a.dataMedicao || VAZIO}
                </div>
                <div>Reincidente desde: {reincidenciaFinal(r, e, a) || VAZIO}</div>
                <div>Nota PR: {a.notasPR || VAZIO}</div>
              </div>
              <table className="h-fit text-[10px]">
                <tbody>
                  {rot.severidades.map((s, i) => (
                    <tr key={s}>
                      <td className="h-5 w-6 border border-black" style={{ background: sev === NIVEIS[i] ? cor(NIVEIS[i]) : '#fff' }} />
                      <td className="pl-1 font-bold">{s}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="caixa">
              <b>Situação:</b>
              {a.eixos.map((x) => (
                <p key={x.id}>
                  <b>{x.nome}:</b> {juntar(x.situacaoPadrao, x.situacaoTecnico)}
                </p>
              ))}
            </div>
            <div className="caixa">
              <b>Recomendação:</b>
              {a.eixos.map((x) => (
                <p key={x.id}>
                  <b>{x.nome}:</b> {juntar(x.recomendacaoPadrao, x.recomendacaoTecnico)}
                </p>
              ))}
            </div>
            {a.layoutImagens === 'livre' ? (
              <AreaLivre imagens={a.imagens} editar={editarImagens && ((imgs) => editarImagens(e.local, imgs))} />
            ) : (
              <div className="grade-imagens">
                <Espaco slot="tendencia" imagens={a.imagens} rotulo="tendência" classe="col-span-3 h-[58mm]" />
                <Espaco slot="espectro" imagens={a.imagens} rotulo="espectro / envelope" classe="col-span-2 h-[62mm]" />
                <Espaco slot="foto" imagens={a.imagens} rotulo="foto" classe="h-[62mm]" />
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
