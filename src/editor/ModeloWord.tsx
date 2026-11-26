// Escolha do modelo .docx usado na exportação para Word (fica no SharePoint/navegador, nunca no site).
import { useEffect, useRef, useState } from 'react'
import { guardarModelo, obterModelo, type Modelo } from '../lib/modelo'
import { btnMini } from './campos'

export function ModeloWord({ raiz, usina }: { raiz?: FileSystemDirectoryHandle; usina: string }) {
  const [modelo, setModelo] = useState<Modelo | null>()
  const [erro, setErro] = useState('')
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    obterModelo(raiz, usina).then((m) => vivo && setModelo(m ?? null))
    return () => {
      vivo = false
    }
  }, [raiz, usina])

  const escolher = async (arq?: File) => {
    if (!arq) return
    setErro('')
    try {
      const { validarModelo } = await import('../lib/modeloWord')
      const v = await validarModelo(await arq.arrayBuffer())
      if (!v.ok) setErro(`Atenção: não encontrei no arquivo ${v.faltando.map((f) => `"${f}"`).join(', ')}. Confira se é o modelo do relatório.`)
      setModelo(await guardarModelo(arq, raiz))
      window.dispatchEvent(new Event('vibdocs:modelo'))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="rounded-[14px] bg-nevoa p-3 text-xs leading-relaxed">
      <div className="flex flex-wrap items-center gap-2">
        <b>Modelo do Word: </b>
        {modelo === undefined ? (
          <span className="text-cinza">procurando…</span>
        ) : modelo ? (
          <span data-modelo={modelo.nome}>
            {modelo.nome} · {modelo.origem === 'pasta' ? 'no SharePoint (VibDocs/config)' : 'neste navegador'}
          </span>
        ) : (
          <span className="text-cinza">nenhum. O Word sai no layout simples até você carregar o .docx modelo.</span>
        )}
        <button type="button" className={`${btnMini} ml-auto`} onClick={() => entrada.current?.click()}>
          {modelo ? 'Trocar modelo' : 'Carregar modelo'}
        </button>
        <input
          ref={entrada}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          aria-label="Arquivo do modelo do Word"
          onChange={(e) => {
            void escolher(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      <p className="mt-1 text-cinza">
        O relatório é escrito dentro do próprio modelo: capa, moldura, cabeçalho, gráficos e páginas de anomalia ficam com a mesma
        formatação.
      </p>
      {erro && <p className="mt-1 text-[#b42318]">{erro}</p>}
    </div>
  )
}
