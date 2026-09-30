export type AiFeatureMode="disabled"|"local"|"server";
export function aiFeatureAvailability(mode:AiFeatureMode,nodeEnv:string|undefined){
 if(mode==="disabled")return {allowed:false as const,code:"AI_DISABLED",status:403,message:"Optional AI analysis is disabled."};
 if(mode==="local"&&nodeEnv!=="development")return {allowed:false as const,code:"AI_LOCAL_PRODUCTION_REJECTED",status:403,message:"Local AI mode is unavailable in production."};
 if(mode==="server")return {allowed:false as const,code:"AUTH_REQUIRED",status:503,message:"Server AI mode requires application authentication, which is not configured."};
 return {allowed:true as const};
}
