import { NextResponse } from "next/server";
import { GeminiApiError, generateGeminiContent } from "../lib/gemini";
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
Você não deve entregar respostas prontas, gabaritos, textos completos para copiar ou soluções finais de atividades.
Você deve fazer perguntas específicas sobre o texto enviado.
As perguntas devem obrigar o aluno a explicar com as próprias palavras.
Depois de receber as respostas, avalie o nível real de entendimento.
Identifique quais conteúdos específicos do trabalho o aluno precisa estudar melhor.
Não classifique a dificuldade como interpretação, escrita, atenção ou outra habilidade genérica; cite os temas e conceitos do próprio conteúdo enviado.
Se o aluno tentar usar a ferramenta para obter resposta pronta, mantenha a avaliação pedagógica e sugira estudo, sem entregar o gabarito.`;

export async function POST(request: Request) {
  const rateLimitResponse = enforceRateLimit(request, {
    keyPrefix: "knowledge-test",
    maxRequests: 12,
    windowMs: 60 * 1000,
    message: "Muitas solicitações em pouco tempo. Aguarde alguns segundos antes de tentar novamente."
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const mode = body.mode;
    const workText = String(body.workText ?? "").trim();

    if (workText.length < 300) {
      return NextResponse.json(
        { error: "Envie um texto de trabalho com pelo menos 300 caracteres." },
        { status: 400 }
      );
    }

    if (workText.length > 18000) {
      return NextResponse.json(
        { error: "O texto está muito longo. Reduza para até 18.000 caracteres." },
        { status: 400 }
      );
    }

    if (mode === "questions") {
      const questions = await generateQuestionsWithGemini(workText);
      return NextResponse.json({ questions });
    }

    if (mode === "evaluate") {
      const questions = Array.isArray(body.questions) ? (body.questions as Question[]) : [];
      const answers = Array.isArray(body.answers) ? (body.answers as Answer[]) : [];

      if (questions.length !== 5 || answers.length !== 5) {
        return NextResponse.json(
          { error: "A avaliação precisa de 5 perguntas e 5 respostas." },
          { status: 400 }
        );
      }

      if (answers.some((item) => !String(item.answer ?? "").trim())) {
        return NextResponse.json(
          { error: "Todas as respostas precisam ser preenchidas." },
          { status: 400 }
        );
      }

      const evaluation = await evaluateKnowledgeWithGemini(workText, questions, answers);
      return NextResponse.json({ evaluation });
    }

    return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
  } catch (error) {
    console.error(error);

    if (error instanceof GeminiApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Ocorreu um erro ao processar a solicitação. Tente novamente em alguns instantes." },
      { status: 500 }
    );
  }
}

async function generateQuestionsWithGemini(workText: string) {
  const rawText = await generateGeminiContent({
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
- Não entregue respostas, gabaritos, pistas óbvias ou explicações prontas.
- As perguntas devem ser específicas ao texto.
- As perguntas devem exigir explicação com as próprias palavras.
- Evite perguntas de sim/não.
- Responda apenas em JSON válido no formato:
{
  "questions": [
    { "id": "q1", "question": "pergunta", "focus": "tema avaliado" }
  ]
}

Trabalho do aluno:
${workText}`
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

  if (!Array.isArray(parsed.questions) || parsed.questions.length !== 5) {
    throw new Error("A IA não retornou 5 perguntas válidas.");
  }

  return parsed.questions.map((item: Question, index: number) => ({
    id: `q${index + 1}`,
    question: String(item.question ?? "").trim(),
    focus: String(item.focus ?? "").trim()
  }));
}

async function evaluateKnowledgeWithGemini(
  workText: string,
  questions: Question[],
  answers: Answer[]
) {
  const rawText = await generateGeminiContent({
    systemInstruction: {
      parts: [{ text: teacherPrompt }]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Avalie as respostas do aluno com base no trabalho original.

Regras:
- Não entregue respostas prontas nem gabarito.
- Avalie se o aluno demonstrou entendimento real, parcial ou insuficiente.
- Explique o motivo da avaliação.
- Identifique apenas conteúdos, temas, conceitos ou partes do trabalho que o aluno precisa estudar melhor.
- Não diga que a dificuldade foi "interpretação", "falta de atenção", "explicar com clareza" ou outra habilidade genérica.
- Sugira pontos de estudo ligados ao conteúdo do trabalho sem revelar a resposta correta pronta.
- Se a resposta parecer copiada, repetida ou decorada, aponte isso de forma pedagógica.
- Responda apenas em JSON válido no formato:
{
  "level": "entendeu bem" | "entendeu parcialmente" | "não entendeu",
  "explanation": "motivo geral da avaliação",
  "studySuggestions": ["ponto para revisar"],
  "contentToImprove": [
    {
      "topic": "conteúdo específico do trabalho",
      "reason": "por que esse conteúdo precisa ser aprofundado, usando evidências das respostas",
      "whatToStudy": "o que revisar nesse conteúdo, sem dar gabarito"
    }
  ],
  "questionFeedback": [
    {
      "id": "q1",
      "summary": "comentário breve sem gabarito",
      "status": "bom" | "parcial" | "insuficiente",
      "suggestion": "o que melhorar sem resposta pronta"
    }
  ]
}

Trabalho original:
${workText}

Perguntas feitas:
${JSON.stringify(questions, null, 2)}

Respostas do aluno:
${JSON.stringify(answers, null, 2)}`
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
  const validLevels = ["entendeu bem", "entendeu parcialmente", "não entendeu"];

  if (!validLevels.includes(parsed.level)) {
    throw new Error("A IA não retornou um nível de avaliação válido.");
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
