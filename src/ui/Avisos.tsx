// Avisos rápidos (toasts) no canto da tela: entram deslizando e somem sozinhos.
// Qualquer parte do app chama avisar('texto') sem precisar passar estado adiante.
import { useEffect, useState } from 'react'

type Tipo = 'ok' | 'erro' | 'info'
interface Aviso {
  id: number
  texto: string
  tipo: Tipo
  saindo?: boolean
}

export function avisar(texto: string, tipo: Tipo = 'info') {
  window.dispatchEvent(new CustomEvent('vibdocs:aviso', { detail: { texto, tipo } }))
}

export function Avisos() {
  const [lista, setLista] = useState<Aviso[]>([])
  useEffect(() => {
    let n = 0
    const chegou = (ev: Event) => {
      const { texto, tipo } = (ev as CustomEvent<{ texto: string; tipo: Tipo }>).detail
      const id = ++n
      setLista((l) => [...l.slice(-3), { id, texto, tipo }])
      const dur = tipo === 'erro' ? 7000 : 4000
      setTimeout(() => setLista((l) => l.map((a) => (a.id === id ? { ...a, saindo: true } : a))), dur)
      setTimeout(() => setLista((l) => l.filter((a) => a.id !== id)), dur + 300)
    }
    addEventListener('vibdocs:aviso', chegou)
    return () => removeEventListener('vibdocs:aviso', chegou)
  }, [])
  return (
    <div className="avisos" role="status" aria-live="polite">
      {lista.map((a) => (
        <div key={a.id} className={`aviso aviso-${a.tipo} ${a.saindo ? 'saindo' : ''}`}>
          <span className="aviso-icone" aria-hidden>
            {a.tipo === 'ok' ? '✓' : a.tipo === 'erro' ? '!' : 'i'}
          </span>
          <span>{a.texto}</span>
          <button aria-label="Fechar aviso" onClick={() => setLista((l) => l.filter((x) => x.id !== a.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
