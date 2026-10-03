import {estimatedInputTokens} from "./usage";
import {envelope} from "./prompts";

type FileInput={path:string;lines:Array<{number:number;text:string}>};

function splitText(text:string,maxBytes:number){
  const parts:string[]=[];let current="";let bytes=0;
  for(const char of text){const size=Buffer.byteLength(char,"utf8");if(current&&bytes+size>maxBytes){parts.push(current);current="";bytes=0;}current+=char;bytes+=size;}
  if(current||!parts.length)parts.push(current);return parts;
}

function truncateText(text:string,maxBytes:number){return splitText(text,maxBytes)[0]??"";}

export function mapAnalysisPayload(metadata:unknown,inventory:unknown[],documentation:Array<[string,string]>,system:string,maxInputTokens:number){
  const compactDocs:Array<{path:string;content:string;truncated:boolean}>=[];
  const serialize=()=>envelope({metadata,inventory,documentation:compactDocs});
  if(estimatedInputTokens(system,serialize())>maxInputTokens)throw new Error("AI_MAP_INVENTORY_LIMIT_EXCEEDED");
  for(const [path,content] of documentation){
    const shortened=truncateText(content,4_000),entry={path,content:shortened,truncated:shortened!==content};
    compactDocs.push(entry);
    if(estimatedInputTokens(system,serialize())<=maxInputTokens)continue;
    compactDocs.pop();
  }
  return serialize();
}

export function fileAnalysisPayloads(repositoryMap:unknown,files:FileInput[],system:string,maxInputTokens:number){
  const fragmentBytes=Math.max(512,Math.floor(maxInputTokens/4));
  const fragments=files.flatMap(file=>file.lines.flatMap(line=>splitText(line.text,fragmentBytes).map(text=>({path:file.path,lines:[{number:line.number,text}]}))));
  const payloads:string[]=[];let group:FileInput[]=[];
  const serialize=(items:FileInput[])=>envelope({repositoryMap,files:items});
  for(const fragment of fragments){
    const candidate=[...group,fragment],data=serialize(candidate);
    if(estimatedInputTokens(system,data)<=maxInputTokens){group=candidate;continue;}
    if(!group.length)throw new Error("AI_INPUT_LIMIT_TOO_SMALL");
    payloads.push(serialize(group));group=[fragment];
    if(estimatedInputTokens(system,serialize(group))>maxInputTokens)throw new Error("AI_INPUT_LIMIT_TOO_SMALL");
  }
  if(group.length)payloads.push(serialize(group));
  return payloads;
}
