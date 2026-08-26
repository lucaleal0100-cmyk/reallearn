# StudyAI

StudyAI é uma ferramenta escolar com IA para verificar se o aluno realmente entendeu o conteúdo de um trabalho. O aluno cola um texto ou envia um PDF, recebe perguntas personalizadas, responde com as próprias palavras e recebe uma avaliação sem gabarito pronto.

## O que o site faz

- Permite colar texto manualmente ou enviar um PDF com texto selecionável.
- Permite preencher um perfil de aprendizagem sem diagnóstico médico.
- Gera 5 perguntas específicas sobre o trabalho enviado.
- Avalia as respostas em 3 níveis: `entendeu bem`, `entendeu parcialmente` ou `não entendeu`.
- Explica o motivo da avaliação e indica os conteúdos do trabalho que precisam de revisão.
- Inclui chat tutor com acesso ao texto, perguntas, respostas e avaliação.
- Oferece modos de estudo: vídeos e infográfico visual.
- Permite baixar o infográfico em PDF.
- Usa Gemini API no backend, sem expor a chave no frontend.

## Tecnologias

- Next.js com App Router
- TypeScript
- CSS simples
- Gemini API
- unpdf para extrair texto de PDFs sem CDN externa
- pdfkit para gerar PDF do infográfico
- YouTube Data API para buscar vídeos reais no modo Vídeo

## Como instalar

Entre na pasta do projeto:

```bash
cd "C:\Users\roger\OneDrive\Documents\New project\reallearn"
```

Instale as dependências:

```bash
npm install
```

## Como configurar

Crie um arquivo chamado `.env.local` dentro da pasta do projeto. Você pode copiar o exemplo:

```bash
copy .env.example .env.local
```

No arquivo `.env.local`, configure:

```env
GEMINI_API_KEY=sua_chave_do_gemini_aqui
GEMINI_MODEL=gemini-3.5-flash-lite
YOUTUBE_API_KEY=sua_chave_do_youtube_aqui
```

`GEMINI_MODEL` é opcional. O padrão do projeto é `gemini-3.5-flash-lite`, que é leve e ajuda a economizar limite gratuito.

`YOUTUBE_API_KEY` é necessário apenas para o modo Vídeo buscar links reais.

## Como rodar no localhost

```bash
npm run dev
```

Abra:

```text
http://localhost:3000
```

## Como testar

1. Abra o site local.
2. Preencha ou pule o perfil de aprendizagem.
3. Cole um texto ou clique em `Enviar PDF`.
4. Clique em `Testar meu conhecimento`.
5. Responda as 5 perguntas.
6. Clique em `Avaliar minhas respostas`.
7. Use as abas `Estudo` e `Chat` para revisar o conteúdo.

## Como testar o PDF

1. Clique em `Enviar PDF`.
2. Selecione um arquivo `.pdf` com até 10MB.
3. O PDF precisa ter texto selecionável.
4. O texto extraído será colocado automaticamente no campo `Texto do trabalho`.
5. Revise o texto e clique em `Testar meu conhecimento`.

PDFs escaneados como imagem podem não ter texto extraível. Nesse caso, use um PDF com texto selecionável ou cole o texto manualmente.

## Como publicar na Vercel

No painel da Vercel, entre no projeto e configure as variáveis em:

`Settings` > `Environment Variables`

Adicione:

```env
GEMINI_API_KEY=sua_chave_do_gemini
GEMINI_MODEL=gemini-3.5-flash-lite
YOUTUBE_API_KEY=sua_chave_do_youtube
```

Depois faça deploy pelo GitHub:

```bash
git status
git add .
git commit -m "Restore Gemini API integration"
git pull --rebase origin main
git push
```

A Vercel deve gerar um novo deploy automaticamente. Se não gerar, abra o projeto na Vercel e clique em `Redeploy`.

## Build de produção local

```bash
npm run build
npm run start
```

## Estrutura principal

```text
reallearn/
  app/
    lib/
      extractPdfText.ts
    api/
      lib/
        gemini.ts
        rateLimit.ts
      knowledge-test/
        route.ts
      tutor-chat/
        route.ts
      study-tools/
        route.ts
      video-search/
        route.ts
      infographic-pdf/
        route.ts
    globals.css
    layout.tsx
    page.tsx
  .env.example
  package.json
  README.md
  tsconfig.json
```

## Observações

- O arquivo `.env.local` não deve ser enviado para GitHub.
- A chave `GEMINI_API_KEY` deve ficar apenas no backend e nas variáveis da Vercel.
- O texto do trabalho precisa ter pelo menos 300 caracteres.
- As rotas de IA possuem limite simples por IP para reduzir abuso.
- O tutor e a avaliação foram instruídos a não entregar gabaritos prontos nem textos para copiar.
- O perfil de aprendizagem não é diagnóstico médico e não é salvo permanentemente.
