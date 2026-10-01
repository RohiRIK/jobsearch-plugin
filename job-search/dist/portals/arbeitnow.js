#!/usr/bin/env bun
// @bun
import{parseArgs}from"util";var UA="Mozilla/5.0 (compatible; job-search-workspace/1.0; personal use)";async function fetchWithRetry(url,extra={}){let lastErr;for(let attempt=0;attempt<2;attempt++){try{let res=await fetch(url,{...extra,headers:{"user-agent":UA,...extra.headers??{}},signal:AbortSignal.timeout(15000)});if(res.ok||res.status<500&&res.status!==429)return res;lastErr=Error(`HTTP ${res.status}`)}catch(e){lastErr=e}if(attempt===0)await new Promise((r)=>setTimeout(r,800))}throw lastErr instanceof Error?lastErr:Error(String(lastErr))}var API="https://www.arbeitnow.com/api/job-board-api",MAX_PAGES=3,HELP=`arbeitnow-cli \u2014 search Arbeitnow (EU/Germany-heavy job board) via its public API.

USAGE
  bun run src/cli.ts search -q <text> [--limit N] [--format json]

FLAGS
  --query, -q <text>   Filter title/company/tags/description (client-side; API is paginated, no search param)
  --limit, -n <n>      Cap results (default 25)
  --format <fmt>       json (default; only format)
  -h, --help           Show this help

OUTPUT
  { meta: { count, source, attribution }, results: [{ title, company, location, url, remote, tags }] }
  Exit 0 = success, 1 = error. Scans up to ${MAX_PAGES} API pages. Personal use only.`;async function main(){let{values,positionals}=parseArgs({args:Bun.argv.slice(2),options:{query:{type:"string",short:"q"},limit:{type:"string",short:"n"},format:{type:"string"},help:{type:"boolean",short:"h"}},strict:!1,allowPositionals:!0});if(values.help||positionals[0]!=="search")return process.stdout.write(HELP+`
`),values.help?0:1;let query=typeof values.query==="string"?values.query:"",limit=Math.max(1,parseInt(values.limit??"25",10)||25),terms=query.toLowerCase().split(/\s+/).filter(Boolean);try{let results=[];for(let page=1;page<=MAX_PAGES&&results.length<limit;page++){let res=await fetchWithRetry(`${API}?page=${page}`);if(!res.ok)return process.stderr.write(JSON.stringify({error:`Arbeitnow API ${res.status}`,code:"HTTP"})+`
`),1;let jobs=(await res.json()).data??[];if(jobs.length===0)break;for(let j of jobs){let hay=`${j.title} ${j.company_name} ${(j.tags??[]).join(" ")} ${j.description??""}`.toLowerCase();if(!terms.every((t)=>hay.includes(t)))continue;if(results.push({title:j.title??"",company:j.company_name??"unknown",location:j.location||(j.remote?"Remote (EU)":"unknown"),url:j.url??`https://www.arbeitnow.com/jobs/${j.slug}`,remote:j.remote??!1,tags:j.tags??[]}),results.length>=limit)break}}return process.stdout.write(JSON.stringify({meta:{count:results.length,source:"Arbeitnow",attribution:"https://www.arbeitnow.com"},results},null,2)+`
`),0}catch(e){return process.stderr.write(JSON.stringify({error:String(e),code:"FETCH"})+`
`),1}}if(import.meta.main)process.exit(await main());
