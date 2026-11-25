// Prévia do relatório em páginas A4. O mesmo HTML é usado para imprimir/gerar o PDF.
import { CONDICOES, severidade } from '../lib/condicao'
import { dataPorExtenso, type Relatorio } from '../lib/relatorio'

function Cabecalho() {
  return (
    <div className="pg-cab">
      <div className="text-[8px] leading-tight">
        José P. Xavier Sobrinho, 101 - B. Triângulo
        <br />
        Pedro Leopoldo – MG – Brasil - CEP:33600-000
      </div>
      <div className="font-bold tracking-wide">PRÜFTECHNIK · MGS</div>
    </div>
  )
}

function Celula({ c }: { c: string }) {
  const k = CONDICOES[c] ?? CONDICOES.X
  return (
    <td className="border border-black text-center" style={{ background: k.cor, color: k.texto }}>
      {c || '–'}
    </td>
  )
}

export function Previa({ r }: { r: Relatorio }) {
  return (
    <div className="previa">
      {/* Página de rosto */}
      <section className="pagina">
        <Cabecalho />
        <div className="mt-24 text-center">
          <div className="text-3xl font-bold">Relatório de Análise de Vibração</div>
          <div className="mt-16 text-sm">
            Número do Relatório: <b>{r.codigo}</b>
            {r.areaTitulo ? ` – ${r.areaTitulo}` : ''}
          </div>
          <div className="mt-40 text-sm">
            {r.cidade}, {dataPorExtenso(r.dataExpedicao)}
          </div>
        </div>
      </section>

      {/* 1. Condição dos equipamentos */}
      <section className="pagina">
        <Cabecalho />
        <h2 className="mt-4 mb-2 text-sm font-bold">1. Condição dos equipamentos da rota</h2>
        <table className="w-full border-collapse text-[9px]">
          <thead>
            <tr className="bg-[#002060] text-white">
              <th className="border border-black px-1">Local de instalação</th>
              <th className="border border-black px-1">Descrição</th>
              <th className="border border-black px-1">{r.mesReferencia.split('-').reverse().join('/')}</th>
            </tr>
          </thead>
          <tbody>
            {r.equipamentos.map((e) => (
              <tr key={e.local}>
                <td className="border border-black px-1">{e.local}</td>
                <td className="border border-black px-1">{e.descricao}</td>
                <Celula c={e.condicao} />
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="mt-6 mb-1 text-sm font-bold">Equipe técnica</h2>
        <p className="text-[10px]">
          Técnico responsável pela coleta de dados: {r.equipe.coleta || '—'}
          <br />
          Técnico responsável pela análise de dados: {r.equipe.analise || '—'}
        </p>
      </section>

      {/* Páginas de anomalia */}
      {r.anomalias.map((a) => {
        const sev = severidade(a.condicao)
        return (
          <section className="pagina" key={a.local}>
            <div className="flex items-end justify-between border-b-2 border-black pb-1">
              <div className="text-lg font-bold text-red-600">Relatório de Análise de Vibração</div>
              <div className="text-[10px] font-bold">Anomalia pendente</div>
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-bold">
              <div className="space-y-0.5">
                <div>Localização: {r.areaTitulo || r.sigla}</div>
                <div>Equipamento: {a.equipamento}</div>
                <div>Local de instalação: {a.local}</div>
                <div>Data: {a.dataMedicao}</div>
                <div>Reincidente desde: {a.reincidenteDesde || '—'}</div>
                <div>Notas PR: {a.notasPR || '—'}</div>
              </div>
              <table className="text-[10px]">
                <tbody>
                  {(['Alarme', 'Alerta', 'Pré-alerta'] as const).map((s) => (
                    <tr key={s}>
                      <td
                        className="h-5 w-6 border border-black"
                        style={{ background: sev === s ? (s === 'Alarme' ? '#ff0000' : s === 'Alerta' ? '#ffc000' : '#ffff00') : '#fff' }}
                      />
                      <td className="pl-1">{s}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 min-h-28 border border-black p-2 text-[11px] whitespace-pre-wrap">
              <b>Situação:</b>
              <br />
              {a.situacao}
            </div>
            <div className="mt-3 min-h-28 border border-black p-2 text-[11px] whitespace-pre-wrap">
              <b>Recomendação:</b>
              <br />
              {a.recomendacao}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="col-span-3 flex h-36 items-center justify-center border border-dashed text-[10px] text-gray-400">
                tendência (imagem)
              </div>
              <div className="col-span-2 flex h-36 items-center justify-center border border-dashed text-[10px] text-gray-400">
                espectro / envelope (imagem)
              </div>
              <div className="flex h-36 items-center justify-center border border-dashed text-[10px] text-gray-400">foto</div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
