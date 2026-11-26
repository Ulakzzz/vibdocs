// Número em "odômetro": cada algarismo é uma fita vertical que rola até o valor novo
// (ideia do CodePen "Neu Times"). Vírgula, % e sinais ficam parados.
export function Contador({ valor, sufixo = '', casas = 0 }: { valor: number | null; sufixo?: string; casas?: number }) {
  if (valor === null) return <>–</>
  const texto = valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + sufixo
  return (
    <span className="odometro" aria-label={texto}>
      {[...texto].map((ch, i) =>
        /\d/.test(ch) ? (
          // a chave conta da direita: unidades continuam sendo a mesma fita quando o número cresce
          <span key={`d${texto.length - i}`} className="fita" aria-hidden>
            <span style={{ transform: `translateY(-${Number(ch) * 10}%)` }}>
              {'0123456789'.split('').map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={`c${texto.length - i}`} aria-hidden>
            {ch}
          </span>
        ),
      )}
    </span>
  )
}

/** Onda de carregamento (ideia do CodePen "Pure CSS Waves"): três ondas amarelas que correm. */
export function Carregando({ texto }: { texto: string }) {
  return (
    <div className="carregando" role="status">
      <svg viewBox="0 0 120 28" aria-hidden>
        {[0, 1, 2].map((k) => (
          <path key={k} className={`onda-c onda-c${k}`} d="M0 14 Q 7.5 4 15 14 T 30 14 T 45 14 T 60 14 T 75 14 T 90 14 T 105 14 T 120 14 T 135 14 T 150 14" />
        ))}
      </svg>
      <span>{texto}</span>
    </div>
  )
}

/** Botão de copiar com o ícone de prancheta que vira "ok" (ideia do CodePen "Clipboard animation"). */
export function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  return (
    <button
      type="button"
      className="copiar"
      title={`Copiar ${rotulo}`}
      aria-label={`Copiar ${rotulo}`}
      onClick={(e) => {
        const b = e.currentTarget
        navigator.clipboard?.writeText(texto).then(() => {
          b.classList.add('copiado')
          setTimeout(() => b.classList.remove('copiado'), 1400)
        })
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect className="prancheta" x="6" y="4" width="12" height="17" rx="2" />
        <path className="prancheta" d="M9 4V3h6v1" />
        <path className="visto" d="M8.5 12.5l2.5 2.5 4.5-5" />
      </svg>
    </button>
  )
}
