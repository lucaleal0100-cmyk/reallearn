import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

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

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "A variável GEMINI_API_KEY não foi configurada no .env.local." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mode = formData.get("mode") as string;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo foi enviado." },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "O arquivo deve ser um PDF." },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "O arquivo é muito grande. Máximo 10MB." },
        { status: 400 }
      );
    }

    // Converter o arquivo para Buffer
    const buffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(buffer);

    // Extrair texto do PDF
    let pdfData;
    try {
      const uint8Array = new Uint8Array(pdfBuffer);
      const pdfParser = new PDFParse({ data: uint8Array });
      pdfData = await pdfParser.getText();
    } catch (pdfError) {
      console.error("Erro ao parsear PDF:", pdfError);
      return NextResponse.json(
        { error: "Não foi possível ler o PDF. Verifique se o arquivo está corrompido ou está em branco." },
        { status: 400 }
      );
    }

    const extractedText = (pdfData?.text || "").trim();

    if (!extractedText || extractedText.length < 300) {
      return NextResponse.json(
        { error: "O PDF contém menos de 300 caracteres ou está vazio. Envie um PDF com mais conteúdo ou verifique se não é uma imagem." },
        { status: 400 }
      );
    }

    if (extractedText.length > 18000) {
      return NextResponse.json(
        { error: "O texto extraído é muito longo. Reduza para até 18.000 caracteres." },
        { status: 400 }
      );
    }

    if (mode === "questions") {
      const questions = await generateQuestionsWithGemini(apiKey, extractedText);
      return NextResponse.json({ questions, extractedText });
    }

    if (mode === "evaluate") {
      // Para evaluate, o texto já foi extraído, então não processamos o arquivo novamente
      // Retornamos erro pois evaluate deve ser chamado com o texto já em memória
      return NextResponse.json(
        { error: "Modo de avaliação deve ser chamado via API de knowledge-test." },
        { status: 400 }
      );

    }

    return NextResponse.json({ error: "Modo inválido. Use 'questions'." }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Ocorreu um erro ao processar a solicitação." },
      { status: 500 }
    );
  }
}

async function generateQuestionsWithGemini(apiKey: string, workText: string): Promise<Question[]> {
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
): Promise<any> {
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
