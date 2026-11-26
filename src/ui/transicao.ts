// Troca de tela/aba com a View Transitions API (Edge/Chrome): o navegador faz o "crossfade" entre o antes e o depois.
// Sem suporte, a troca acontece na hora.
import { flushSync } from 'react-dom'

export function comTransicao(mudar: () => void) {
  const doc = document as Document & { startViewTransition?: (f: () => void) => unknown }
  if (!doc.startViewTransition) return mudar()
  doc.startViewTransition(() => flushSync(mudar))
}
