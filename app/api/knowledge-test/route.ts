import { NextResponse } from "next/server";
import {
  GeminiApiError,
  generateGeminiContent
} from "../lib/gemini";
import { enforceRateLimit } from "../lib/rateLimit";

type Question = {
  id: string;
  question: string;
  focus?: string;
};

type Answer = {
  id: string;
  question: string;
  answer: string;
};

const teacherPrompt = `Você é um professor avaliador exigente, mas justo.

Sua função é verificar se o aluno realmente entendeu o conteúdo.

Não entregue respostas prontas, gabaritos ou textos completos para copiar.

Faça perguntas que obriguem o aluno a explicar com as próprias palavras.

Ao avaliar, identifique quais conteúdos específicos precisam ser estudados melhor.

Responda sempre em português do Brasil.

Não mostre raciocínio interno.

Forneça apenas o resultado solicitado.`;

export async function POST(request: Request) {
  const rateLimitResponse = enforceRateLimit(request, {
    keyPrefix: "knowledge-test",
    maxRequests: 12,
    windowMs: 60 * 1000,
    message:
      "Muitas solicitações em pouco tempo. Aguarde alguns segundos antes de tentar novamente."
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();

    const mode = body.mode;
    const workText = String(body.workText ?? "").trim();
    const profile = body.profile ?? null;

    if (workText.length < 300) {
      return NextResponse.json(
        {
          error:
            "Envie um texto de trabalho com pelo menos 300 caracteres."
        },
        { status: 400 }
      );
    }

    if (workText.length > 18000) {
      return NextResponse.json(
        {
          error:
            "O texto está muito longo. Reduza para até 18.000 caracteres."
        },
        { status: 400 }
      );
    }

    if (mode === "questions") {
      const questions =
        await generateQuestionsWithGemini(workText, profile);

      return NextResponse.json({ questions });
    }

    if (mode === "evaluate") {
      const questions = Array.isArray(body.questions)
        ? (body.questions as Question[])
        : [];

      const answers = Array.isArray(body.answers)
        ? (body.answers as Answer[])
        : [];

      if (
        questions.length !== 5 ||
        answers.length !== 5
      ) {
        return NextResponse.json(
          {
            error:
              "A avaliação precisa de 5 perguntas e 5 respostas."
          },
          { status: 400 }
        );
      }

      if (
        answers.some(
          (item) =>
            !String(item.answer ?? "").trim()
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Todas as respostas precisam ser preenchidas."
          },
          { status: 400 }
        );
      }

      const evaluation =
        await evaluateKnowledgeWithGemini(
          workText,
          questions,
          answers,
          profile
        );

      return NextResponse.json({
        evaluation
      });
    }

    return NextResponse.json(
      {
        error: "Modo inválido."
      },
      { status: 400 }
    );
  } catch (error) {
    console.error(error);

    if (error instanceof GeminiApiError) {
      return NextResponse.json(
        {
          error: error.message
        },
        {
          status: error.status
        }
      );
    }

    return NextResponse.json(
      {
        error:
          "Ocorreu um erro ao processar a solicitação. Tente novamente."
      },
      { status: 500 }
    );
  }
}

async function generateQuestionsWithGemini(
  workText: string,
  profile: unknown
) {
  const rawText =
    await generateGeminiContent({
      systemInstruction: {
        parts: [{ text: teacherPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Crie exatamente 5 perguntas sobre o trabalho abaixo.

Regras:

- Faça exatamente 5 perguntas.
- Não entregue respostas.
- Não entregue gabaritos.
- Não dê pistas óbvias.
- Faça perguntas específicas sobre o conteúdo.
- O aluno deve responder com as próprias palavras.
- Evite perguntas de sim ou não.
- Adapte a complexidade e a linguagem ao perfil educacional, se ele existir.
- Não mencione diagnóstico nem tire conclusões médicas.
- Escreva em português do Brasil.
- Responda apenas em JSON.

Formato obrigatório:

{
  "questions": [
    {
      "id": "q1",
      "question": "pergunta",
      "focus": "tema avaliado"
    }
  ]
}

Trabalho do aluno:

${workText}

Perfil educacional declarado:
${JSON.stringify(profile, null, 2)}`
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

  const parsed = parseJson(rawText);

  if (
    !Array.isArray(parsed.questions) ||
    parsed.questions.length !== 5
  ) {
    throw new Error(
      "A IA não retornou 5 perguntas válidas."
    );
  }

  return parsed.questions.map(
    (item: Question, index: number) => ({
      id: `q${index + 1}`,
      question: String(
        item.question ?? ""
      ).trim(),
      focus: String(item.focus ?? "").trim()
    })
  );
}

async function evaluateKnowledgeWithGemini(
  workText: string,
  questions: Question[],
  answers: Answer[],
  profile: unknown
) {
  const rawText =
    await generateGeminiContent({
      systemInstruction: {
        parts: [{ text: teacherPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Avalie as respostas do aluno com base no trabalho original.

Classifique o entendimento como apenas uma destas opções:

"entendeu bem"

"entendeu parcialmente"

"não entendeu"

Regras:

- Não entregue o gabarito.
- Não entregue respostas corretas prontas.
- Analise se o aluno realmente entendeu.
- Explique brevemente o motivo.
- Identifique conteúdos específicos que precisam ser revisados.
- Não classifique a dificuldade como interpretação, escrita, atenção ou outra habilidade genérica.
- Cite temas e conceitos do próprio conteúdo enviado.
- Use o perfil apenas para adaptar sugestões de estudo, ritmo e formato de revisão.
- Não apresente diagnóstico, probabilidade de diagnóstico ou inferência clínica.
- Faça feedback individual para cada uma das 5 perguntas.
- Responda em português do Brasil.
- Responda apenas em JSON válido.

Formato obrigatório:

{
  "level": "entendeu bem",
  "explanation": "explicação geral",
  "studySuggestions": [
    "conteúdo para revisar"
  ],
  "contentToImprove": [
    {
      "topic": "conteúdo específico",
      "reason": "motivo",
      "whatToStudy": "o que estudar"
    }
  ],
  "questionFeedback": [
    {
      "id": "q1",
      "summary": "comentário",
      "status": "bom",
      "suggestion": "como melhorar"
    }
  ]
}

O campo "status" deve usar somente:

"bom"

"parcial"

"insuficiente"

Trabalho original:

${workText}

Perguntas:

${JSON.stringify(
  questions,
  null,
  2
)}

Respostas do aluno:

${JSON.stringify(
  answers,
  null,
  2
)}

Perfil educacional declarado:
${JSON.stringify(profile, null, 2)}`
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

  const parsed = parseJson(rawText);

  const validLevels = [
    "entendeu bem",
    "entendeu parcialmente",
    "não entendeu"
  ];

  if (!validLevels.includes(parsed.level)) {
    throw new Error(
      "A IA não retornou uma avaliação válida."
    );
  }

  return parsed;
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
