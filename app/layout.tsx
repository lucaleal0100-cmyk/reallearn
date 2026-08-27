import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyAI",
  description: "Ferramenta escolar com IA para estudar melhor a partir do próprio conteúdo.",
  icons: {
    icon: "/studyai-icon.svg",
    shortcut: "/studyai-icon.svg",
    apple: "/studyai-icon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
