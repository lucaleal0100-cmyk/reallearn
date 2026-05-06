import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

class GeminiApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

const tutorPrompt = `Você é um professor tutor exigente, claro e paciente.
Sua função é tirar dúvidas do aluno sobre o conteúdo enviado.
Use o texto do trabalho como contexto principal.
Não entregue gabaritos prontos, respostas completas de atividade ou texto para copiar.
Se o aluno pedir resposta pronta, explique o caminho, faça perguntas orientadoras e dê pistas.
Ajude o aluno a entender com as próprias palavras.`;

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
    const workText = String(body.workText ?? "").trim();
    const message = String(body.message ?? "").trim();
    const history = normalizeHistory(body.history);

    if (workText.length < 300) {
      return NextResponse.json(
        { error: "Adicione um texto ou PDF com pelo menos 300 caracteres antes de usar o chat." },
        { status: 400 }
      );
    }

    if (message.length < 2) {
      return NextResponse.json({ error: "Digite uma dúvida para enviar ao tutor." }, { status: 400 });
    }

    if (message.length > 1200) {
      return NextResponse.json(
        { error: "Sua pergunta está muito longa. Reduza para até 1.200 caracteres." },
        { status: 400 }
      );
    }

    const reply = await callGemini(apiKey, workText, message, history);

    return NextResponse.json({ reply });
  } catch (error) {
    console.error(error);

    if (error instanceof GeminiApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Ocorreu um erro ao responder a dúvida." },
      { status: 500 }
    );
  }
}

function normalizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(-8)
    .map((item): ChatMessage => {
      const candidate = item as Partial<ChatMessage>;

      return {
        role: candidate.role === "assistant" ? "assistant" : "user",
        content: String(candidate.content ?? "").trim().slice(0, 1200)
      };
    })
    .filter((item) => item.content);
}

async function callGemini(
  apiKey: string,
  workText: string,
  message: string,
  history: ChatMessage[]
) {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const conversation = history
    .map((item) => `${item.role === "user" ? "Aluno" : "Tutor"}: ${item.content}`)
    .join("\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: tutorPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Texto do trabalho:
${workText.slice(0, 18000)}

Histórico recente:
${conversation || "Sem histórico anterior."}

Dúvida atual do aluno:
${message}

Responda em português do Brasil, de forma direta e didática.`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.35
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const friendlyMessage =
      response.status === 503
        ? "A IA está com alta demanda no momento. Tente enviar sua dúvida novamente em alguns instantes."
        : "Não foi possível responder agora. Tente novamente em alguns instantes.";

    console.error(`Erro na API Gemini: ${errorText}`);
    throw new GeminiApiError(friendlyMessage, response.status === 503 ? 503 : 502);
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
