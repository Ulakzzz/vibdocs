# VibDocs

Gerador dos relatórios mensais de **análise de vibração** (MGS / Pruftechnik) para o contrato Vallourec.

- Site estático (React + TypeScript + Vite), publicado no GitHub Pages.
- **Este repositório não contém dados.** Planilhas, rascunhos e relatórios ficam no SharePoint. O site acessa esses arquivos pela pasta que cada técnico sincroniza com o OneDrive (File System Access API, no Edge ou no Chrome). Nada depende de aprovação do TI.
- Sem a pasta sincronizada, o site funciona em modo manual (importar `.xlsx`, baixar o rascunho e o PDF).

Os requisitos e levantamentos internos ficam em `docs/`, que **não é versionado** porque contém informações internas.

## Desenvolvimento

```
npm install
npm run dev          # http://localhost:5173
npm run build        # gera dist/
npx tsx scripts/testar-leitura.ts "<caminho da planilha de controle .xlsx>"
```

O deploy é automático a cada push na branch `main` (`.github/workflows/pages.yml`).
