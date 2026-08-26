import { NextResponse } from "next/server";
import { GeminiApiError, generateGeminiContent } from "../lib/gemini";
import { enforceRateLimit } from "../lib/rateLimit";

type StudyMode = "infographic";

const studyPrompt = `Você é um professor tutor exigente, claro e cuidadoso.
Personalize o estudo usando apenas as necessidades educacionais relatadas pelo aluno.
Não faça diagnóstico médico, psicológico ou neurodivergente.
Não diga que o aluno tem TDAH, autismo, dislexia ou qualquer condição.
Se houver diagnóstico informado pelo aluno, trate apenas como informação declarada por ele e adapte preferências de estudo sem confirmar nem contestar.
Não entregue gabaritos prontos. Ensine com estrutura visual, exemplos curtos e perguntas para o aluno responder com as próprias palavras.`;

export async function POST(request: Request) {
  const rateLimitResponse = enforceRateLimit(request, {
    keyPrefix: "study-tools",
    maxRequests: 10,
    windowMs: 60 * 1000,
    message: "Muitas solicitações de estudo em pouco tempo. Aguarde alguns segundos antes de tentar novamente."
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const mode = String(body.mode ?? "") as StudyMode;
    const workText = String(body.workText ?? "").trim();
    const profile = body.profile ?? null;
    const evaluation = body.evaluation ?? null;
    const questions = Array.isArray(body.questions) ? body.questions : [];
    const answers = Array.isArray(body.answers) ? body.answers : [];

    if (mode !== "infographic") {
      return NextResponse.json({ error: "Modo de estudo inválido." }, { status: 400 });
    }

    if (workText.length < 300) {
      return NextResponse.json(
        { error: "Adicione um texto ou PDF com pelo menos 300 caracteres antes de gerar o estudo." },
        { status: 400 }
      );
    }

    const result = await generateStudyMaterial({
      mode,
      workText,
      profile,
      evaluation,
      questions,
      answers
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error(error);

    if (error instanceof GeminiApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Ocorreu um erro ao gerar o material de estudo. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}

async function generateStudyMaterial(input: {
  mode: StudyMode;
  workText: string;
  profile: unknown;
  evaluation: unknown;
  questions: unknown[];
  answers: unknown[];
}) {
  const rawText = await generateGeminiContent({
    systemInstruction: {
      parts: [{ text: studyPrompt }]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Crie um infográfico educacional estruturado sobre o conteúdo em que o aluno precisa melhorar.

O resultado deve ser visualmente útil para a interface do StudyAI, com blocos curtos, relações, comparações e perguntas de treino.
Não entregue gabarito.
Não faça texto corrido longo.
Não invente links.
Se o conteúdo tiver sequência histórica, processo, etapas ou evolução, preencha timeline.
Se não fizer sentido ter linha do tempo, deixe timeline como array vazio.
Use linguagem adaptada ao perfil educacional declarado.

Responda apenas em JSON válido neste formato:

{
  "title": "título curto do infográfico",
  "centralIdea": "ideia central em até 180 caracteres",
  "visualMetaphor": "imagem mental simples para entender o tema",
  "sections": [
    {
      "title": "bloco visual",
      "summary": "explicação curta",
      "icon": "palavra-ícone curta",
      "importance": 80
    }
  ],
  "connections": [
    {
      "from": "conceito A",
      "to": "conceito B",
      "label": "relação entre eles"
    }
  ],
  "timeline": [
    {
      "label": "momento ou etapa",
      "detail": "o que acontece"
    }
  ],
  "comparison": [
    {
      "left": "conceito 1",
      "right": "conceito 2",
      "note": "diferença ou relação"
    }
  ],
  "quickSummary": [
    "frase curta para memorizar"
  ],
  "reviewQuestions": [
    "pergunta de treino sem gabarito"
  ]
}

Regras de tamanho:
- Crie de 4 a 6 sections.
- Crie de 2 a 4 connections.
- Crie de 0 a 5 itens em timeline.
- Crie de 2 a 4 itens em comparison.
- Crie de 3 a 5 quickSummary.
- Crie de 3 a 5 reviewQuestions.
- importance deve ser número de 35 a 100.

Contexto para personalização:
Perfil educacional declarado pelo aluno:
${JSON.stringify(input.profile, null, 2)}

Avaliação:
${JSON.stringify(input.evaluation, null, 2)}

Perguntas:
${JSON.stringify(input.questions, null, 2)}

Respostas:
${JSON.stringify(input.answers, null, 2)}

Texto original:
${input.workText.slice(0, 18000)}

Responda em português do Brasil.
Não mostre raciocínio interno.`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.25
    }
  });

  return parseJson(rawText);
}

function parseJson(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  return JSON.parse(cleaned);
}
