import { NextResponse } from "next/server";

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
Você não deve entregar respostas prontas.
Você deve fazer perguntas específicas sobre o texto enviado.
As perguntas devem obrigar o aluno a explicar com as próprias palavras.
Depois de receber as respostas, avalie o nível real de entendimento.`;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "A variável GEMINI_API_KEY não foi configurada no .env.local." },
        { status: 500 }
      );
    }

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
      const questions = await generateQuestionsWithGemini(apiKey, workText);
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

      const evaluation = await evaluateKnowledgeWithGemini(apiKey, workText, questions, answers);
      return NextResponse.json({ evaluation });
    }

    return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Ocorreu um erro ao processar a solicitação." },
      { status: 500 }
    );
  }
}

async function generateQuestionsWithGemini(apiKey: string, workText: string) {
  const rawText = await callGemini(apiKey, {
    instructions: teacherPrompt,
    input: `Crie exatamente 5 perguntas sobre o trabalho abaixo.

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
  apiKey: string,
  workText: string,
  questions: Question[],
  answers: Answer[]
) {
  const rawText = await callGemini(apiKey, {
    instructions: teacherPrompt,
    input: `Avalie as respostas do aluno com base no trabalho original.

Regras:
- Não entregue respostas prontas nem gabarito.
- Avalie se o aluno demonstrou entendimento real, parcial ou insuficiente.
- Explique o motivo da avaliação.
- Sugira pontos de estudo sem revelar a resposta correta pronta.
- Responda apenas em JSON válido no formato:
{
  "level": "entendeu bem" | "entendeu parcialmente" | "não entendeu",
  "explanation": "motivo geral da avaliação",
  "studySuggestions": ["ponto para revisar"],
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
  });

  const parsed = parseJson(rawText);
  const validLevels = ["entendeu bem", "entendeu parcialmente", "não entendeu"];

  if (!validLevels.includes(parsed.level)) {
    throw new Error("A IA não retornou um nível de avaliação válido.");
  }

  return parsed;
}

async function callGemini(
  apiKey: string,
  payload: {
    instructions: string;
    input: string;
  }
) {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: payload.instructions }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: payload.input }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro na API Gemini: ${errorText}`);
  }

  const data = await response.json();
  const outputText = extractOutputText(data);

  if (!outputText) {
    throw new Error("A IA não retornou texto.");
  }

  return outputText;
}

function extractOutputText(data: unknown) {
  const response = data as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  return (
    response.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .filter((part) => typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim() ?? ""
  );
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
