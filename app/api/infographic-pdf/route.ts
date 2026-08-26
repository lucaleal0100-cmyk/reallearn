import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import { enforceRateLimit } from "../lib/rateLimit";

export async function POST(request: Request) {
  const rateLimitResponse = enforceRateLimit(request, {
    keyPrefix: "infographic-pdf",
    maxRequests: 8,
    windowMs: 60 * 1000,
    message: "Muitas gerações de PDF em pouco tempo. Aguarde alguns segundos antes de tentar novamente."
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const title = String(body.title ?? "Material de estudo StudyAI").trim().slice(0, 120);
    const content = String(body.content ?? "").trim().slice(0, 12000);

    if (content.length < 20) {
      return NextResponse.json({ error: "Gere o infográfico antes de baixar o PDF." }, { status: 400 });
    }

    const buffer = await createPdf(title, content);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="studyai-infografico.pdf"'
      }
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Ocorreu um erro ao gerar o PDF. Tente novamente em alguns instantes." },
      { status: 500 }
    );
  }
}

function createPdf(title: string, content: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).fillColor("#0d5246").text(title, { lineGap: 6 });
    doc.moveDown();
    doc.fontSize(10).fillColor("#657084").text("Gerado pelo StudyAI", { lineGap: 4 });
    doc.moveDown();

    const sections = content.split(/\n{2,}/);

    for (const section of sections) {
      const clean = section.replace(/\*\*/g, "").trim();

      if (!clean) {
        continue;
      }

      if (clean.length < 90 && !clean.endsWith(".")) {
        doc.moveDown(0.6);
        doc.fontSize(13).fillColor("#172033").text(clean, { lineGap: 3 });
      } else {
        doc.fontSize(11).fillColor("#172033").text(clean, { lineGap: 5 });
      }

      doc.moveDown(0.7);
    }

    doc.end();
  });
}
