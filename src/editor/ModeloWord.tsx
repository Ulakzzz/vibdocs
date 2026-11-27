// Escolha do modelo .docx usado na exportação para Word (fica no SharePoint/navegador, nunca no site).
import { useEffect, useRef, useState } from 'react'
import { guardarModelo, obterModelo, type Modelo } from '../lib/modelo'
import { btnMini } from './campos'

export function ModeloWord({ raiz, usina, contrato = 'Vallourec' }: { raiz?: FileSystemDirectoryHandle; usina: string; contrato?: string }) {
  const [modelo, setModelo] = useState<Modelo | null>()
  // a que relatórios o modelo enviado vale: todos, só o contrato, ou só contrato + usina
  const [escopo, setEscopo] = useState<'geral' | 'contrato' | 'usina'>('geral')
  const [erro, setErro] = useState('')
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    obterModelo(raiz, usina, contrato).then((m) => vivo && setModelo(m ?? null))
    return () => {
      vivo = false
    }
  }, [raiz, usina, contrato])

  const escolher = async (arq?: File) => {
    if (!arq) return
    setErro('')
    try {
      const { validarModelo } = await import('../lib/modeloWord')
      const v = await validarModelo(await arq.arrayBuffer())
      if (!v.ok) setErro(`Atenção: não encontrei no arquivo ${v.faltando.map((f) => `"${f}"`).join(', ')}. Confira se é o modelo do relatório.`)
      setModelo(await guardarModelo(arq, raiz, escopo === 'geral' ? undefined : escopo === 'contrato' ? contrato : `${contrato}-${usina}`))
      window.dispatchEvent(new Event('vibdocs:modelo'))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="rounded-[14px] bg-nevoa p-3 text-xs leading-relaxed">
      <div className="flex flex-wrap items-center gap-2">
        <b>Modelo do Word: </b>
        <select className="campo w-auto py-0.5 text-xs" value={escopo} onChange={(e) => setEscopo(e.target.value as typeof escopo)} aria-label="O modelo enviado vale para">
          <option value="geral">enviar para todos os contratos</option>
          <option value="contrato">enviar só para {contrato}</option>
          <option value="usina">
            enviar só para {contrato} · {usina}
          </option>
        </select>
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
