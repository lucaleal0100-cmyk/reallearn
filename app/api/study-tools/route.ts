import { NextResponse } from "next/server";
import { GeminiApiError, generateGeminiContent } from "../lib/gemini";
import { enforceRateLimit } from "../lib/rateLimit";

type StudyMode = "infographic" | "text" | "interactive";

const studyPrompt = `Você é um professor tutor exigente, claro e cuidadoso.
Personalize o estudo usando apenas as necessidades educacionais relatadas pelo aluno.
Não faça diagnóstico médico, psicológico ou neurodivergente.
Não diga que o aluno tem TDAH, autismo, dislexia ou qualquer condição.
Se houver diagnóstico informado pelo aluno, trate apenas como informação declarada por ele e adapte preferências de estudo sem confirmar nem contestar.
Não entregue gabaritos prontos. Ensine, dê exemplos e proponha perguntas para o aluno responder com as próprias palavras.`;

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

    if (!["infographic", "text", "interactive"].includes(mode)) {
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
  const instructions = {
    infographic: `Crie um infográfico textual organizado em blocos visuais.
Use título, seções curtas, esquema/diagrama em texto, exemplos simples e resumo final.
Inclua uma lista "Elementos visuais sugeridos" com imagens, ícones ou ilustrações relevantes para o tema, sem inventar links.`,
    text: `Crie uma explicação em texto personalizada.
Ajuste profundidade, linguagem, tamanho das partes e exemplos conforme o perfil educacional informado.
Divida em partes menores se o aluno relatou dificuldade de foco ou concentração.`,
    interactive: `Crie um estudo interativo gradual.
Ensine em pequenas etapas, proponha desafios curtos e faça perguntas de treino.
Não entregue as respostas imediatamente; incentive o aluno a raciocinar antes.`
  }[input.mode];

  const rawText = await generateGeminiContent({
    systemInstruction: {
      parts: [{ text: studyPrompt }]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${instructions}

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
      temperature: 0.25
    }
  });

  return rawText;
}
