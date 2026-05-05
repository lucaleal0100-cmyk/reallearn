import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RealLearn",
  description: "Ferramenta escolar com IA para verificar aprendizado real."
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
