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
  contentToImprove?: Array<{
    topic: string;
    reason: string;
    whatToStudy: string;
  }>;
  questionFeedback: Array<{
    id: string;
    summary: string;
    status: "bom" | "parcial" | "insuficiente";
    suggestion: string;
  }>;
};

type Step = "home" | "text" | "answers" | "result" | "chat";
type InputMode = "paste" | "pdf";
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_PDF_SIZE = 10 * 1024 * 1024;

const levelClass: Record<Evaluation["level"], string> = {
  "entendeu bem": "good",
  "entendeu parcialmente": "partial",
  "não entendeu": "low"
};

export default function Home() {
  const [step, setStep] = useState<Step>("home");
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

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

  async function sendChatMessage(messageOverride?: string) {
    setError("");

    const message = (messageOverride ?? chatInput).trim();

    if (workText.trim().length < 300) {
      setError("Adicione um texto ou PDF com pelo menos 300 caracteres antes de usar o chat.");
      return;
    }

    if (!message) {
      setError("Digite uma dúvida para enviar ao tutor.");
      return;
    }

    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: message }];
    setChatMessages(nextMessages);
    setChatInput("");
    setStep("chat");
    setIsChatLoading(true);

    try {
      const response = await fetch("/api/tutor-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workText,
          message,
          history: chatMessages,
          questions,
          answers: questions.map((question) => ({
            id: question.id,
            question: question.question,
            answer: answers[question.id] ?? ""
          })),
          evaluation
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível responder agora.");
      }

      setChatMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch (chatError) {
      setChatMessages(chatMessages);
      setError(chatError instanceof Error ? chatError.message : "Erro inesperado no chat.");
    } finally {
      setIsChatLoading(false);
    }
  }

  function requestStudyMaterial() {
    void sendChatMessage(
      "Com base na minha avaliação, nos conteúdos que preciso melhorar e nas minhas respostas, crie um texto de estudo personalizado sobre esses conteúdos. Depois faça perguntas novas e específicas para eu treinar, sem entregar gabarito pronto."
    );
  }

  function resetAll() {
    setStep("home");
    setWorkText("");
    setQuestions([]);
    setAnswers({});
    setEvaluation(null);
    setPdfFileName("");
    setPdfInfo("");
    setChatMessages([]);
    setChatInput("");
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
            próprias palavras. A avaliação mostra quais conteúdos precisam de mais estudo sem entregar
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
            <button className={`tab ${step === "home" ? "active" : ""}`} type="button" onClick={() => setStep("home")}>
              Início
            </button>
            <button className={`tab ${step === "text" ? "active" : ""}`} type="button" onClick={() => setStep("text")}>
              Trabalho
            </button>
            <button
              className={`tab ${step === "answers" ? "active" : ""}`}
              type="button"
              onClick={() => setStep("answers")}
            >
              Perguntas
            </button>
            <button
              className={`tab ${step === "result" ? "active" : ""}`}
              type="button"
              onClick={() => setStep("result")}
            >
              Avaliação
            </button>
            <button className={`tab ${step === "chat" ? "active" : ""}`} type="button" onClick={() => setStep("chat")}>
              Chat
            </button>
          </div>

          <div className="panel">
            {step === "home" && (
              <section className="home-panel">
                <div className="home-copy">
                  <span className="eyebrow">Como o RealLearn funciona</span>
                  <h2>Um teste de entendimento feito a partir do seu próprio trabalho.</h2>
                  <p>
                    O RealLearn lê o conteúdo que você envia, cria perguntas específicas e avalia se
                    você consegue explicar as ideias com suas próprias palavras. Depois, aponta os
                    conteúdos que precisam de aprofundamento e ajuda você a estudar melhor pelo chat.
                  </p>
                </div>

                <div className="steps-grid" aria-label="Passos de uso">
                  <div className="step-card">
                    <strong>1</strong>
                    <h3>Envie o conteúdo</h3>
                    <p>Cole o texto do trabalho ou envie um PDF com texto selecionável.</p>
                  </div>
                  <div className="step-card">
                    <strong>2</strong>
                    <h3>Responda perguntas</h3>
                    <p>A IA cria 5 perguntas sobre o material enviado, sem gabarito pronto.</p>
                  </div>
                  <div className="step-card">
                    <strong>3</strong>
                    <h3>Veja a avaliação</h3>
                    <p>Receba um diagnóstico honesto e veja quais conteúdos revisar.</p>
                  </div>
                  <div className="step-card">
                    <strong>4</strong>
                    <h3>Tire dúvidas</h3>
                    <p>Use o chat tutor para entender melhor os conteúdos em que errou.</p>
                  </div>
                </div>

                <div className="example-showcase" aria-label="Exemplos do RealLearn">
                  <article className="example-card">
                    <div className="mock-window">
                      <div className="mock-title">Texto do trabalho</div>
                      <div className="mock-lines">
                        <span className="wide" />
                        <span />
                        <span className="medium" />
                        <span className="wide" />
                      </div>
                    </div>
                    <h3>Conteúdo enviado</h3>
                    <p>O aluno começa com o texto do trabalho ou com o conteúdo extraído do PDF.</p>
                  </article>

                  <article className="example-card">
                    <div className="mock-window">
                      <div className="mock-title">Perguntas geradas</div>
                      <ol className="mock-questions">
                        <li>Explique a ideia principal com suas palavras.</li>
                        <li>Compare dois conceitos citados no texto.</li>
                        <li>Mostre por que esse ponto é importante.</li>
                      </ol>
                    </div>
                    <h3>Perguntas personalizadas</h3>
                    <p>As perguntas obrigam o aluno a demonstrar entendimento real.</p>
                  </article>

                  <article className="example-card">
                    <div className="mock-window">
                      <div className="mock-level">entendeu parcialmente</div>
                      <div className="mock-feedback">
                        <span>Ponto forte: explicou a ideia central.</span>
                        <span>Revisar: relação entre os conceitos.</span>
                      </div>
                    </div>
                    <h3>Avaliação clara</h3>
                    <p>O resultado mostra o nível de compreensão e os conteúdos para revisar.</p>
                  </article>

                  <article className="example-card">
                    <div className="mock-window chat-preview">
                      <div className="mock-bubble assistant">Qual parte você quer entender melhor?</div>
                      <div className="mock-bubble user">Me explica esse trecho?</div>
                      <div className="mock-bubble assistant">Vamos por partes, sem copiar resposta...</div>
                    </div>
                    <h3>Chat tutor</h3>
                    <p>O chat usa o texto, as perguntas, as respostas e a avaliação como contexto.</p>
                  </article>
                </div>

                <div className="home-note">
                  <strong>Importante:</strong> o RealLearn não faz o trabalho pelo aluno. Ele ajuda a
                  descobrir se o conteúdo foi realmente aprendido.
                </div>

                <div className="actions">
                  <button className="button" type="button" onClick={() => setStep("text")}>
                    Começar meu teste
                  </button>
                </div>
              </section>
            )}

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

                    {evaluation.contentToImprove && evaluation.contentToImprove.length > 0 && (
                      <>
                        <h3>Conteúdos para se aprofundar</h3>
                        <div className="topic-grid">
                          {evaluation.contentToImprove.map((item) => (
                            <article className="topic-item" key={item.topic}>
                              <strong>{item.topic}</strong>
                              <p>{item.reason}</p>
                              <span>{item.whatToStudy}</span>
                            </article>
                          ))}
                        </div>
                        <button className="button study-button" type="button" onClick={requestStudyMaterial}>
                          Gerar estudo no chat
                        </button>
                      </>
                    )}

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

            {step === "chat" && (
              <>
                {workText.trim().length >= 300 ? (
                  <section className="chat-panel">
                    <div className="chat-log" aria-live="polite">
                      {chatMessages.length === 0 ? (
                        <div className="empty-state">
                          Pergunte algo sobre o trabalho. O tutor ajuda a entender sem entregar resposta pronta.
                        </div>
                      ) : (
                        chatMessages.map((message, index) => (
                          <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                            <strong>{message.role === "user" ? "Você" : "Tutor RealLearn"}</strong>
                            <p>{message.content}</p>
                          </div>
                        ))
                      )}
                      {isChatLoading && (
                        <div className="chat-message assistant">
                          <strong>Tutor RealLearn</strong>
                          <p>Preparando uma explicação...</p>
                        </div>
                      )}
                    </div>

                    <div className="chat-composer">
                      <textarea
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        placeholder="Digite sua dúvida sobre o texto ou PDF..."
                        disabled={isChatLoading}
                      />
                      <button className="button" type="button" onClick={() => void sendChatMessage()} disabled={isChatLoading}>
                        {isChatLoading ? "Enviando..." : "Enviar dúvida"}
                      </button>
                    </div>
                  </section>
                ) : (
                  <div className="empty-state">
                    Cole um texto ou envie um PDF na aba Trabalho para liberar o chat.
                  </div>
                )}

                <div className="actions">
                  <button className="button secondary" type="button" onClick={() => setStep("text")}>
                    Voltar ao trabalho
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
