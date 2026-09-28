/* eslint-disable @next/next/no-html-link-for-pages */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "DoubleCheck — Understand it before you run it", description: "Static, evidence-based trust analysis for unfamiliar public GitHub repositories.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="shell"><header><a className="brand" href="/"><span className="brandMark">✓✓</span>DoubleCheck</a><span className="headerNote">Static repository trust analysis</span></header>{children}<footer><span>DoubleCheck never executes repository code.</span><span>Static analysis is not a guarantee of safety.</span></footer></div></body></html>;
}
