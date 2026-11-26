// Indicadores do relatório (modelo VMN, seções 2 a 4), calculados por mês para os equipamentos da área:
//  - Índice de execução: ordens planejadas × executadas (condição 1 a 4)
//  - Indicador de anomalias: alarme (4), alerta (3) e monitoráveis/pré-alerta (2)
//  - Índice de reincidência: anomalias do mês que também eram anomalia no mês anterior da rota
import { colunasQuadro, condicaoNoMes, type Relatorio } from './relatorio'

export interface MesExecucao {
  mes: string
  planejadas: number
  executadas: number
  naoExecutadas: number
  indice: number | null // 0..1
}
export interface MesAnomalias {
  mes: string
  alarme: number
  alerta: number
  monitoraveis: number
}
export interface MesReincidencia {
  mes: string
  total: number
  reincidentes: number
  indice: number | null
}

export interface Indicadores {
  meses: string[]
  execucao: MesExecucao[]
  anomalias: MesAnomalias[]
  reincidencia: MesReincidencia[]
}

const ANOMALIA = ['2', '3', '4']

export function calcularIndicadores(r: Relatorio): Indicadores {
  const meses = colunasQuadro(r)
  const eqs = r.equipamentos

  // Regras confirmadas pelo Raul (26/11/2026):
  //  - planejada = linha da planilha no mês, menos "X" (não previsto);
  //  - executada = ordem com condição 1, 2, 3 ou 4 (as demais — manutenção, inacessível, sem produção… — não foram medidas).
  const EXECUTADA = ['1', '2', '3', '4']
  const execucao = meses.map((mes): MesExecucao => {
    let planejadas = 0
    let executadas = 0
    for (const e of eqs) {
      const planejada =
        mes === r.mesReferencia
          ? e.condicao !== 'X' && e.condicao !== ''
          : r.historico?.execucao?.[e.local]?.[mes] !== undefined || r.historico?.condicoes[e.local]?.[mes] !== undefined
      if (!planejada) continue
      planejadas++
      if (EXECUTADA.includes(condicaoNoMes(r, e, mes))) executadas++
    }
    return { mes, planejadas, executadas, naoExecutadas: planejadas - executadas, indice: planejadas ? executadas / planejadas : null }
  })

  const anomalias = meses.map((mes): MesAnomalias => {
    const conta = (c: string) => eqs.filter((e) => condicaoNoMes(r, e, mes) === c).length
    return { mes, alarme: conta('4'), alerta: conta('3'), monitoraveis: conta('2') }
  })

  // Reincidência (regra de 26/11/2026): compara com o mês anterior da rota (o último mês com medição antes deste).
  // Reincidente = anomalia neste mês que também era anomalia no mês anterior. Índice = reincidentes / anomalias do mês.
  const mesesComMedicao = [...new Set(eqs.flatMap((e) => Object.keys(r.historico?.condicoes[e.local] ?? {})))].sort()
  const mesAnterior = (mes: string) => mesesComMedicao.filter((m) => m < mes).at(-1)
  const reincidencia = meses.map((mes): MesReincidencia => {
    const ant = mesAnterior(mes)
    let total = 0
    let reincidentes = 0
    for (const e of eqs) {
      if (!ANOMALIA.includes(condicaoNoMes(r, e, mes))) continue
      total++
      if (ant && ANOMALIA.includes(condicaoNoMes(r, e, ant))) reincidentes++
    }
    return { mes, total, reincidentes, indice: total ? reincidentes / total : null }
  })

  return { meses, execucao, anomalias, reincidencia }
}
