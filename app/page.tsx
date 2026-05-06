"use client";

import { useMemo, useState } from "react";

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
type InputMethod = "text" | "pdf";

const levelClass: Record<Evaluation["level"], string> = {
  "entendeu bem": "good",
  "entendeu parcialmente": "partial",
  "não entendeu": "low"
};

export default function Home() {
  const [step, setStep] = useState<Step>("text");
  const [inputMethod, setInputMethod] = useState<InputMethod>("text");
  const [workText, setWorkText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const filledAnswers = useMemo(() => {
    return questions.filter((question) => answers[question.id]?.trim()).length;
  }, [answers, questions]);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");

    if (file.type !== "application/pdf") {
      setError("Por favor, selecione um arquivo PDF.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("O arquivo é muito grande. Máximo 10MB.");
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "questions");

      const response = await fetch("/api/pdf-upload", {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível processar o PDF.");
      }

      setWorkText(data.extractedText);
      setUploadedFileName(file.name);
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
    setInputMethod("text");
    setWorkText("");
    setUploadedFileName("");
    setQuestions([]);
    setAnswers({});
    setEvaluation(null);
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
                <div className="input-tabs">
                  <div className="input-tab-buttons">
                    <button 
                      className={`input-tab-button ${inputMethod === "text" ? "active" : ""}`} 
                      type="button"
                      onClick={() => setInputMethod("text")}
                    >
                      Colar texto
                    </button>
                    <button 
                      className={`input-tab-button ${inputMethod === "pdf" ? "active" : ""}`} 
                      type="button"
                      onClick={() => setInputMethod("pdf")}
                    >
                      Enviar PDF
                    </button>
                  </div>
                </div>

                <div className="input-methods">
                  {inputMethod === "text" && (
                    <div className="input-method active">
                      <label className="field-label" htmlFor="work-text">
                        Texto do trabalho
                        <span className="counter">{workText.trim().length} caracteres</span>
                      </label>
                      <textarea
                        id="work-text"
                        value={workText}
                        onChange={(event) => setWorkText(event.target.value)}
                        placeholder="Cole aqui o texto completo do trabalho escolar..."
                        disabled={isLoading}
                      />

                      <div className="actions">
                        <button className="button" type="button" onClick={requestQuestions} disabled={isLoading}>
                          {isLoading ? "Gerando perguntas..." : "Testar meu conhecimento"}
                        </button>
                      </div>
                    </div>
                  )}

                  {inputMethod === "pdf" && (
                    <div className="input-method active">
                      <label className="field-label" htmlFor="pdf-file">
                        Enviar arquivo PDF
                      </label>
                      <div className="file-upload-area">
                        <input
                          id="pdf-file"
                          type="file"
                          accept=".pdf"
                          onChange={handleFileUpload}
                          disabled={isLoading}
                          className="file-input"
                        />
                        <div className="file-upload-content">
                          <div className="file-icon">📄</div>
                          <p className="file-upload-text">
                            Clique para selecionar um PDF ou arraste um arquivo aqui
                          </p>
                          <p className="file-upload-hint">Máximo 10MB</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {step === "answers" && (
              <>
                {uploadedFileName && (
                  <div className="file-info">
                    <span className="file-badge">📄 {uploadedFileName}</span>
                  </div>
                )}
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
