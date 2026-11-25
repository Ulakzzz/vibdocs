// Dados FICTÍCIOS para demonstração e testes da interface (nenhum dado real de cliente).
import type { LinhaControle } from './controle'
import type { FonteHistorico } from './historico'

const NOMES = ['BOMBA-A', 'BOMBA-B', 'PENEIRA-1', 'PENEIRA-2', 'TC-01', 'TC-02', 'EXAUSTOR', 'MOINHO', 'REDUTOR-1', 'VENTILADOR', 'COMPRESSOR', 'ROLO-1']
const tag = (i: number) => `VM52-DEMO-AAA-${String(10 * (i + 1)).padStart(3, '0')}`

export function linhasDemo(): LinhaControle[] {
  const conds = ['1', '1', '1', '3', '1', '2', '1', '1', '4', '1', '9', '1']
  return NOMES.map((n, i) => ({
    ordem: String(900000 + i),
    descricao: `VIB_DEMO_${n}`,
    executado: conds[i] !== '9',
    local: tag(i),
    area: 'DEMO-AAA',
    condicao: conds[i],
    motorAcc: +(2 + i * 1.7).toFixed(2),
    motorVel: +(0.5 + i * 0.3).toFixed(2),
  }))
}

/** Meses anteriores fictícios, relativos ao mês de referência (AAAA-MM). */
export function historicoDemo(mesRef: string): FonteHistorico[] {
  const [a, m] = mesRef.split('-').map(Number)
  const antes = (n: number) => {
    const d = new Date(a, m - 1 - n, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  // Medições 8, 6, 4 e 2 meses antes (da mais antiga para a mais recente), por índice do equipamento:
  const seq: Record<number, string[]> = {
    1: ['1', '1', '2', '1'], // BOMBA-B: teve pré-alerta, hoje normal
    3: ['1', '3', '3', '3'], // PENEIRA-2: alerta há 3 medições → reincidente desde 6 meses atrás
    5: ['1', '1', '1', '1'], // TC-02: sempre normal → anomalia nova, sem reincidência
    8: ['3', '1', '3', '4'], // REDUTOR-1: a normal quebra a sequência → reincidente desde 4 meses atrás
  }
  return [8, 6, 4, 2].map((n, k) => ({
    mesRef: antes(n),
    nome: `demonstração ${antes(n)}`,
    linhas: NOMES.map((_, i) => ({ local: tag(i), condicao: seq[i]?.[k] ?? '1' })),
  }))
}
