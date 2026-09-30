"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {readApiResponse} from "@/lib/api-client";

type State={status:string;progress:number;message:string;sha:string|null;failure:string|null};
const stages=["Collecting repository","Running deterministic rules","Static report complete"];
function statusPayload(value:Record<string,unknown>):State{
  if(typeof value.status!=="string"||typeof value.progress!=="number"||typeof value.progressMessage!=="string")throw new Error("The scan status response was invalid.");
  return {status:value.status,progress:value.progress,message:value.progressMessage,sha:typeof value.commitSha==="string"?value.commitSha:null,failure:typeof value.failureMessage==="string"?value.failureMessage:typeof value.aiFailureMessage==="string"?value.aiFailureMessage:null};
}
export function Progress({id,initial}:{id:string;initial:State}){
 const [state,setState]=useState(initial);const router=useRouter();
 useEffect(()=>{if(["failed","cancelled"].includes(state.status))return;const timer=setInterval(async()=>{try{const next=statusPayload(await readApiResponse(await fetch(`/api/scans/${id}`,{cache:"no-store"})));setState(next);if(["static_complete","completed"].includes(next.status)){clearInterval(timer);router.replace(`/reports/${id}`)}}catch(error){setState(current=>({...current,failure:error instanceof Error?error.message:"Could not refresh scan status."}))}},1500);return()=>clearInterval(timer)},[id,router,state.status]);
 async function cancel(){await readApiResponse(await fetch(`/api/scans/${id}/cancel`,{method:"POST"}))}
 return <div className="card"><div aria-live="polite"><strong>{state.message}</strong>{state.sha&&<p className="muted">Pinned commit: <code>{state.sha.slice(0,12)}</code></p>}</div><div className="progressBar" role="progressbar" aria-valuenow={state.progress} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${state.progress}%`}}/></div><div className="stages">{stages.map((s,i)=><div className={`stage ${state.progress>=(i+1)*33?"done":state.progress>=i*33?"active":""}`} key={s}><span className="dot"/>{s}</div>)}</div>{state.failure&&<p className="error" role="alert">{state.failure}</p>}{!["failed","cancelled","static_complete","completed","cancelling"].includes(state.status)&&<button className="button secondary" onClick={cancel}>Cancel scan</button>}</div>;
}
