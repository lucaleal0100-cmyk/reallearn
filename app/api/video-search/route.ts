import { NextResponse } from "next/server";
import { GeminiApiError, generateGeminiContent } from "../lib/gemini";
import { enforceRateLimit } from "../lib/rateLimit";

type YouTubeSearchItem = {
  id?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
  };
};

type YouTubeVideoItem = {
  id?: string;
  contentDetails?: {
    duration?: string;
  };
};

const videoPrompt = `Você é um professor pesquisador.
Sua tarefa é criar uma busca curta e precisa para encontrar vídeos educacionais sobre o conteúdo em que o aluno precisa melhorar.
Use os conteúdos da avaliação e o texto original.
Não invente links. Responda apenas em JSON válido no formato {"query":"termos de busca"}.`;

export async function POST(request: Request) {
  const rateLimitResponse = enforceRateLimit(request, {
    keyPrefix: "video-search",
    maxRequests: 8,
    windowMs: 60 * 1000,
    message: "Muitas buscas de vídeo em pouco tempo. Aguarde alguns segundos antes de tentar novamente."
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Configure YOUTUBE_API_KEY no .env.local para buscar vídeos reais." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const workText = String(body.workText ?? "").trim();
    const profile = body.profile ?? null;
    const evaluation = body.evaluation ?? null;

    if (workText.length < 300) {
      return NextResponse.json(
        { error: "Adicione um texto ou PDF com pelo menos 300 caracteres antes de buscar vídeos." },
        { status: 400 }
      );
    }

    const query = await generateVideoQuery(workText, profile, evaluation);
    const videos = await searchYouTubeVideos(apiKey, query);

    return NextResponse.json({ query, videos });
  } catch (error) {
    console.error(error);

    if (error instanceof GeminiApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Ocorreu um erro ao buscar vídeos. Tente novamente em alguns instantes." },
      { status: 500 }
    );
  }
}

async function generateVideoQuery(workText: string, profile: unknown, evaluation: unknown) {
  const rawText = await generateGeminiContent({
    systemInstruction: {
      parts: [{ text: videoPrompt }]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Crie uma busca para YouTube priorizando aulas educacionais confiáveis em português.

Perfil educacional:
${JSON.stringify(profile, null, 2)}

Avaliação:
${JSON.stringify(evaluation, null, 2)}

Texto original:
${workText.slice(0, 10000)}`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  });

  const parsed = JSON.parse(rawText.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim());
  const query = String(parsed.query ?? "").trim();

  return query || "aula explicação educação";
}

async function searchYouTubeVideos(apiKey: string, query: string) {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", `${query} aula educação`);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", "5");
  searchUrl.searchParams.set("safeSearch", "strict");
  searchUrl.searchParams.set("relevanceLanguage", "pt");
  searchUrl.searchParams.set("videoEmbeddable", "true");
  searchUrl.searchParams.set("key", apiKey);

  const searchResponse = await fetch(searchUrl);

  if (!searchResponse.ok) {
    const errorText = await searchResponse.text();
    console.error(`Erro YouTube (${searchResponse.status}): ${errorText}`);
    return Promise.reject(new Error("A busca do YouTube falhou. Verifique a YOUTUBE_API_KEY."));
  }

  const searchData = (await searchResponse.json()) as { items?: YouTubeSearchItem[] };
  const items = searchData.items ?? [];
  const ids = items.map((item) => item.id?.videoId).filter(Boolean).join(",");

  const durations = ids ? await fetchDurations(apiKey, ids) : new Map<string, string>();

  return items
    .map((item) => {
      const id = item.id?.videoId;

      if (!id) {
        return null;
      }

      return {
        title: item.snippet?.title ?? "Vídeo educacional",
        description: item.snippet?.description ?? "",
        channel: item.snippet?.channelTitle ?? "Canal",
        duration: durations.get(id) ?? "Duração não disponível",
        url: `https://www.youtube.com/watch?v=${id}`
      };
    })
    .filter(Boolean);
}

async function fetchDurations(apiKey: string, ids: string) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", ids);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);

  if (!response.ok) {
    return new Map<string, string>();
  }

  const data = (await response.json()) as { items?: YouTubeVideoItem[] };
  const durations = new Map<string, string>();

  for (const item of data.items ?? []) {
    if (item.id && item.contentDetails?.duration) {
      durations.set(item.id, formatIsoDuration(item.contentDetails.duration));
    }
  }

  return durations;
}

function formatIsoDuration(duration: string) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

  if (!match) {
    return "Duração não disponível";
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  if (minutes > 0) {
    return `${minutes}min ${seconds}s`;
  }

  return `${seconds}s`;
}
