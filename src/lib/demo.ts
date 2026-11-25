// Dados FICTÍCIOS para demonstração e testes da interface (nenhum dado real de cliente).
import type { LinhaControle } from './controle'

export function linhasDemo(): LinhaControle[] {
  const conds = ['1', '1', '1', '3', '1', '2', '1', '1', '4', '1', '9', '1']
  const nomes = ['BOMBA-A', 'BOMBA-B', 'PENEIRA-1', 'PENEIRA-2', 'TC-01', 'TC-02', 'EXAUSTOR', 'MOINHO', 'REDUTOR-1', 'VENTILADOR', 'COMPRESSOR', 'ROLO-1']
  return nomes.map((n, i) => ({
    ordem: String(900000 + i),
    descricao: `VIB_DEMO_${n}`,
    executado: conds[i] !== '9',
    local: `VM52-DEMO-AAA-${String(10 * (i + 1)).padStart(3, '0')}`,
    area: 'DEMO-AAA',
    condicao: conds[i],
    motorAcc: +(2 + i * 1.7).toFixed(2),
    motorVel: +(0.5 + i * 0.3).toFixed(2),
  }))
}
