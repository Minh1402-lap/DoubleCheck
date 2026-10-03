"use client";
import {useState} from "react";
import {readApiResponse} from "@/lib/api-client";
import {findingNarrative,reportVerdict,type ReportFinding} from "@/lib/report-language";
import {redactSecrets} from "@/lib/redaction";
import {DeleteReport} from "./DeleteReport";
import {formatInteger,formatUsd} from "@/lib/format";

type Finding=ReportFinding;
type Note={path:string;disposition:string;reason:string};
export type StaticReport={rulesetVersion:string;repository:{owner:string;name:string;url:string;sha:string};risk:{recommendation:"run"|"review"|"avoid";score:number;reason:string};coverage:{inventoryCount:number;inventoryBytes:number;selectedBytes:number;selectedCount:number;skipped:Array<{path:string;reason?:string;size:number}>};inventory:{languages:string[];packageManagers:string[];manifests:string[];workflows:string[];commands:Array<{filePath:string;lineStart:number;excerpt:string}>;domains:string[]};analysisNotes?:Note[];findings:Finding[]};
type AiReport={models?:{analysis?:string;verifier?:string};decision?:{verdict?:string;reason?:string};usage?:{inputTokens?:number;outputTokens?:number;actualCostMicrousd?:string}};

const titleCase=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());
const disclosureDecision=(note:Note)=>note.disposition==="execution_rules_skipped"?"Execution rules skipped":note.disposition==="reduced_confidence"?"Analyzed with reduced confidence":"Content-based language detection used";
function EvidenceCode({finding}:{finding:Finding}){return <pre className="code evidenceCode" tabIndex={0} aria-label={`Evidence from ${finding.filePath}, lines ${finding.lineStart} to ${finding.lineEnd}`}><code>{redactSecrets(finding.excerpt).split(/\r?\n/).map((line,index)=><span className="evidenceCodeLine" key={index}>{line||" "}{index<finding.excerpt.split(/\r?\n/).length-1?"\n":""}</span>)}</code></pre>}

export function StaticReportView({id,report,aiMode,maxCost,aiError,aiReport,demo=false}:{id?:string;report:StaticReport;aiMode:string;maxCost:number;aiError?:string|null;aiReport?:AiReport|null;demo?:boolean}){
 const [message,setMessage]=useState(aiError??"");const verdict=reportVerdict(report.risk,report.findings.length);
 async function requestAi(){if(!id)return;try{const payload=await readApiResponse(await fetch(`/api/scans/${id}/ai`,{method:"POST"}));setMessage(payload.status==="completed"?"A matching AI result was reused. Refresh to view it.":"Optional AI analysis is queued. Refresh shortly.")}catch(error){setMessage(error instanceof Error?error.message:"AI request failed")}}
 return <main className="report">
  <section className={`reportSummary ${verdict.tone}`} aria-labelledby="report-verdict">
   {demo&&<div className="demoFlag">Sanitized static fixture · no external calls</div>}
   <p className="reportKicker">Static report for {report.repository.owner}/{report.repository.name}</p>
   <h1 id="report-verdict">{verdict.title}</h1>
   <p className="verdictSummary">{verdict.summary}</p>
   <p className="riskScore">Risk score: <strong>{report.risk.score}/100</strong></p>
   <p className="safetyLimit"><strong>Static analysis cannot guarantee that a repository is safe.</strong></p>
   <p className="reportMeta">Pinned commit <code>{report.repository.sha}</code> · Ruleset {report.rulesetVersion}</p>
  </section>

  <section className="section findingsSection" aria-labelledby="important-findings"><h2 id="important-findings">Important findings</h2>{report.findings.length===0?<div className="card emptyFinding"><h3>No rule-based findings</h3><p>DoubleCheck did not find behavior covered by the current rules. This is not proof that the repository is safe.</p></div>:report.findings.map((finding,index)=>{const narrative=findingNarrative(finding,report.risk.recommendation);return <article className="card investigation" key={`${finding.rule}-${index}`}>
   <p className="findingNumber">Finding {index+1}</p><h3>{narrative.title}</h3>
   <div className="investigationCopy"><section><h4>What was found?</h4><p>{narrative.found}</p></section><section><h4>Why was it flagged?</h4><p>{narrative.why}</p></section><section><h4>What does it mean here?</h4><p>{narrative.meaning}</p><p className="assessment"><strong>Assessment:</strong> {narrative.assessment}</p></section></div>
   <section className="findingEvidence" aria-labelledby={`evidence-${index}`}><h4 id={`evidence-${index}`}>Evidence</h4><p className="evidenceLocation"><code>{finding.filePath}</code> · lines {finding.lineStart}–{finding.lineEnd}</p><EvidenceCode finding={finding}/><p className="evidenceExplanation">{narrative.evidenceNote}</p></section>
   <div className="investigationCopy twoColumn"><section><h4>Possible impact</h4><p>{narrative.impact}</p></section><section><h4>Recommended action</h4><p>{narrative.action}</p></section></div>
   <details className="technicalDetails"><summary>Technical details</summary><dl><div><dt>Severity</dt><dd>{titleCase(finding.severity)}</dd></div><div><dt>Confidence</dt><dd>{titleCase(finding.confidence)}</dd></div><div><dt>Rule</dt><dd><code>{finding.rule}</code></dd></div><div><dt>Detection</dt><dd>Deterministic static rule</dd></div></dl></details>
  </article>})}</section>

  <section className="card section nextAction"><h2>What should you do next?</h2><p>{verdict.nextAction}</p></section>

  <div className="reportLowerGrid"><section className="card section"><h2>Coverage</h2><div className="facts"><div className="fact"><label>Files found</label>{report.coverage.inventoryCount}</div><div className="fact"><label>Files analyzed</label>{report.coverage.selectedCount}</div><div className="fact"><label>Files skipped</label>{report.coverage.skipped.length}</div><div className="fact"><label>Bytes analyzed</label>{formatInteger(report.coverage.selectedBytes)}</div></div></section><section className="card section"><h2>Repository inventory</h2><dl className="inventoryList"><div><dt>Languages or extensions</dt><dd>{report.inventory.languages.join(", ")||"None identified"}</dd></div><div><dt>Package managers</dt><dd>{[...new Set(report.inventory.packageManagers)].join(", ")||"None identified"}</dd></div><div><dt>Manifests</dt><dd>{report.inventory.manifests.join(", ")||"None identified"}</dd></div><div><dt>Workflows</dt><dd>{report.inventory.workflows.join(", ")||"None identified"}</dd></div><div><dt>Domains mentioned</dt><dd>{report.inventory.domains.join(", ")||"None identified"}</dd></div></dl></section></div>

  {report.inventory.commands.length?<section className="card section secondarySection"><h2>Commands found in documentation</h2><p className="sectionIntro">Recorded for context, not endorsed by DoubleCheck.</p>{report.inventory.commands.map((command,index)=><div className="documentedCommand" key={index}><p><code>{command.filePath}</code> · line {command.lineStart}</p><pre className="code" tabIndex={0}>{redactSecrets(command.excerpt)}</pre></div>)}</section>:null}

  {report.analysisNotes?.length?<section className="card section secondarySection"><h2>Analysis disclosures</h2><p className="sectionIntro">Some generated or minified files receive reduced-confidence analysis to avoid misleading results.</p><div className="disclosureTable" role="table" aria-label="Analysis decisions"><div className="disclosureHeader" role="row"><span role="columnheader">File</span><span role="columnheader">Analysis decision</span></div>{report.analysisNotes.slice(0,20).map((note,index)=><div className="disclosureRow" role="row" key={`${note.path}-${index}`}><span role="cell"><code>{note.path}</code></span><span role="cell"><strong>{disclosureDecision(note)}</strong><small>{note.reason}</small></span></div>)}</div>{report.analysisNotes.length>20&&<p>And {report.analysisNotes.length-20} more disclosure entries.</p>}</section>:null}

  {report.coverage.skipped.length?<details className="card section secondarySection skippedDetails"><summary>Skipped files ({report.coverage.skipped.length})</summary>{report.coverage.skipped.slice(0,30).map(file=><p key={file.path}><code>{file.path}</code> · {file.reason??"Not selected"}</p>)}{report.coverage.skipped.length>30&&<p>And {report.coverage.skipped.length-30} more.</p>}</details>:null}

  {aiMode!=="disabled"&&<section className="card section secondarySection"><h2>Optional AI analysis</h2>{aiReport?<><p><strong>{titleCase(aiReport.decision?.verdict??"Complete")}</strong> — {aiReport.decision?.reason}</p><p className="muted">Models: {aiReport.models?.analysis} / {aiReport.models?.verifier}; tokens: {formatInteger((aiReport.usage?.inputTokens??0)+(aiReport.usage?.outputTokens??0))}</p></>:<><p>AI is separate from this deterministic report and starts only after an explicit request.</p>{aiMode==="local"&&id?<><p>Uses your OpenAI API credits. Maximum estimated cost: {formatUsd(maxCost)}. Actual cost depends on token usage.</p><button onClick={requestAi}>Analyze with AI</button></>:<p>AI is unavailable until authenticated server mode is implemented.</p>}</>}{message&&<p className="error" role="alert">{message}</p>}</section>}

  {id&&<section className="reportExports" aria-labelledby="export-heading"><h2 id="export-heading">Export or remove this report</h2><div className="actions"><a className="button secondary" href={`/api/reports/${id}/export?format=json`}>Export JSON</a><a className="button secondary" href={`/api/reports/${id}/export?format=markdown`}>Export Markdown</a><DeleteReport id={id}/></div></section>}
 </main>;
}
