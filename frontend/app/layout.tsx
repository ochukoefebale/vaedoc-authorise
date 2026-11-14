import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Vaedoc Authorise | Managed care workspace",
  description:
    "A supervised demonstration of hospital insurance authorisation workflows.",
  icons: { icon: "/favicon.svg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body>{children}</body>
    </html>
  );
}
