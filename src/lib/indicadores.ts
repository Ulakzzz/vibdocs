// Indicadores do relatório (modelo VMN, seções 2 a 4), calculados por mês para os equipamentos da área:
//  - Índice de execução: ordens planejadas × executadas
//  - Indicador de anomalias: alarme (4), alerta (3) e monitoráveis/pré-alerta (2)
//  - Índice de reincidência: anomalias do mês que já estavam em anomalia na medição anterior
import { reincidenteDesde } from './historico'
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

  const execucao = meses.map((mes): MesExecucao => {
    let planejadas = 0
    let executadas = 0
    for (const e of eqs) {
      // mês do relatório: dado atual da planilha (equipamento manual conta como planejado e executado);
      // meses anteriores: cópia do histórico
      const ex = mes === r.mesReferencia ? (e.condicao === 'X' ? undefined : (e.executado ?? (e.manual ? true : undefined))) : r.historico?.execucao?.[e.local]?.[mes]
      if (ex === undefined) continue
      planejadas++
      if (ex) executadas++
    }
    return { mes, planejadas, executadas, naoExecutadas: planejadas - executadas, indice: planejadas ? executadas / planejadas : null }
  })

  const anomalias = meses.map((mes): MesAnomalias => {
    const conta = (c: string) => eqs.filter((e) => condicaoNoMes(r, e, mes) === c).length
    return { mes, alarme: conta('4'), alerta: conta('3'), monitoraveis: conta('2') }
  })

  const reincidencia = meses.map((mes): MesReincidencia => {
    let total = 0
    let reincidentes = 0
    for (const e of eqs) {
      const c = condicaoNoMes(r, e, mes)
      if (!ANOMALIA.includes(c)) continue
      total++
      const desde = reincidenteDesde(r.historico?.condicoes[e.local], mes, c, ANOMALIA)
      if (desde && desde < mes) reincidentes++
    }
    return { mes, total, reincidentes, indice: total ? reincidentes / total : null }
  })

  return { meses, execucao, anomalias, reincidencia }
}
