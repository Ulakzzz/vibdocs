// Escala de condição usada nas planilhas de controle e no relatório (modelo VMN).
export const CONDICOES: Record<string, { nome: string; cor: string; texto: string }> = {
  '1': { nome: 'Normal', cor: '#00b050', texto: '#000' },
  '2': { nome: 'Pré-alerta', cor: '#ffff00', texto: '#000' },
  '3': { nome: 'Alerta', cor: '#ffc000', texto: '#000' },
  '4': { nome: 'Alarme', cor: '#ff0000', texto: '#000' },
  '5': { nome: 'Equipamento em manutenção', cor: '#7030a0', texto: '#fff' },
  '6': { nome: 'Equipamento inacessível', cor: '#0070c0', texto: '#fff' },
  '7': { nome: 'Condições técnicas', cor: '#77933c', texto: '#fff' },
  '8': { nome: 'Equipamento reserva', cor: '#00b0f0', texto: '#000' },
  '9': { nome: 'Equipamento sem produção', cor: '#bfbfbf', texto: '#000' },
  '10': { nome: 'Não visitado', cor: '#953735', texto: '#fff' },
  '11': { nome: 'Condição insegura', cor: '#595959', texto: '#fff' },
  '12': { nome: 'Indisponibilidade de acompanhamento', cor: '#fde9d9', texto: '#000' },
  '13': { nome: 'Equipamento desativado', cor: '#604a7b', texto: '#fff' },
  X: { nome: 'Não previsto no mês', cor: '#ffffff', texto: '#000' },
  R: { nome: 'Reprogramado', cor: '#ffffff', texto: '#000' },
}

/** Condições que geram página de anomalia (pré-alerta, alerta, alarme). */
export const eAnomalia = (c: string) => c === '2' || c === '3' || c === '4'

export const severidade = (c: string): 'Alarme' | 'Alerta' | 'Pré-alerta' | undefined =>
  c === '4' ? 'Alarme' : c === '3' ? 'Alerta' : c === '2' ? 'Pré-alerta' : undefined
