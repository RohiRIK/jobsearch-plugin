#!/usr/bin/env bun
// @bun
import{parseArgs}from"util";var API="https://remotive.com/api/remote-jobs",HELP=`remotive-cli \u2014 search Remotive remote jobs via its public API.

USAGE
  bun run src/cli.ts search -q <text> [--limit N] [--format json]

FLAGS
  --query, -q <text>   Search term (server-side)
  --limit, -n <n>      Cap results (default 25)
  --format <fmt>       json (default; only format)
  -h, --help           Show this help

OUTPUT
  { meta: { count, source, attribution }, results: [{ title, company, location, url, date }] }
  Exit 0 = success, 1 = error.

API legal notice: jobs may not be re-posted to third-party boards; personal tracking use only, link back to Remotive.`;async function main(){let{values,positionals}=parseArgs({args:Bun.argv.slice(2),options:{query:{type:"string",short:"q"},limit:{type:"string",short:"n"},format:{type:"string"},help:{type:"boolean",short:"h"}},strict:!1,allowPositionals:!0});if(values.help||positionals[0]!=="search")return process.stdout.write(HELP+`
`),values.help?0:1;let query=typeof values.query==="string"?values.query:"",limit=Math.max(1,parseInt(values.limit??"25",10)||25);try{let res=await fetch(`${API}?search=${encodeURIComponent(query)}&limit=${limit}`);if(!res.ok)return process.stderr.write(JSON.stringify({error:`Remotive API ${res.status}`,code:"HTTP"})+`
`),1;let results=((await res.json()).jobs??[]).slice(0,limit).map((j)=>({title:j.title??"",company:j.company_name??"unknown",location:j.candidate_required_location||"Remote",url:j.url??"",date:j.publication_date}));return process.stdout.write(JSON.stringify({meta:{count:results.length,source:"Remotive",attribution:"https://remotive.com"},results},null,2)+`
`),0}catch(e){return process.stderr.write(JSON.stringify({error:String(e),code:"FETCH"})+`
`),1}}if(import.meta.main)process.exit(await main());
