import type { EvidenceRef } from "@/lib/types";
import { DeleteReport } from "@/components/DeleteReport";
import Link from "next/link";
import {formatCompactBytes,formatDateTimeUtc} from "@/lib/format";

export type ReportData = {
  id?: string;
  demo?: boolean;
  owner: string;
  repository: string;
  url: string;
  sha: string;
  date: string;
  verdict: "run" | "review" | "avoid";
  confidence: string;
  reason: string;
  completeness: string;
  disclaimer: string;
  purpose: string;
  projectType: string;
  commands: EvidenceRef[];
  observations: Array<EvidenceRef & { id: string; category: string; capability: string; severity: string; confidence: string }>;
  chains: Array<{ id: string; title: string; severity: string; confidence: string; impact: string; verification: string | null }>;
  coverage: { inventoryCount: number; inventoryBytes: number; selectedBytes: number; skippedCount: number };
  decidedBy: string;
  judgeProposal: string;
  agreement: boolean;
};

const bytes = formatCompactBytes;

export function ReportView({ report }: { report: ReportData }) {
  return <main className="report">
    <div className="reportHead">
      <div>
        {report.demo && <div className="demoFlag">Sanitized demo fixture</div>}
        <p className="muted">Repository analysis</p>
        <h1 className="repoTitle">{report.owner}/{report.repository}</h1>
        <p className="muted">Analyzed {formatDateTimeUtc(report.date)} UTC · commit <a className="textLink" href={`${report.url}/commit/${report.sha}`}>{report.sha}</a></p>
      </div>
      <span className={`badge ${report.verdict}`}>{report.verdict} · {report.confidence} confidence</span>
    </div>
    <div className="notice"><strong>{report.reason}</strong><br />{report.disclaimer}</div>
    <div className="actions" style={{ margin: "18px 0 28px" }}>
      {report.id && <>
        <a className="button secondary" href={`/api/reports/${report.id}/export?format=json`}>Export JSON</a>
        <a className="button secondary" href={`/api/reports/${report.id}/export?format=markdown`}>Export Markdown</a>
        {!report.demo && <DeleteReport id={report.id} />}
      </>}
      <Link className="button secondary" href="/">Scan another repository</Link>
    </div>
    <div className="grid">
      <div>
        <section className="card section">
          <h2>Overview</h2><p>{report.purpose}</p>
          <div className="facts">
            <div className="fact"><label>Project type</label>{report.projectType}</div>
            <div className="fact"><label>Policy decision</label>{report.decidedBy.replaceAll("_", " ")}</div>
            <div className="fact"><label>AI proposal</label>{report.judgeProposal} · {report.agreement ? "agreed" : "policy override"}</div>
            <div className="fact"><label>Completeness</label>{report.completeness}</div>
          </div>
        </section>
        <section className="card section">
          <h2>Execution</h2>
          {report.commands.length === 0 ? <p className="muted">No documentation commands were recorded.</p> : report.commands.map((command, i) =>
            <div className="evidence" key={`${command.filePath}-${i}`}>
              <div className="evidenceMeta">Documented by the repository, not endorsed by DoubleCheck · {command.filePath}:{command.lineStart}</div>
              <pre className="code">{command.excerpt}</pre>
            </div>)}
        </section>
        <section className="card section">
          <h2>Security findings</h2>
          {report.observations.length === 0 ? <p className="muted">No validated security observations are present.</p> : report.observations.map((observation) =>
            <article className="evidence" key={observation.id}>
              <div className="evidenceMeta">{observation.severity.toUpperCase()} · {observation.confidence} confidence · {observation.filePath}:{observation.lineStart}-{observation.lineEnd}</div>
              <h3>{observation.capability}</h3><pre className="code">{observation.excerpt}</pre>
            </article>)}
        </section>
        <section className="card section">
          <h2>Supported evidence chains</h2>
          {report.chains.length === 0 ? <p className="muted">No supported high-impact cross-file chain was established.</p> : report.chains.map((chain) =>
            <article className="evidence" key={chain.id}>
              <strong>{chain.title}</strong><p>{chain.impact}</p>
              <div className="evidenceMeta">{chain.severity} · {chain.confidence} confidence · verifier: {chain.verification ?? "not required"}</div>
            </article>)}
        </section>
      </div>
      <aside>
        <section className="card section">
          <h2>Coverage</h2><div className="facts">
            <div className="fact"><label>Inventory</label>{report.coverage.inventoryCount} files</div>
            <div className="fact"><label>Inventory bytes</label>{bytes(report.coverage.inventoryBytes)}</div>
            <div className="fact"><label>Selected bytes</label>{bytes(report.coverage.selectedBytes)}</div>
            <div className="fact"><label>Skipped</label>{report.coverage.skippedCount} files</div>
          </div>
        </section>
        <section className="card section"><h2>Safer next steps</h2>
          <p>Inspect automatic triggers and every cited excerpt before taking action. If review is necessary, use a disposable environment without personal credentials, host mounts, SSH agents, cloud credentials, or Docker socket access.</p>
          <p className="muted">Containers and package-manager script suppression reduce some risk but do not make untrusted code safe.</p>
        </section>
        <section className="card section"><h2>Privacy</h2>
          <p>Reports are private to the creating browser session. Raw collected content is deleted within 24 hours; normalized redacted evidence may be retained for up to 30 days. You can delete this report at any time.</p>
        </section>
      </aside>
    </div>
  </main>;
}
