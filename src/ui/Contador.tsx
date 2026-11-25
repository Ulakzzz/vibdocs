// Número que conta até o valor quando ele muda (uma vez por mudança). Sem animação se o usuário reduzir movimento.
import { useEffect, useRef, useState } from 'react'

export function Contador({ valor, sufixo = '', casas = 0 }: { valor: number | null; sufixo?: string; casas?: number }) {
  const [mostrado, setMostrado] = useState(valor ?? 0)
  const anterior = useRef(valor ?? 0)
  useEffect(() => {
    if (valor === null) return
    const de = anterior.current
    anterior.current = valor
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || de === valor) {
      setMostrado(valor)
      return
    }
    const inicio = performance.now()
    let q = 0
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / 600)
      const suave = 1 - (1 - p) ** 3
      setMostrado(de + (valor - de) * suave)
      if (p < 1) q = requestAnimationFrame(passo)
    }
    q = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(q)
  }, [valor])
  if (valor === null) return <>–</>
  return (
    <>
      {mostrado.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}
      {sufixo}
    </>
  )
}
