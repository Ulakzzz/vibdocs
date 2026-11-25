// Dados gerais do relatório (automáticos, mas editáveis) e escolha das condições que entram nele.
import { CONDICOES } from '../lib/condicao'
import {
  gerarCodigo,
  MESES_QUADRO_PADRAO,
  PADRAO_ANOMALIA,
  PADRAO_QUADRO,
  TODAS_CONDICOES,
  USINAS_RELATORIO,
  type Relatorio,
} from '../lib/relatorio'
import { btnMini, Campo, Texto } from './campos'

type Atualizar = (f: (r: Relatorio) => Relatorio) => void

function SeletorCondicoes(p: {
  titulo: string
  dica: string
  marcadas: string[]
  padrao: string[]
  contagem: Record<string, number>
  mudar: (v: string[]) => void
}) {
  const alternar = (c: string) =>
    p.mudar(p.marcadas.includes(c) ? p.marcadas.filter((x) => x !== c) : TODAS_CONDICOES.filter((x) => x === c || p.marcadas.includes(x)))
  return (
    <fieldset className="rounded border border-zinc-200 p-2">
      <legend className="px-1 text-xs font-semibold">{p.titulo}</legend>
      <p className="mb-2 text-[11px] text-zinc-500">{p.dica}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {TODAS_CONDICOES.map((c) => {
          const k = CONDICOES[c]
          return (
            <label key={c} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={p.marcadas.includes(c)} onChange={() => alternar(c)} />
              <span className="inline-block w-6 rounded text-center" style={{ background: k.cor, color: k.texto, border: '1px solid #ccc' }}>
                {c}
              </span>
              <span className="truncate">{k.nome}</span>
              {p.contagem[c] ? <span className="ml-auto text-zinc-400">{p.contagem[c]}</span> : null}
            </label>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1">
        <button className={btnMini} onClick={() => p.mudar([...p.padrao])}>
          Padrão
        </button>
        <button className={btnMini} onClick={() => p.mudar([...TODAS_CONDICOES])}>
          Todas
        </button>
        <button className={btnMini} onClick={() => p.mudar([])}>
          Nenhuma
        </button>
      </div>
    </fieldset>
  )
}

export function PainelRelatorio({ r, atualizar }: { r: Relatorio; atualizar: Atualizar }) {
  const set = <K extends keyof Relatorio>(k: K, v: Relatorio[K]) => atualizar((x) => ({ ...x, [k]: v }))
  const contagem: Record<string, number> = {}
  for (const e of r.equipamentos) contagem[e.condicao] = (contagem[e.condicao] ?? 0) + 1

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Campo rotulo="Usina">
          <select
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
            value={r.usina}
            onChange={(e) => set('usina', e.target.value)}
            disabled={!r.avulso}
          >
            {USINAS_RELATORIO.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Sigla da área">
          <Texto valor={r.sigla} mudar={(v) => set('sigla', v.toUpperCase())} />
        </Campo>
        <Campo rotulo="Título da área (aparece no relatório)">
          <Texto valor={r.areaTitulo} mudar={(v) => set('areaTitulo', v)} />
        </Campo>
        <Campo rotulo="Mês de referência">
          <Texto tipo="month" valor={r.mesReferencia} mudar={(v) => v && set('mesReferencia', v)} />
        </Campo>
        <Campo rotulo="Sequência no mês (usina)">
          <Texto tipo="number" valor={String(r.sequencia)} mudar={(v) => set('sequencia', Math.max(1, Number(v) || 1))} />
        </Campo>
        <Campo
          rotulo="Código do relatório"
          dica={r.codigoManual ? 'Editado à mão.' : 'Automático: sigla + 446 + AAMM + sequência.'}
        >
          <div className="flex gap-1">
            <Texto valor={r.codigo} mudar={(v) => atualizar((x) => ({ ...x, codigo: v, codigoManual: true }))} />
            {r.codigoManual && (
              <button
                className={btnMini}
                title="Voltar ao código automático"
                onClick={() =>
                  atualizar((x) => ({ ...x, codigoManual: false, codigo: gerarCodigo(x.usina, x.sigla, x.mesReferencia, x.sequencia) }))
                }
              >
                auto
              </button>
            )}
          </div>
        </Campo>
        <Campo rotulo="Data de expedição">
          <Texto tipo="date" valor={r.dataExpedicao} mudar={(v) => v && set('dataExpedicao', v)} />
        </Campo>
        <Campo rotulo="Cidade">
          <Texto valor={r.cidade} mudar={(v) => set('cidade', v)} />
        </Campo>
        <Campo rotulo="Técnico da coleta">
          <Texto valor={r.equipe.coleta} mudar={(v) => set('equipe', { ...r.equipe, coleta: v })} />
        </Campo>
        <Campo rotulo="Técnico da análise">
          <Texto valor={r.equipe.analise} mudar={(v) => set('equipe', { ...r.equipe, analise: v })} />
        </Campo>
        <Campo rotulo="Meses no quadro de condição" dica="Inclui o mês do relatório. Os anteriores vêm do histórico.">
          <Texto
            tipo="number"
            valor={String(r.mesesNoQuadro ?? MESES_QUADRO_PADRAO)}
            mudar={(v) => set('mesesNoQuadro', Math.min(12, Math.max(1, Number(v) || 1)))}
          />
        </Campo>
      </div>

      <div className="rounded border border-zinc-200 bg-white p-2 text-xs">
        <b>Histórico: </b>
        {r.historico ? (
          <>
            {Object.keys(r.historico.condicoes).length} de {r.equipamentos.length} equipamentos com medições anteriores · fonte: {r.historico.fonte}
          </>
        ) : (
          <span className="text-zinc-500">
            ainda não carregado. Com a pasta conectada ele é lido de todas as planilhas de controle da usina; no modo manual, importe várias
            planilhas de uma vez.
          </span>
        )}
      </div>

      <SeletorCondicoes
        titulo="Condições no quadro de condição"
        dica="Equipamentos com estas condições aparecem na tabela do início do relatório."
        marcadas={r.condicoesQuadro}
        padrao={PADRAO_QUADRO}
        contagem={contagem}
        mudar={(v) => set('condicoesQuadro', v)}
      />
      <SeletorCondicoes
        titulo="Condições que geram página de anomalia"
        dica="Cada equipamento com estas condições ganha uma página própria."
        marcadas={r.condicoesAnomalia}
        padrao={PADRAO_ANOMALIA}
        contagem={contagem}
        mudar={(v) => set('condicoesAnomalia', v)}
      />
    </div>
  )
}
