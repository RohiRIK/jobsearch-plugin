#!/usr/bin/env bun
// @bun
import{parseArgs}from"util";var UA="Mozilla/5.0 (compatible; job-search-workspace/1.0; personal use)";async function fetchWithRetry(url,extra={}){let lastErr;for(let attempt=0;attempt<2;attempt++){try{let res=await fetch(url,{...extra,headers:{"user-agent":UA,...extra.headers??{}},signal:AbortSignal.timeout(15000)});if(res.ok||res.status<500&&res.status!==429)return res;lastErr=Error(`HTTP ${res.status}`)}catch(e){lastErr=e}if(attempt===0)await new Promise((r)=>setTimeout(r,800))}throw lastErr instanceof Error?lastErr:Error(String(lastErr))}var API="https://remoteok.com/api",HELP=`remoteok-cli \u2014 search Remote OK (remote/US-heavy) via its public JSON API.

USAGE
  bun run src/cli.ts search -q <text> [--limit N] [--format json]

FLAGS
  --query, -q <text>   Filter positions/tags/company (client-side; API has no search param)
  --limit, -n <n>      Cap results (default 25)
  --format <fmt>       json (default; only format)
  -h, --help           Show this help

OUTPUT
  { meta: { count, source, attribution }, results: [{ title, company, location, url, tags, date }] }
  Exit 0 = success, 1 = error.

Attribution required by the API ToS: results link back to Remote OK and name it as the source.
Personal use only \u2014 keep volume low.`;async function search(query,limit){let res=await fetchWithRetry(API);if(!res.ok)return process.stderr.write(JSON.stringify({error:`Remote OK API ${res.status}`,code:"HTTP"})+`
`),1;let items=(await res.json()).filter((i)=>i.position),terms=query.toLowerCase().split(/\s+/).filter(Boolean),results=items.filter((i)=>{let hay=`${i.position} ${i.company} ${(i.tags??[]).join(" ")} ${i.description??""}`.toLowerCase();return terms.every((t)=>hay.includes(t))}).slice(0,limit).map((i)=>({title:i.position??"",company:i.company??"unknown",location:i.location||"Remote",url:i.url??`https://remoteok.com/remote-jobs/${i.slug}`,tags:i.tags??[],date:i.date}));return process.stdout.write(JSON.stringify({meta:{count:results.length,source:"Remote OK",attribution:"https://remoteok.com"},results},null,2)+`
`),0}async function main(){let{values,positionals}=parseArgs({args:Bun.argv.slice(2),options:{query:{type:"string",short:"q"},limit:{type:"string",short:"n"},format:{type:"string"},help:{type:"boolean",short:"h"}},strict:!1,allowPositionals:!0});if(values.help||positionals[0]!=="search")return process.stdout.write(HELP+`
`),values.help?0:1;let query=typeof values.query==="string"?values.query:"",limit=Math.max(1,parseInt(values.limit??"25",10)||25);try{return await search(query,limit)}catch(e){return process.stderr.write(JSON.stringify({error:String(e),code:"FETCH"})+`
`),1}}if(import.meta.main)process.exit(await main());
