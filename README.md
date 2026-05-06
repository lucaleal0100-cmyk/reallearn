# RealLearn

RealLearn é uma ferramenta escolar com IA para verificar se o aluno realmente entendeu o conteúdo de um trabalho. O aluno cola o texto, recebe 5 perguntas personalizadas, responde com as próprias palavras e recebe uma avaliação sem gabarito pronto.

## O que o site faz

- Permite colar texto manualmente ou enviar um PDF com texto selecionável.
- Gera 5 perguntas específicas sobre o trabalho enviado.
- Inclui um chat tutor para tirar dúvidas sobre o texto ou PDF.
- Evita respostas prontas, gabaritos e pistas óbvias.
- Avalia as respostas do aluno em 3 níveis:
  - entendeu bem
  - entendeu parcialmente
  - não entendeu
- Explica o motivo da avaliação.
- Sugere o que estudar melhor.
- Mantém a chave da Gemini API apenas no backend.

## Tecnologias

- Next.js com App Router
- TypeScript
- CSS simples
- unpdf para extrair texto de PDFs sem CDN externa
- API Gemini do Google via rota backend em `/api/knowledge-test`
- Chat tutor via rota backend em `/api/tutor-chat`

## Como instalar

Entre na pasta do projeto:

```bash
cd reallearn
```

Instale as dependências:

```bash
npm install
```

## Como configurar a chave da Gemini API

Crie um arquivo chamado `.env.local` dentro da pasta `reallearn`.

Você pode copiar o exemplo:

```bash
copy .env.example .env.local
```

No arquivo `.env.local`, troque o valor de `GEMINI_API_KEY` pela sua chave real:

```env
GEMINI_API_KEY=sua_chave_da_gemini_aqui
GEMINI_MODEL=gemini-2.5-flash
```

Importante: nunca coloque a chave da Gemini API no frontend. Este projeto usa a chave apenas na rota segura do backend.

## Como rodar

Inicie o servidor local:

```bash
npm run dev
```

Abra no navegador:

```text
http://localhost:3000
```

## Como testar o PDF

1. Abra o site local.
2. Clique em `Enviar PDF`.
3. Selecione um arquivo `.pdf` com até 10MB.
4. O texto extraído será colocado automaticamente no campo `Texto do trabalho`.
5. Revise o texto e clique em `Testar meu conhecimento`.

## Como testar o chat

1. Cole um texto ou envie um PDF.
2. Abra a aba `Chat`.
3. Digite uma dúvida sobre o conteúdo.
4. O tutor responde usando o texto enviado como contexto, sem entregar gabarito pronto.

Observações:

- PDFs escaneados como imagem podem não ter texto extraível.
- Se a extração falhar, use um PDF com texto selecionável ou cole o conteúdo manualmente.
- A extração do PDF acontece no navegador com `unpdf`, sem worker de CDN e sem enviar o PDF para uma rota serverless.

## Como gerar uma versão de produção

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
      knowledge-test/
        route.ts
      tutor-chat/
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
- Se quiser usar outro modelo Gemini, altere `GEMINI_MODEL` no `.env.local`.
- O texto do trabalho precisa ter pelo menos 300 caracteres para gerar perguntas melhores.
- Para publicar na Vercel, configure `GEMINI_API_KEY` nas variáveis de ambiente do projeto e faça o deploy normalmente.
