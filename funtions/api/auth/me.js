const enc=new TextEncoder(),dec=new TextDecoder();
function cookie(request,name){const raw=request.headers.get("Cookie")||"";const hit=raw.split(/;\s*/).find(x=>x.startsWith(name+"="));return hit?hit.slice(name.length+1):null}
function fromB64url(value){value=value.replace(/-/g,"+").replace(/_/g,"/");while(value.length%4)value+="=";const s=atob(value);return Uint8Array.from(s,c=>c.charCodeAt(0))}
async function verify(payload,sig,secret){const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);return crypto.subtle.verify("HMAC",key,fromB64url(sig),enc.encode(payload))}
export async function onRequestGet({request,env}){
  const value=cookie(request,"teacafe_session"); if(!value||!env.SESSION_SECRET)return Response.json({authenticated:false});
  const [payload,sig]=value.split("."); if(!payload||!sig||!(await verify(payload,sig,env.SESSION_SECRET)))return Response.json({authenticated:false});
  try{const user=JSON.parse(dec.decode(fromB64url(payload)));if(!user.exp||user.exp<Math.floor(Date.now()/1000))return Response.json({authenticated:false});return Response.json({authenticated:true,user:{id:user.id,username:user.username,global_name:user.global_name,avatar_url:user.avatar_url}})}catch{return Response.json({authenticated:false})}
}
