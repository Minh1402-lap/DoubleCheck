"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/api-client";

export function ScanForm() {
  const [url,setUrl]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const router=useRouter();
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(""); setBusy(true); try { const response=await fetch("/api/scans",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})}); const data=await readApiResponse(response); if(typeof data.id!=="string") throw new Error("The server response did not include a scan ID."); router.push(`/scans/${data.id}`); } catch(e){setError(e instanceof Error?e.message:"Could not start scan.");setBusy(false);} }
  return <><form className="scanForm" onSubmit={submit}><label className="srOnly" htmlFor="repository-url">Public GitHub repository URL</label><input id="repository-url" type="url" required value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://github.com/owner/repository" autoComplete="url"/><button disabled={busy}>{busy?"Starting…":"DoubleCheck repository"}</button></form>{error&&<p role="alert" className="error">{error}</p>}</>;
}
