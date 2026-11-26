// Textos padrão de Situação e Recomendação por falha.
// PROVISÓRIO: será substituído pela base oficial de observações/recomendações (em criação).
// Frases do "eixo normal" vêm do modelo VMN-446M260503.

export interface TextoPadrao {
  id: string
  nome: string
  situacao: string
  recomendacao: string
}

export const TEXTOS_PADRAO: TextoPadrao[] = [
  {
    id: 'normal',
    nome: 'Normalidade operacional',
    situacao: 'Indicam níveis vibracionais dentro da normalidade operacional.',
    recomendacao: 'Manter acompanhamento preditivo.',
  },
  {
    id: 'atenuacao',
    nome: 'Atenuação após intervenção',
    situacao: 'Após intervenções observa atenuação nos níveis globais e envelope.',
    recomendacao: 'Manter acompanhamento preditivo.',
  },
  {
    id: 'folga-rotativa',
    nome: 'Folga rotativa (mancal)',
    situacao: 'Em análise do envelope observa-se frequências de 1XRPM seguida de seus harmônicos característico de folga rotativa.',
    recomendacao: 'Programar substituição do mancal.',
  },
  {
    id: 'desbalanceamento',
    nome: 'Desbalanceamento',
    situacao: 'Espectro de velocidade com predominância de 1XRPM na direção radial, característico de desbalanceamento.',
    recomendacao: 'Programar balanceamento do conjunto rotativo.',
  },
  {
    id: 'desalinhamento',
    nome: 'Desalinhamento',
    situacao: 'Presença de 1X e 2XRPM com componente axial elevada, característico de desalinhamento entre eixos.',
    recomendacao: 'Programar verificação e correção do alinhamento.',
  },
  {
    id: 'rolamento',
    nome: 'Defeito em rolamento',
    situacao: 'Envelope de aceleração com frequências características de defeito de rolamento (BPFO/BPFI/BSF/FTF).',
    recomendacao: 'Programar substituição do rolamento.',
  },
  {
    id: 'lubrificacao',
    nome: 'Deficiência de lubrificação',
    situacao: 'Elevação do carpete em alta frequência no espectro de aceleração, indicativo de deficiência de lubrificação.',
    recomendacao: 'Verificar e corrigir a lubrificação do mancal.',
  },
  {
    id: 'folga-estrutural',
    nome: 'Folga estrutural / base',
    situacao: 'Presença de harmônicos da rotação com variação direcional, característico de folga estrutural.',
    recomendacao: 'Verificar fixações, base e reaperto dos chumbadores.',
  },
  {
    id: 'engrenamento',
    nome: 'Engrenamento',
    situacao: 'Frequência de engrenamento com bandas laterais na rotação do eixo, indicando desgaste no engrenamento.',
    recomendacao: 'Programar inspeção do redutor e análise de óleo.',
  },
  {
    id: 'eletrico',
    nome: 'Falha elétrica',
    situacao: 'Presença de 2X a frequência de linha, característico de origem elétrica.',
    recomendacao: 'Programar inspeção elétrica do motor.',
  },
  {
    id: 'cavitacao',
    nome: 'Cavitação',
    situacao: 'Ruído de banda larga em alta frequência, característico de cavitação.',
    recomendacao: 'Verificar condições de sucção e operação da bomba.',
  },
]

import { lerConfig } from './config'

/** Textos em uso: os do administrador (Cadastros, VibDocs/config/textos-padrao.json) ou os provisórios acima. */
export const textosAtuais = (): TextoPadrao[] => lerConfig<{ textos: TextoPadrao[] }>('textos-padrao')?.textos ?? TEXTOS_PADRAO
export const textoPorId = (id: string) => textosAtuais().find((t) => t.id === id)
