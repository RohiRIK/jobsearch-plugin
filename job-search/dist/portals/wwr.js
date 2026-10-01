#!/usr/bin/env bun
// @bun
import{parseArgs}from"util";var UA="Mozilla/5.0 (compatible; job-search-workspace/1.0; personal use)";async function fetchWithRetry(url,extra={}){let lastErr;for(let attempt=0;attempt<2;attempt++){try{let res=await fetch(url,{...extra,headers:{"user-agent":UA,...extra.headers??{}},signal:AbortSignal.timeout(15000)});if(res.ok||res.status<500&&res.status!==429)return res;lastErr=Error(`HTTP ${res.status}`)}catch(e){lastErr=e}if(attempt===0)await new Promise((r)=>setTimeout(r,800))}throw lastErr instanceof Error?lastErr:Error(String(lastErr))}var FEED="https://weworkremotely.com/remote-jobs.rss",HELP=`wwr-cli \u2014 search We Work Remotely via its public RSS feed.

USAGE
  bun run src/cli.ts search -q <text> [--limit N] [--format json]

FLAGS
  --query, -q <text>   Filter title/company/description (client-side)
  --limit, -n <n>      Cap results (default 25)
  --format <fmt>       json (default; only format)
  -h, --help           Show this help

OUTPUT
  { meta: { count, source, attribution }, results: [{ title, company, location, url, date }] }
  Exit 0 = success, 1 = error. Personal use only \u2014 reads the public RSS feed.`;function tag(xml,name){return(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]??"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim()}async function main(){let{values,positionals}=parseArgs({args:Bun.argv.slice(2),options:{query:{type:"string",short:"q"},limit:{type:"string",short:"n"},format:{type:"string"},help:{type:"boolean",short:"h"}},strict:!1,allowPositionals:!0});if(values.help||positionals[0]!=="search")return process.stdout.write(HELP+`
`),values.help?0:1;let query=typeof values.query==="string"?values.query:"",limit=Math.max(1,parseInt(values.limit??"25",10)||25),terms=query.toLowerCase().split(/\s+/).filter(Boolean);try{let res=await fetchWithRetry(FEED);if(!res.ok)return process.stderr.write(JSON.stringify({error:`WWR feed ${res.status}`,code:"HTTP"})+`
`),1;let items=(await res.text()).split("<item>").slice(1),results=[];for(let item of items){let rawTitle=tag(item,"title"),link=tag(item,"link"),region=tag(item,"region"),description=tag(item,"description"),sep=rawTitle.indexOf(":"),company=sep>0?rawTitle.slice(0,sep).trim():"unknown",title=sep>0?rawTitle.slice(sep+1).trim():rawTitle,hay=`${rawTitle} ${description}`.toLowerCase();if(!terms.every((t)=>hay.includes(t)))continue;if(results.push({title,company,location:region||"Remote",url:link,date:tag(item,"pubDate")}),results.length>=limit)break}return process.stdout.write(JSON.stringify({meta:{count:results.length,source:"We Work Remotely",attribution:"https://weworkremotely.com"},results},null,2)+`
`),0}catch(e){return process.stderr.write(JSON.stringify({error:String(e),code:"FETCH"})+`
`),1}}if(import.meta.main)process.exit(await main());
