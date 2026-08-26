import { NextResponse } from "next/server";
import {
  GeminiApiError,
  generateGeminiContent
} from "../lib/gemini";
import { enforceRateLimit } from "../lib/rateLimit";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type QuestionContext = {
  id: string;
  question: string;
  focus?: string;
};

type AnswerContext = {
  id: string;
  question: string;
  answer: string;
};

const tutorPrompt = `Você é o tutor educacional do StudyAI.

Sua função é ajudar o aluno a realmente entender o conteúdo estudado.

Regras:
- Responda sempre em português do Brasil.
- Seja claro, direto e didático.
- Não mostre raciocínio interno.
- Não entregue gabaritos prontos.
- Não faça a atividade inteira pelo aluno.
- Não entregue textos completos para copiar.
- Explique o conceito e ajude o aluno a raciocinar.
- Use principalmente o conteúdo enviado pelo aluno.
- Considere as perguntas, respostas e avaliação quando estiverem disponíveis.
- Se o aluno tiver dificuldade, simplifique a explicação.
- Use exemplos simples quando isso ajudar.
- Se o aluno pedir material de estudo, explique o conteúdo e depois crie novas perguntas de treino.
- Não coloque gabarito nas perguntas de treino.
- Evite respostas desnecessariamente longas.`;

export async function POST(request: Request) {
  const rateLimitResponse = enforceRateLimit(request, {
    keyPrefix: "tutor-chat",
    maxRequests: 18,
    windowMs: 60 * 1000,
    message:
      "Muitas mensagens em pouco tempo. Aguarde alguns segundos antes de falar com o tutor novamente."
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();

    const workText = String(body.workText ?? "").trim();
    const message = String(body.message ?? "").trim();

    const history = normalizeHistory(body.history);
    const questions = normalizeQuestions(body.questions);
    const answers = normalizeAnswers(body.answers);
    const evaluation = normalizeEvaluation(body.evaluation);

    if (workText.length < 300) {
      return NextResponse.json(
        {
          error:
            "Adicione um texto ou PDF com pelo menos 300 caracteres antes de usar o chat."
        },
        { status: 400 }
      );
    }

    if (message.length < 2) {
      return NextResponse.json(
        {
          error: "Digite uma dúvida para enviar ao tutor."
        },
        { status: 400 }
      );
    }

    if (message.length > 1200) {
      return NextResponse.json(
        {
          error:
            "Sua pergunta está muito longa. Reduza para até 1.200 caracteres."
        },
        { status: 400 }
      );
    }

    const profile = normalizeEvaluation(body.profile);

    const reply = await callGemini(
      workText,
      message,
      history,
      questions,
      answers,
      evaluation,
      profile
    );

    return NextResponse.json({ reply });
  } catch (error) {
    console.error(error);

    if (error instanceof GeminiApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        error:
          "Ocorreu um erro ao responder a dúvida. Tente novamente."
      },
      { status: 500 }
    );
  }
}

function normalizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(-6)
    .map((item): ChatMessage => {
      const candidate = item as Partial<ChatMessage>;

      return {
        role:
          candidate.role === "assistant"
            ? "assistant"
            : "user",
        content: String(candidate.content ?? "")
          .trim()
          .slice(0, 1000)
      };
    })
    .filter((item) => item.content);
}

function normalizeQuestions(
  value: unknown
): QuestionContext[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 5)
    .map((item, index): QuestionContext => {
      const candidate =
        item as Partial<QuestionContext>;

      return {
        id: String(
          candidate.id ?? `q${index + 1}`
        ).trim(),

        question: String(
          candidate.question ?? ""
        )
          .trim()
          .slice(0, 800),

        focus: String(candidate.focus ?? "")
          .trim()
          .slice(0, 200)
      };
    })
    .filter((item) => item.question);
}

function normalizeAnswers(
  value: unknown
): AnswerContext[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 5)
    .map((item, index): AnswerContext => {
      const candidate =
        item as Partial<AnswerContext>;

      return {
        id: String(
          candidate.id ?? `q${index + 1}`
        ).trim(),

        question: String(
          candidate.question ?? ""
        )
          .trim()
          .slice(0, 800),

        answer: String(
          candidate.answer ?? ""
        )
          .trim()
          .slice(0, 1200)
      };
    })
    .filter(
      (item) => item.question || item.answer
    );
}

function normalizeEvaluation(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value;
}

async function callGemini(
  workText: string,
  message: string,
  history: ChatMessage[],
  questions: QuestionContext[],
  answers: AnswerContext[],
  evaluation: unknown,
  profile: unknown
) {
  const conversation = history
    .map(
      (item) =>
        `${
          item.role === "user"
            ? "Aluno"
            : "Tutor"
        }: ${item.content}`
    )
    .join("\n");

  return generateGeminiContent({
    systemInstruction: {
      parts: [{ text: tutorPrompt }]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `CONTEÚDO DO ALUNO:

${workText.slice(0, 18000)}

PERGUNTAS DO TESTE:

${
  questions.length
    ? JSON.stringify(questions, null, 2)
    : "Nenhuma pergunta registrada."
}

RESPOSTAS DO ALUNO:

${
  answers.length
    ? JSON.stringify(answers, null, 2)
    : "Nenhuma resposta registrada."
}

AVALIAÇÃO:

${
  evaluation
    ? JSON.stringify(
        evaluation,
        null,
        2
      ).slice(0, 4000)
    : "Nenhuma avaliação registrada."
}

PERFIL EDUCACIONAL DECLARADO:

${
  profile
    ? JSON.stringify(profile, null, 2).slice(0, 3000)
    : "Nenhum perfil preenchido."
}

HISTÓRICO RECENTE:

${conversation || "Sem histórico anterior."}

PERGUNTA ATUAL DO ALUNO:

${message}

Responda diretamente à pergunta do aluno em português do Brasil.
Use o conteúdo fornecido como contexto.
Não mostre raciocínio interno.

Se a dúvida for sobre os conteúdos a melhorar, entregue um material de estudo em texto e depois faça perguntas de treino sobre esse conteúdo, sem gabarito.`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.35
    }
  });
}
