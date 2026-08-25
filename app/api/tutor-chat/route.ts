import { NextResponse } from "next/server";
import { GeminiApiError, generateGeminiContent } from "../lib/gemini";
import { enforceRateLimit } from "../lib/rateLimit";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const tutorPrompt = `Você é um professor tutor exigente, claro e paciente.
Sua função é tirar dúvidas do aluno sobre o conteúdo enviado.
Use o texto do trabalho como contexto principal.
Não entregue gabaritos prontos, respostas completas de atividade, redações finais ou texto para copiar.
Se o aluno pedir resposta pronta, explique o caminho, faça perguntas orientadoras e dê pistas.
Se o aluno pedir para você fazer o trabalho por ele, recuse de forma educada e ajude com um roteiro de estudo.
Ajude o aluno a entender com as próprias palavras.`;

export async function POST(request: Request) {
  const rateLimitResponse = enforceRateLimit(request, {
    keyPrefix: "tutor-chat",
    maxRequests: 18,
    windowMs: 60 * 1000,
    message: "Muitas mensagens em pouco tempo. Aguarde alguns segundos antes de falar com o tutor novamente."
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
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

    const reply = await callGemini(workText, message, history);

    return NextResponse.json({ reply });
  } catch (error) {
    console.error(error);

    if (error instanceof GeminiApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Ocorreu um erro ao responder a dúvida. Tente novamente em alguns instantes." },
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

async function callGemini(workText: string, message: string, history: ChatMessage[]) {
  const conversation = history
    .map((item) => `${item.role === "user" ? "Aluno" : "Tutor"}: ${item.content}`)
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
  });
}
