"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
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

type LearningProfile = {
  concentration: string;
  organization: string;
  reading: string;
  comprehension: string;
  memory: string;
  stimuli: string;
  communication: string;
  preference: string;
  focusTime: string;
  diagnosis: string;
  notes: string;
};

type StudyMode = "video" | "infographic";

type InfographicResult = {
  title: string;
  centralIdea: string;
  visualMetaphor: string;
  sections: Array<{
    title: string;
    summary: string;
    icon: string;
    importance: number;
  }>;
  connections: Array<{
    from: string;
    to: string;
    label: string;
  }>;
  timeline: Array<{
    label: string;
    detail: string;
  }>;
  comparison: Array<{
    left: string;
    right: string;
    note: string;
  }>;
  quickSummary: string[];
  reviewQuestions: string[];
};

type StudyResult = {
  mode: "infographic";
  content: InfographicResult;
};

type VideoResult = {
  title: string;
  description: string;
  channel: string;
  duration: string;
  url: string;
};

type Step = "home" | "profile" | "text" | "answers" | "result" | "study" | "chat";
type InputMode = "paste" | "pdf";
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Plan = "free" | "plus";
type AuthMode = "login" | "signup";

type AuthUser = {
  name: string;
  email: string;
  plan: Plan;
};

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const AUTH_STORAGE_KEY = "studyai-user";

const defaultProfile: LearningProfile = {
  concentration: "",
  organization: "",
  reading: "",
  comprehension: "",
  memory: "",
  stimuli: "",
  communication: "",
  preference: "",
  focusTime: "",
  diagnosis: "",
  notes: ""
};

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
  const [profile, setProfile] = useState<LearningProfile>(defaultProfile);
  const [hasProfile, setHasProfile] = useState(false);
  const [studyMode, setStudyMode] = useState<StudyMode>("infographic");
  const [studyResult, setStudyResult] = useState<StudyResult | null>(null);
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [videoQuery, setVideoQuery] = useState("");
  const [isStudyLoading, setIsStudyLoading] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isPlansOpen, setIsPlansOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  useEffect(() => {
    const savedUser = window.localStorage.getItem(AUTH_STORAGE_KEY);

    if (!savedUser) {
      return;
    }

    try {
      const parsedUser = JSON.parse(savedUser) as AuthUser;

      if (parsedUser.email && parsedUser.name) {
        setAuthUser(parsedUser);
      }
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

  const filledAnswers = useMemo(() => {
    return questions.filter((question) => answers[question.id]?.trim()).length;
  }, [answers, questions]);

  const answerList = useMemo(
    () =>
      questions.map((question) => ({
        id: question.id,
        question: question.question,
        answer: answers[question.id] ?? ""
      })),
    [answers, questions]
  );

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
          workText,
          profile: hasProfile ? profile : null
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
          profile: hasProfile ? profile : null,
          questions,
          answers: answerList
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
          answers: answerList,
          profile: hasProfile ? profile : null,
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

  function saveProfile() {
    setError("");
    setHasProfile(true);
    setStep("text");
  }

  function deleteProfile() {
    setProfile(defaultProfile);
    setHasProfile(false);
    setStudyResult(null);
    setVideos([]);
    setVideoQuery("");
  }

  async function generateStudyMode(selectedMode = studyMode) {
    setError("");

    if (workText.trim().length < 300) {
      setError("Adicione um texto ou PDF com pelo menos 300 caracteres antes de usar os modos de estudo.");
      setStep("text");
      return;
    }

    setStudyMode(selectedMode);
    setIsStudyLoading(true);

    try {
      if (selectedMode === "video") {
        const response = await fetch("/api/video-search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            workText,
            profile: hasProfile ? profile : null,
            evaluation
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível buscar vídeos.");
        }

        setVideoQuery(data.query ?? "");
        setVideos(data.videos ?? []);
        setStudyResult(null);
        return;
      }

      const response = await fetch("/api/study-tools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: selectedMode,
          workText,
          profile: hasProfile ? profile : null,
          evaluation,
          questions,
          answers: answerList
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível gerar o estudo.");
      }

      setStudyResult({ mode: "infographic", content: normalizeInfographic(data.result) });
      setVideos([]);
      setVideoQuery("");
    } catch (studyError) {
      setError(studyError instanceof Error ? studyError.message : "Erro inesperado ao gerar estudo.");
    } finally {
      setIsStudyLoading(false);
    }
  }

  async function downloadInfographicPdf() {
    if (!studyResult?.content) {
      setError("Gere o infográfico antes de baixar o PDF.");
      return;
    }

    setError("");

    try {
      const response = await fetch("/api/infographic-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: "Infográfico StudyAI",
          content: infographicToPdfText(studyResult.content)
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Não foi possível gerar o PDF.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "studyai-infografico.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : "Erro inesperado ao baixar PDF.");
    }
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
    setStudyResult(null);
    setVideos([]);
    setVideoQuery("");
    setError("");
  }

  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
    setAuthError("");
    setIsAuthOpen(true);
  }

  function saveUser(user: AuthUser) {
    setAuthUser(user);
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  }

  function submitAuth() {
    const email = authForm.email.trim().toLowerCase();
    const name = authForm.name.trim();
    const password = authForm.password.trim();

    setAuthError("");

    if (!email.includes("@")) {
      setAuthError("Digite um e-mail válido.");
      return;
    }

    if (password.length < 6) {
      setAuthError("Use uma senha com pelo menos 6 caracteres.");
      return;
    }

    const savedUserText = window.localStorage.getItem(AUTH_STORAGE_KEY);
    let savedUser: AuthUser | null = null;

    try {
      savedUser = savedUserText ? (JSON.parse(savedUserText) as AuthUser) : null;
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    if (authMode === "login") {
      if (!savedUser || savedUser.email.toLowerCase() !== email) {
        setAuthError("Cadastre-se primeiro neste navegador para entrar.");
        return;
      }

      saveUser(savedUser);
      setIsAuthOpen(false);
      setAuthForm({ name: "", email: "", password: "" });
      return;
    }

    if (name.length < 2) {
      setAuthError("Digite seu nome para criar a conta.");
      return;
    }

    saveUser({ name, email, plan: "free" });
    setIsAuthOpen(false);
    setAuthForm({ name: "", email: "", password: "" });
  }

  function logout() {
    setAuthUser(null);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  function choosePlan(plan: Plan) {
    if (!authUser) {
      setIsPlansOpen(false);
      openAuth("signup");
      return;
    }

    saveUser({ ...authUser, plan });
    setIsPlansOpen(false);
  }

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <Image
            className="brand-logo"
            src="/studyai-logo.svg"
            alt="StudyAI"
            width={220}
            height={82}
            priority
          />
        </div>
        <div className="topbar-actions">
          <button className="button upgrade-button" type="button" onClick={() => setIsPlansOpen(true)}>
            Fazer upgrade
          </button>

          {authUser ? (
            <div className="account-box">
              <div>
                <strong>{authUser.name}</strong>
                <span>{authUser.plan === "plus" ? "Plano Plus" : "Plano gratuito"}</span>
              </div>
              <button className="button secondary small-button" type="button" onClick={logout}>
                Sair
              </button>
            </div>
          ) : (
            <div className="auth-actions">
              <button className="button secondary small-button" type="button" onClick={() => openAuth("login")}>
                Entrar
              </button>
              <button className="button small-button" type="button" onClick={() => openAuth("signup")}>
                Cadastrar
              </button>
            </div>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="intro">
          <span className="intro-label">Estudo personalizado com IA</span>
          <h1>Aprenda mais. Dependa menos.</h1>
          <p>
            Envie um texto ou PDF, responda perguntas sobre o conteúdo e veja exatamente quais
            temas precisam de mais atenção.
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
            <button
              className={`tab ${step === "profile" ? "active" : ""}`}
              type="button"
              onClick={() => setStep("profile")}
            >
              Perfil
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
            <button
              className={`tab ${step === "study" ? "active" : ""}`}
              type="button"
              onClick={() => setStep("study")}
            >
              Estudo
            </button>
            <button className={`tab ${step === "chat" ? "active" : ""}`} type="button" onClick={() => setStep("chat")}>
              Chat
            </button>
          </div>

          <div className="panel">
            {step === "home" && (
              <section className="home-panel">
                <div className="home-copy">
                  <span className="eyebrow">Como o StudyAI funciona</span>
                  <h2>Um teste de entendimento feito a partir do seu próprio trabalho.</h2>
                  <p>
                    O StudyAI lê o conteúdo que você envia, cria perguntas específicas e avalia se
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
                    <p>Receba uma avaliação honesta e veja quais conteúdos revisar.</p>
                  </div>
                  <div className="step-card">
                    <strong>4</strong>
                    <h3>Tire dúvidas</h3>
                    <p>Use o chat tutor para entender melhor os conteúdos em que errou.</p>
                  </div>
                </div>

                <div className="example-showcase" aria-label="Exemplos do StudyAI">
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
                  <strong>Importante:</strong> o StudyAI não faz o trabalho pelo aluno. Ele ajuda a
                  descobrir se o conteúdo foi realmente aprendido.
                </div>

                <div className="actions">
                  <button className="button" type="button" onClick={() => setStep(hasProfile ? "text" : "profile")}>
                    Começar
                  </button>
                </div>
              </section>
            )}

            {step === "profile" && (
              <section className="profile-panel">
                <div className="section-head">
                  <span className="eyebrow">Perfil de aprendizagem</span>
                  <h2>Conte um pouco sobre como você estuda.</h2>
                  <p>
                    Essas respostas servem apenas para adaptar a experiência de estudo. O StudyAI não faz diagnóstico
                    de TDAH, autismo, dislexia ou qualquer condição médica.
                  </p>
                </div>

                <div className="privacy-note">
                  <strong>Privacidade:</strong> o perfil fica só nesta sessão do navegador. Você pode editar ou excluir
                  quando quiser.
                </div>

                <div className="profile-grid">
                  <label>
                    Concentração
                    <select
                      value={profile.concentration}
                      onChange={(event) => setProfile((current) => ({ ...current, concentration: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      <option>Consigo focar bem</option>
                      <option>Perco o foco com facilidade</option>
                      <option>Preciso de pausas frequentes</option>
                    </select>
                  </label>

                  <label>
                    Organização
                    <select
                      value={profile.organization}
                      onChange={(event) => setProfile((current) => ({ ...current, organization: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      <option>Gosto de roteiro passo a passo</option>
                      <option>Prefiro estudar livremente</option>
                      <option>Tenho dificuldade para organizar o estudo</option>
                    </select>
                  </label>

                  <label>
                    Leitura
                    <select
                      value={profile.reading}
                      onChange={(event) => setProfile((current) => ({ ...current, reading: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      <option>Leio textos longos sem problema</option>
                      <option>Prefiro textos curtos</option>
                      <option>Tenho dificuldade com textos muito densos</option>
                    </select>
                  </label>

                  <label>
                    Compreensão
                    <select
                      value={profile.comprehension}
                      onChange={(event) => setProfile((current) => ({ ...current, comprehension: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      <option>Entendo melhor com exemplos</option>
                      <option>Entendo melhor com explicação simples</option>
                      <option>Preciso que o conteúdo venha por etapas</option>
                    </select>
                  </label>

                  <label>
                    Memória
                    <select
                      value={profile.memory}
                      onChange={(event) => setProfile((current) => ({ ...current, memory: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      <option>Lembro melhor lendo</option>
                      <option>Lembro melhor praticando</option>
                      <option>Esqueço rápido se não revisar</option>
                    </select>
                  </label>

                  <label>
                    Estímulos
                    <select
                      value={profile.stimuli}
                      onChange={(event) => setProfile((current) => ({ ...current, stimuli: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      <option>Ambiente não me atrapalha muito</option>
                      <option>Barulho e distrações me atrapalham</option>
                      <option>Prefiro telas mais limpas e diretas</option>
                    </select>
                  </label>

                  <label>
                    Comunicação
                    <select
                      value={profile.communication}
                      onChange={(event) => setProfile((current) => ({ ...current, communication: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      <option>Gosto de explicações diretas</option>
                      <option>Gosto de perguntas guiadas</option>
                      <option>Gosto de exemplos do cotidiano</option>
                    </select>
                  </label>

                  <label>
                    Preferência de recurso
                    <select
                      value={profile.preference}
                      onChange={(event) => setProfile((current) => ({ ...current, preference: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      <option>Visual</option>
                      <option>Texto</option>
                      <option>Áudio ou vídeo</option>
                      <option>Atividades práticas</option>
                    </select>
                  </label>

                  <label>
                    Tempo de foco
                    <select
                      value={profile.focusTime}
                      onChange={(event) => setProfile((current) => ({ ...current, focusTime: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      <option>Até 10 minutos</option>
                      <option>10 a 20 minutos</option>
                      <option>20 a 40 minutos</option>
                      <option>Mais de 40 minutos</option>
                    </select>
                  </label>

                  <label>
                    Diagnóstico informado pelo aluno (opcional)
                    <input
                      value={profile.diagnosis}
                      onChange={(event) => setProfile((current) => ({ ...current, diagnosis: event.target.value }))}
                      placeholder="Opcional. Ex.: já tenho um diagnóstico informado por profissional"
                    />
                  </label>
                </div>

                <label className="wide-field">
                  Algo mais que atrapalha ou ajuda seus estudos?
                  <textarea
                    value={profile.notes}
                    onChange={(event) => setProfile((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Ex.: prefiro exemplos curtos, preciso revisar várias vezes, gosto de mapas mentais..."
                  />
                </label>

                <div className="actions">
                  <button className="button" type="button" onClick={saveProfile}>
                    Salvar perfil
                  </button>
                  {hasProfile && (
                    <button className="button secondary" type="button" onClick={deleteProfile}>
                      Excluir perfil
                    </button>
                  )}
                  <button className="button secondary" type="button" onClick={() => setStep("text")}>
                    Pular por enquanto
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
                  <button className="button secondary" type="button" onClick={() => setStep("study")}>
                    Abrir modos de estudo
                  </button>
                  <button className="button secondary" type="button" onClick={resetAll}>
                    Novo teste
                  </button>
                </div>
              </>
            )}

            {step === "study" && (
              <section className="study-panel">
                <div className="section-head">
                  <span className="eyebrow">Modos de estudo</span>
                  <h2>Escolha como quer estudar este conteúdo.</h2>
                  <p>
                    O StudyAI usa seu perfil, o texto enviado e sua avaliação para sugerir vídeos ou montar um
                    infográfico visual do conteúdo.
                  </p>
                </div>

                {!hasProfile && (
                  <div className="privacy-note">
                    Para uma personalização melhor, preencha o perfil de aprendizagem. O modo de estudo ainda funciona
                    sem ele.
                  </div>
                )}

                <div className="study-guide">
                  <div>
                    <strong>Como usar</strong>
                    <p>
                      Escolha uma opção abaixo para estudar o conteúdo de forma mais objetiva. O chat continua separado
                      para dúvidas livres.
                    </p>
                  </div>
                  <button
                    className="button"
                    type="button"
                    onClick={() => void generateStudyMode(studyMode)}
                    disabled={isStudyLoading || workText.trim().length < 300}
                  >
                    {isStudyLoading ? "Gerando..." : "Gerar opção selecionada"}
                  </button>
                </div>

                <div className="mode-grid" aria-label="Modos de estudo">
                  <button
                    className={`mode-card ${studyMode === "video" ? "active" : ""}`}
                    type="button"
                    onClick={() => void generateStudyMode("video")}
                    disabled={isStudyLoading}
                  >
                    <strong>Vídeo</strong>
                    <span>Busca vídeos reais e relevantes no YouTube.</span>
                  </button>
                  <button
                    className={`mode-card ${studyMode === "infographic" ? "active" : ""}`}
                    type="button"
                    onClick={() => void generateStudyMode("infographic")}
                    disabled={isStudyLoading}
                  >
                    <strong>Infográfico</strong>
                    <span>Cria blocos visuais, relações, comparação e perguntas rápidas.</span>
                  </button>
                </div>

                {workText.trim().length < 300 ? (
                  <div className="empty-state">Adicione um texto ou PDF na aba Trabalho para liberar os modos.</div>
                ) : (
                  <div className="study-output">
                    {isStudyLoading && <div className="empty-state">Preparando o modo de estudo...</div>}

                    {!isStudyLoading && studyMode === "video" && (
                      <>
                        {videoQuery && (
                          <div className="file-status">
                            <strong>Busca usada</strong>
                            <span>{videoQuery}</span>
                          </div>
                        )}

                        {videos.length > 0 ? (
                          <div className="video-list">
                            {videos.map((video) => (
                              <article className="video-card" key={video.url}>
                                <h3>{video.title}</h3>
                                <p>{video.description || "Descrição não disponível."}</p>
                                <span>
                                  {video.channel} • {video.duration}
                                </span>
                                <a href={video.url} target="_blank" rel="noreferrer">
                                  Abrir vídeo original
                                </a>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-state">Clique em Vídeo para buscar aulas sobre este conteúdo.</div>
                        )}
                      </>
                    )}

                    {!isStudyLoading && studyResult && studyMode === "infographic" && (
                      <article className="generated-study">
                        <InfographicView infographic={studyResult.content} />
                        <button className="button" type="button" onClick={() => void downloadInfographicPdf()}>
                          Baixar PDF
                        </button>
                      </article>
                    )}

                    {!isStudyLoading && !studyResult && studyMode === "infographic" && (
                      <div className="empty-state">
                        Clique em Infográfico ou em Gerar opção selecionada para criar um material visual.
                      </div>
                    )}
                  </div>
                )}

                <div className="actions">
                  <button className="button secondary" type="button" onClick={() => setStep("profile")}>
                    Editar perfil
                  </button>
                  <button className="button secondary" type="button" onClick={() => setStep("text")}>
                    Voltar ao trabalho
                  </button>
                </div>
              </section>
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
                            <strong>{message.role === "user" ? "Você" : "Tutor StudyAI"}</strong>
                            <p>{message.content}</p>
                          </div>
                        ))
                      )}
                      {isChatLoading && (
                        <div className="chat-message assistant">
                          <strong>Tutor StudyAI</strong>
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

      <footer className="site-footer">
        <div>
          <strong>StudyAI</strong>
          <p>Ferramenta escolar com IA para testar entendimento, revisar conteúdos e estudar melhor.</p>
        </div>
        <div>
          <span>E-mail</span>
          <a href="mailto:contato@studyai.com.br">contato@studyai.com.br</a>
        </div>
        <div>
          <span>Telefone</span>
          <a href="tel:+5511940202026">(11) 94020-2026</a>
        </div>
        <div>
          <span>Parcerias</span>
          <div className="partner-list" aria-label="Parcerias">
            <span className="partner-item">
              <Image src="/gemini-logo.svg" alt="" width={28} height={28} />
              Gemini API
            </span>
            <span className="partner-item">
              <Image src="/chrome-logo.svg" alt="" width={28} height={28} />
              Google Chrome
            </span>
          </div>
        </div>
      </footer>

      {isAuthOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <section className="modal-card auth-modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow">Conta StudyAI</span>
                <h2 id="auth-title">{authMode === "login" ? "Entrar na conta" : "Criar cadastro"}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsAuthOpen(false)} aria-label="Fechar">
                x
              </button>
            </div>

            <div className="auth-switch" aria-label="Tipo de acesso">
              <button
                className={authMode === "login" ? "active" : ""}
                type="button"
                onClick={() => setAuthMode("login")}
              >
                Login
              </button>
              <button
                className={authMode === "signup" ? "active" : ""}
                type="button"
                onClick={() => setAuthMode("signup")}
              >
                Cadastro
              </button>
            </div>

            <div className="auth-form">
              {authMode === "signup" && (
                <label>
                  Nome
                  <input
                    value={authForm.name}
                    onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Seu nome"
                  />
                </label>
              )}
              <label>
                E-mail
                <input
                  value={authForm.email}
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="voce@email.com"
                  type="email"
                />
              </label>
              <label>
                Senha
                <input
                  value={authForm.password}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Mínimo de 6 caracteres"
                  type="password"
                />
              </label>

              <p className="auth-note">
                Esta primeira versão salva apenas nome, e-mail e plano no navegador. A senha não é armazenada.
              </p>

              {authError && <div className="alert compact-alert">{authError}</div>}

              <button className="button" type="button" onClick={submitAuth}>
                {authMode === "login" ? "Entrar" : "Criar cadastro"}
              </button>
            </div>
          </section>
        </div>
      )}

      {isPlansOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="plans-title">
          <section className="modal-card plans-modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow">Planos</span>
                <h2 id="plans-title">Escolha como quer usar o StudyAI.</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsPlansOpen(false)} aria-label="Fechar">
                x
              </button>
            </div>

            <div className="plans-grid">
              <article className="plan-card">
                <span>Gratuito</span>
                <h3>R$ 0</h3>
                <p>Para testar o estudo com IA e usar as funções principais.</p>
                <ul>
                  <li>Colar texto e enviar PDF</li>
                  <li>5 perguntas personalizadas</li>
                  <li>Avaliação de entendimento</li>
                  <li>Chat tutor e modos de estudo</li>
                  <li>Limite diário padrão da API</li>
                </ul>
                <button className="button secondary" type="button" onClick={() => choosePlan("free")}>
                  Usar gratuito
                </button>
              </article>

              <article className="plan-card highlighted">
                <span>Plus</span>
                <h3>R$ 19,90/mês</h3>
                <p>Para quem quer estudar mais vezes e ter uma experiência mais completa.</p>
                <ul>
                  <li>Mais testes e mensagens por dia</li>
                  <li>Infográficos mais completos</li>
                  <li>Prioridade para novas funções</li>
                  <li>Organização avançada do estudo</li>
                  <li>Suporte por contato direto</li>
                </ul>
                <button className="button" type="button" onClick={() => choosePlan("plus")}>
                  Escolher Plus
                </button>
              </article>
            </div>

            <p className="auth-note">
              O upgrade ainda é demonstrativo no localhost. Pagamento real pode ser integrado depois.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

function InfographicView({ infographic }: { infographic: InfographicResult }) {
  return (
    <div className="infographic-board">
      <header className="infographic-hero">
        <span className="eyebrow">Infográfico StudyAI</span>
        <h3>{infographic.title}</h3>
        <p>{infographic.centralIdea}</p>
        {infographic.visualMetaphor && (
          <div className="visual-metaphor">
            <strong>Imagem mental</strong>
            <span>{infographic.visualMetaphor}</span>
          </div>
        )}
      </header>

      <div className="concept-grid">
        {infographic.sections.map((section, index) => (
          <section className="concept-card" key={`${section.title}-${index}`}>
            <div className="concept-card-head">
              <span>{section.icon || `0${index + 1}`}</span>
              <strong>{section.title}</strong>
            </div>
            <p>{section.summary}</p>
            <div className="importance-bar" aria-label={`Importância: ${section.importance}%`}>
              <span style={{ width: `${Math.min(Math.max(section.importance, 35), 100)}%` }} />
            </div>
          </section>
        ))}
      </div>

      {infographic.connections.length > 0 && (
        <section className="visual-section">
          <h4>Como as ideias se conectam</h4>
          <div className="connection-map">
            {infographic.connections.map((connection, index) => (
              <div className="connection-row" key={`${connection.from}-${connection.to}-${index}`}>
                <strong>{connection.from}</strong>
                <span>{connection.label}</span>
                <strong>{connection.to}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {infographic.timeline.length > 0 && (
        <section className="visual-section">
          <h4>Linha do tempo ou etapas</h4>
          <div className="timeline">
            {infographic.timeline.map((item, index) => (
              <div className="timeline-item" key={`${item.label}-${index}`}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {infographic.comparison.length > 0 && (
        <section className="visual-section">
          <h4>Compare para entender</h4>
          <div className="comparison-grid">
            {infographic.comparison.map((item, index) => (
              <div className="comparison-card" key={`${item.left}-${item.right}-${index}`}>
                <div>
                  <strong>{item.left}</strong>
                  <strong>{item.right}</strong>
                </div>
                <p>{item.note}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="visual-section split-section">
        <div>
          <h4>Resumo rápido</h4>
          <ul>
            {infographic.quickSummary.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Treino sem gabarito</h4>
          <ol>
            {infographic.reviewQuestions.map((question, index) => (
              <li key={`${question}-${index}`}>{question}</li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}

function normalizeInfographic(value: unknown): InfographicResult {
  const candidate = value && typeof value === "object" ? (value as Partial<InfographicResult>) : {};
  const sections = normalizeArray(candidate.sections).slice(0, 6).map((item, index) => {
    const section = item as Partial<InfographicResult["sections"][number]>;

    return {
      title: cleanText(section.title, `Ponto ${index + 1}`),
      summary: cleanText(section.summary, "Revise este ponto do conteúdo."),
      icon: cleanText(section.icon, `0${index + 1}`),
      importance: Number.isFinite(Number(section.importance)) ? Number(section.importance) : 70
    };
  });

  return {
    title: cleanText(candidate.title, "Infográfico de estudo"),
    centralIdea: cleanText(candidate.centralIdea, "Veja os pontos principais do conteúdo de forma organizada."),
    visualMetaphor: cleanText(candidate.visualMetaphor, ""),
    sections:
      sections.length > 0
        ? sections
        : [
            {
              title: "Ideia principal",
              summary: "Revise a ideia central do conteúdo e tente explicá-la com suas próprias palavras.",
              icon: "01",
              importance: 80
            }
          ],
    connections: normalizeArray(candidate.connections).slice(0, 4).map((item) => {
      const connection = item as Partial<InfographicResult["connections"][number]>;

      return {
        from: cleanText(connection.from, "Ideia A"),
        to: cleanText(connection.to, "Ideia B"),
        label: cleanText(connection.label, "se relaciona com")
      };
    }),
    timeline: normalizeArray(candidate.timeline).slice(0, 5).map((item) => {
      const timelineItem = item as Partial<InfographicResult["timeline"][number]>;

      return {
        label: cleanText(timelineItem.label, "Etapa"),
        detail: cleanText(timelineItem.detail, "Ponto importante do conteúdo.")
      };
    }),
    comparison: normalizeArray(candidate.comparison).slice(0, 4).map((item) => {
      const comparisonItem = item as Partial<InfographicResult["comparison"][number]>;

      return {
        left: cleanText(comparisonItem.left, "Conceito 1"),
        right: cleanText(comparisonItem.right, "Conceito 2"),
        note: cleanText(comparisonItem.note, "Compare estes pontos para entender melhor.")
      };
    }),
    quickSummary: withFallback(
      normalizeStringArray(candidate.quickSummary).slice(0, 5),
      ["Explique a ideia principal sem copiar o texto.", "Revise os termos mais importantes do conteúdo."]
    ),
    reviewQuestions: withFallback(
      normalizeStringArray(candidate.reviewQuestions).slice(0, 5),
      ["Qual é a ideia principal desse conteúdo?", "Como você explicaria esse tema para outra pessoa?"]
    )
  };
}

function normalizeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function cleanText(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function withFallback(items: string[], fallback: string[]) {
  return items.length > 0 ? items : fallback;
}

function infographicToPdfText(infographic: InfographicResult) {
  const lines = [
    infographic.title,
    "",
    `Ideia central: ${infographic.centralIdea}`,
    infographic.visualMetaphor ? `Imagem mental: ${infographic.visualMetaphor}` : "",
    "",
    "Blocos principais:",
    ...infographic.sections.map(
      (section) => `- ${section.title}: ${section.summary} (importância: ${section.importance}%)`
    ),
    "",
    "Conexões:",
    ...infographic.connections.map(
      (connection) => `- ${connection.from} -> ${connection.to}: ${connection.label}`
    ),
    "",
    "Linha do tempo ou etapas:",
    ...infographic.timeline.map((item) => `- ${item.label}: ${item.detail}`),
    "",
    "Comparações:",
    ...infographic.comparison.map((item) => `- ${item.left} x ${item.right}: ${item.note}`),
    "",
    "Resumo rápido:",
    ...infographic.quickSummary.map((item) => `- ${item}`),
    "",
    "Treino sem gabarito:",
    ...infographic.reviewQuestions.map((item, index) => `${index + 1}. ${item}`)
  ];

  return lines.filter((line) => line !== "").join("\n");
}
