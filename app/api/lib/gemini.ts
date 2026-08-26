type GeminiPart = {
  text?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

type GenerateContentPayload = {
  systemInstruction: {
    parts: Array<{ text: string }>;
  };
  contents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string }>;
  }>;
  generationConfig?: {
    responseMimeType?: string;
    temperature?: number;
  };
};

export class GeminiApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

export async function generateGeminiContent(payload: GenerateContentPayload) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey || apiKey.includes("coloque_sua_chave")) {
    throw new GeminiApiError(
      "A variável GEMINI_API_KEY não foi configurada no .env.local.",
      500
    );
  }

  const model = getGeminiModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new GeminiApiError(
      "Não foi possível conectar à Gemini API. Verifique sua internet e tente novamente.",
      502
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Erro na API Gemini (${response.status}): ${errorText}`);

    throw new GeminiApiError(
      getFriendlyGeminiError(response.status),
      getFriendlyHttpStatus(response.status)
    );
  }

  const data = (await response.json()) as GeminiResponse;
  const outputText = extractOutputText(data);

  if (!outputText) {
    throw new GeminiApiError(
      "A IA não retornou texto. Tente novamente em alguns instantes.",
      502
    );
  }

  return outputText;
}

function getGeminiModel() {
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return model.startsWith("models/") ? model.slice("models/".length) : model;
}

function getFriendlyGeminiError(status: number) {
  if (status === 400) {
    return "A Gemini API recusou a solicitação. Verifique se o modelo configurado é válido.";
  }

  if (status === 401 || status === 403) {
    return "A chave da Gemini API está ausente, inválida ou sem permissão para esse modelo.";
  }

  if (status === 429) {
    return "A Gemini API atingiu o limite de uso no momento. Tente novamente mais tarde.";
  }

  if (status === 503) {
    return "A IA está com alta demanda no momento. Tente novamente em alguns instantes.";
  }

  return "Não foi possível responder agora. Tente novamente em alguns instantes.";
}

function getFriendlyHttpStatus(status: number) {
  if (status === 429) {
    return 429;
  }

  if (status === 503) {
    return 503;
  }

  if (status === 401 || status === 403) {
    return 502;
  }

  return 502;
}

function extractOutputText(data: GeminiResponse) {
  return (
    data.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .filter((part) => typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim() ?? ""
  );
}
