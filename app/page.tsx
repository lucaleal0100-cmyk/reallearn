"use client";

import { useMemo, useState } from "react";
import { extractPdfText } from "./lib/extractPdfText";

type Question = {
  id: string;
  question: string;
  focus?: string;
};

type Evaluation = {
  level: "entendeu bem" | "entendeu parcialmente" | "não entendeu";
  explanation: string;
  studySuggestions: string[];
  questionFeedback: Array<{
    id: string;
    summary: string;
    status: "bom" | "parcial" | "insuficiente";
    suggestion: string;
  }>;
};

type Step = "text" | "answers" | "result";
type InputMode = "paste" | "pdf";

const MAX_PDF_SIZE = 10 * 1024 * 1024;

const levelClass: Record<Evaluation["level"], string> = {
  "entendeu bem": "good",
  "entendeu parcialmente": "partial",
  "não entendeu": "low"
};

export default function Home() {
  const [step, setStep] = useState<Step>("text");
  const [workText, setWorkText] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [error, setError] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("paste");
  const [pdfFileName, setPdfFileName] = useState("");
  const [pdfInfo, setPdfInfo] = useState("");

  const filledAnswers = useMemo(() => {
    return questions.filter((question) => answers[question.id]?.trim()).length;
  }, [answers, questions]);

  async function requestQuestions() {
    setError("");

    if (workText.trim().length < 300) {
      setError("Cole um trabalho com pelo menos 300 caracteres para gerar perguntas boas.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/knowledge-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "questions",
          workText
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível gerar as perguntas.");
      }

      setQuestions(data.questions);
      setAnswers({});
      setEvaluation(null);
      setStep("answers");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePdfUpload(file: File | undefined) {
    setError("");
    setPdfInfo("");

    if (!file) {
      return;
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setError("Selecione um arquivo PDF válido.");
      return;
    }

    if (file.size > MAX_PDF_SIZE) {
      setError("O PDF é muito grande. O limite é de 10MB.");
      return;
    }

    setIsPdfLoading(true);
    setPdfFileName(file.name);

    try {
      const extracted = await extractPdfText(file);
      setWorkText(extracted.text);
      setQuestions([]);
      setAnswers({});
      setEvaluation(null);
      setPdfInfo(
        `Texto extraído de ${extracted.totalPages} ${
          extracted.totalPages === 1 ? "página" : "páginas"
        }. Revise o campo abaixo e teste seu conhecimento.`
      );
    } catch (pdfError) {
      setWorkText("");
      setPdfFileName("");
      setError(pdfError instanceof Error ? pdfError.message : "Não foi possível ler o PDF.");
    } finally {
      setIsPdfLoading(false);
    }
  }

  async function evaluateAnswers() {
    setError("");

    if (filledAnswers < questions.length) {
      setError("Responda todas as perguntas antes de pedir a avaliação.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/knowledge-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "evaluate",
          workText,
          questions,
          answers: questions.map((question) => ({
            id: question.id,
            question: question.question,
            answer: answers[question.id]
          }))
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível avaliar as respostas.");
      }

      setEvaluation(data.evaluation);
      setStep("result");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.");
    } finally {
      setIsLoading(false);
    }
  }

  function resetAll() {
    setStep("text");
    setWorkText("");
    setQuestions([]);
    setAnswers({});
    setEvaluation(null);
    setPdfFileName("");
    setPdfInfo("");
    setError("");
  }

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">RL</div>
          <span>RealLearn</span>
        </div>
        <div className="badge">IA para aprendizado real</div>
      </header>

      <section className="hero">
        <div className="intro">
          <h1>Descubra se o conteúdo ficou mesmo na cabeça.</h1>
          <p>
            Cole o trabalho escolar ou envie um PDF, receba perguntas personalizadas e responda com suas
            próprias palavras. A avaliação mostra o nível de entendimento sem entregar
            respostas prontas.
          </p>

          <div className="signal-grid" aria-label="Resumo do processo">
            <div className="signal">
              <strong>01</strong>
              <span>Texto ou PDF</span>
            </div>
            <div className="signal">
              <strong>05</strong>
              <span>Perguntas geradas</span>
            </div>
            <div className="signal">
              <strong>3</strong>
              <span>Níveis de avaliação</span>
            </div>
          </div>
        </div>

        <div className="workspace">
          <div className="tabs" aria-label="Etapas">
            <button className={`tab ${step === "text" ? "active" : ""}`} type="button">
              Trabalho
            </button>
            <button className={`tab ${step === "answers" ? "active" : ""}`} type="button">
              Perguntas
            </button>
            <button className={`tab ${step === "result" ? "active" : ""}`} type="button">
              Avaliação
            </button>
          </div>

          <div className="panel">
            {step === "text" && (
              <>
                <div className="source-switch" aria-label="Escolha como enviar o trabalho">
                  <button
                    className={`source-option ${inputMode === "paste" ? "active" : ""}`}
                    type="button"
                    onClick={() => setInputMode("paste")}
                    disabled={isLoading || isPdfLoading}
                  >
                    Colar texto
                  </button>
                  <button
                    className={`source-option ${inputMode === "pdf" ? "active" : ""}`}
                    type="button"
                    onClick={() => setInputMode("pdf")}
                    disabled={isLoading || isPdfLoading}
                  >
                    Enviar PDF
                  </button>
                </div>

                {inputMode === "pdf" && (
                  <div className="pdf-upload">
                    <input
                      id="pdf-file"
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(event) => handlePdfUpload(event.target.files?.[0])}
                      disabled={isLoading || isPdfLoading}
                    />
                    <label className="pdf-drop" htmlFor="pdf-file">
                      <strong>{isPdfLoading ? "Lendo PDF..." : "Selecionar PDF"}</strong>
                      <span>Use um arquivo com texto selecionável, até 10MB.</span>
                    </label>
                    {pdfFileName && (
                      <div className="file-status">
                        <strong>{pdfFileName}</strong>
                        {pdfInfo && <span>{pdfInfo}</span>}
                      </div>
                    )}
                  </div>
                )}

                <label className="field-label" htmlFor="work-text">
                  Texto do trabalho
                  <span className="counter">{workText.trim().length} caracteres</span>
                </label>
                <textarea
                  id="work-text"
                  value={workText}
                  onChange={(event) => setWorkText(event.target.value)}
                  placeholder="Cole aqui o texto completo do trabalho escolar..."
                  disabled={isLoading || isPdfLoading}
                />

                <div className="actions">
                  <button
                    className="button"
                    type="button"
                    onClick={requestQuestions}
                    disabled={isLoading || isPdfLoading}
                  >
                    {isLoading ? "Gerando perguntas..." : "Testar meu conhecimento"}
                  </button>
                </div>
              </>
            )}

            {step === "answers" && (
              <>
                {questions.length > 0 ? (
                  <div className="question-list">
                    {questions.map((question, index) => (
                      <section className="question-item" key={question.id}>
                        <div className="question-head">
                          <span className="question-number">{index + 1}</span>
                          <p className="question-title">{question.question}</p>
                        </div>
                        <textarea
                          className="answer-box"
                          value={answers[question.id] ?? ""}
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: event.target.value
                            }))
                          }
                          placeholder="Responda com suas próprias palavras..."
                          disabled={isLoading}
                        />
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">As perguntas aparecem aqui depois do envio do trabalho.</div>
                )}

                <div className="actions">
                  <button className="button" type="button" onClick={evaluateAnswers} disabled={isLoading}>
                    {isLoading ? "Avaliando..." : "Avaliar minhas respostas"}
                  </button>
                  <button className="button secondary" type="button" onClick={() => setStep("text")} disabled={isLoading}>
                    Editar trabalho
                  </button>
                </div>
              </>
            )}

            {step === "result" && (
              <>
                {evaluation ? (
                  <section className="result-card">
                    <span className={`level ${levelClass[evaluation.level]}`}>{evaluation.level}</span>
                    <h2>Motivo da avaliação</h2>
                    <p>{evaluation.explanation}</p>

                    <h3>O que estudar melhor</h3>
                    <ul>
                      {evaluation.studySuggestions.map((suggestion) => (
                        <li key={suggestion}>{suggestion}</li>
                      ))}
                    </ul>

                    <h3>Análise por pergunta</h3>
                    <div className="feedback-grid">
                      {evaluation.questionFeedback.map((feedback, index) => (
                        <div className="feedback-item" key={feedback.id}>
                          <strong>
                            Pergunta {index + 1}: {feedback.status}
                          </strong>
                          <p>{feedback.summary}</p>
                          <p>{feedback.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <div className="empty-state">A avaliação aparece aqui depois das respostas.</div>
                )}

                <div className="actions">
                  <button className="button" type="button" onClick={() => setStep("answers")}>
                    Revisar respostas
                  </button>
                  <button className="button secondary" type="button" onClick={resetAll}>
                    Novo teste
                  </button>
                </div>
              </>
            )}

            {error && <div className="alert">{error}</div>}
          </div>
        </div>
      </section>
    </main>
  );
}
