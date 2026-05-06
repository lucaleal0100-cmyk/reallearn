const MIN_EXTRACTED_TEXT_LENGTH = 300;

export async function extractPdfText(file: File) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const buffer = await file.arrayBuffer();
  const document = await getDocumentProxy(new Uint8Array(buffer));
  const result = await extractText(document, { mergePages: true });
  const text = normalizeExtractedText(result.text);

  if (!text) {
    throw new Error(
      "Não foi possível extrair texto do PDF. Ele pode estar vazio ou ser um PDF escaneado como imagem."
    );
  }

  if (text.length < MIN_EXTRACTED_TEXT_LENGTH) {
    throw new Error(
      "O PDF foi lido, mas tem pouco texto extraível. Use um PDF com texto selecionável ou cole o conteúdo manualmente."
    );
  }

  return {
    text,
    totalPages: result.totalPages
  };
}

function normalizeExtractedText(text: string | string[]) {
  const rawText = Array.isArray(text) ? text.join("\n\n") : text;

  return rawText
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
