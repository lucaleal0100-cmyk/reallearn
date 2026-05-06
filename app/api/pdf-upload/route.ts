import { NextResponse } from "next/server";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

type Question = {
  id: string;
  question: string;
  focus?: string;
};

const teacherPrompt = `Você é um professor avaliador exigente, mas justo.
Sua função é verificar se o aluno realmente entendeu o conteúdo.
Você não deve entregar respostas prontas.
Você deve fazer perguntas específicas sobre o texto enviado.
As perguntas devem obrigar o aluno a explicar com as próprias palavras.
Depois de receber as respostas, avalie o nível real de entendimento.`;

export const maxDuration = 60;

export async function POST(request: Request) {
  console.log("Recebendo requisição de upload de PDF...");
  
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("Erro: GEMINI_API_KEY não configurada.");
      return NextResponse.json(
        { error: "A variável GEMINI_API_KEY não foi configurada no .env.local." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mode = formData.get("mode") as string;

    if (!file) {
      console.error("Erro: Nenhum arquivo enviado.");
      return NextResponse.json(
        { error: "Nenhum arquivo foi enviado." },
        { status: 400 }
      );
    }

    console.log(`Arquivo recebido: ${file.name}, tamanho: ${file.size} bytes`);

    // Converter o arquivo para Buffer/Uint8Array
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Extrair texto do PDF usando pdfjs-dist
    let extractedText = "";
    try {
      const loadingTask = pdfjs.getDocument({
        data: uint8Array,
        useSystemFonts: true,
        disableFontFace: true,
      });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      
      let fullText = "";
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ");
        fullText += pageText + "\n";
      }
      
      extractedText = fullText.trim();
      console.log("PDF processado com sucesso usando pdfjs-dist.");
    } catch (pdfError) {
      console.error("Erro ao parsear PDF com pdfjs-dist:", pdfError);
      return NextResponse.json(
        { error: "Não foi possível ler o PDF. Verifique se o arquivo está corrompido ou protegido por senha." },
        { status: 400 }
      );
    }

    console.log(`Texto extraído: ${extractedText.length} caracteres.`);

    if (!extractedText || extractedText.length < 300) {
      return NextResponse.json(
        { error: "O PDF contém menos de 300 caracteres ou está vazio. Envie um PDF com mais conteúdo ou verifique se não é uma imagem (scaneado)." },
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
      console.log("Chamando Gemini para gerar perguntas...");
      const questions = await generateQuestionsWithGemini(apiKey, extractedText);
      console.log("Perguntas geradas com sucesso.");
      return NextResponse.json({ questions, extractedText });
    }

    return NextResponse.json({ error: "Modo inválido. Use 'questions'." }, { status: 400 });
  } catch (error) {
    console.error("Erro geral na API:", error);
    return NextResponse.json(
      { error: `Erro ao processar a solicitação: ${error instanceof Error ? error.message : "Erro desconhecido"}` },
      { status: 500 }
    );
  }
}

async function generateQuestionsWithGemini(apiKey: string, workText: string): Promise<Question[]> {
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
        parts: [{ text: teacherPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: `Crie exatamente 5 perguntas sobre o trabalho abaixo.

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
${workText}` }]
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
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  const cleaned = rawText
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed.questions) || parsed.questions.length !== 5) {
    throw new Error("A IA não retornou 5 perguntas válidas.");
  }

  return parsed.questions.map((item: any, index: number) => ({
    id: `q${index + 1}`,
    question: String(item.question ?? "").trim(),
    focus: String(item.focus ?? "").trim()
  }));
}
