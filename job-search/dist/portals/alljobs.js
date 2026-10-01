#!/usr/bin/env bun
// @bun
var SEARCH_URL="https://www.alljobs.co.il/SearchResultsGuest.aspx",DETAIL_URL="https://www.alljobs.co.il/Search/UploadSingle.aspx";function writeError(error,code){process.stderr.write(JSON.stringify({error,code})+`
`)}var UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";async function htmlFetch(url){let delay=500;for(let attempt=0;attempt<=6;attempt++){let response=await fetch(url,{headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8","Accept-Language":"he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7"},redirect:"follow"});if(response.status===429||response.status>=500){if(attempt===6)throw Error(`Request failed: ${response.status} ${response.statusText}`);let jitter=Math.floor(Math.random()*500);await new Promise((r)=>setTimeout(r,delay+jitter)),delay=Math.min(delay*2,8000);continue}if(response.status===404)return"";if(!response.ok)throw Error(`Request failed: ${response.status} ${response.statusText}`);return response.text()}throw Error("Request failed after max retries")}function numericEntity(cp){return cp>=0&&cp<=1114111?String.fromCodePoint(cp):""}function decodeHtmlEntities(text){return text.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,dec)=>numericEntity(parseInt(dec,10))).replace(/&#[xX]([0-9a-fA-F]+);/g,(_,hex)=>numericEntity(parseInt(hex,16))).replace(/&nbsp;/g," ")}function stripTags(html){return html.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}function clean(html){return decodeHtmlEntities(stripTags(html))}function parseJobCards(html){let results=[],chunks=html.split(/(?=<a[^>]*href="[^"]*\/Search\/UploadSingle\.aspx\?JobID=\d+)/i).slice(1);for(let chunk of chunks){let idMatch=chunk.match(/JobID=(\d+)/i);if(!idMatch)continue;let id=idMatch[1],title=null,h2Match=chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);if(h2Match)title=clean(h2Match[1]);if(!title)continue;let company=null,companyUrl=null,companyMatch=chunk.match(/href="[^"]*\/Employer\/HP\/Default\.aspx\?cid=(\d+)"[^>]*>([\s\S]*?)<\/a>/i);if(companyMatch)companyUrl=`https://www.alljobs.co.il/Employer/HP/Default.aspx?cid=${companyMatch[1]}`,company=clean(companyMatch[2])||null;let location=null,locSection=chunk.match(/\u05DE\u05D9\u05E7\u05D5\u05DD \u05D4\u05DE\u05E9\u05E8\u05D4[\s\S]*?(?=<b>|<strong>|\u05E1\u05D5\u05D2 \u05DE\u05E9\u05E8\u05D4|$)/i);if(locSection){let cities=[],cityRe=/city=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,cityMatch;while((cityMatch=cityRe.exec(locSection[0]))!==null){let city=clean(cityMatch[1]);if(city&&!cities.includes(city))cities.push(city)}if(cities.length>0)location=cities.join(", ");else{let locText=locSection[0].replace(/\u05DE\u05D9\u05E7\u05D5\u05DD \u05D4\u05DE\u05E9\u05E8\u05D4\s*:?\s*/i,"");location=clean(locText)||null}}let jobType=null,typeSection=chunk.match(/\u05E1\u05D5\u05D2 \u05DE\u05E9\u05E8\u05D4[\s\S]*?(?=<b>|<strong>|\u05D3\u05E8\u05D9\u05E9\u05D5\u05EA|location|$)/i);if(typeSection){let types=[],typeRe=/type=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,typeMatch;while((typeMatch=typeRe.exec(typeSection[0]))!==null){let t=clean(typeMatch[1]);if(t&&!types.includes(t))types.push(t)}if(types.length>0)jobType=types.join(", ")}let date=null,dateMatch=chunk.match(/\u05DC\u05E4\u05E0\u05D9\s+(\d+)\s+(\u05E9\u05E2\u05D5\u05EA|\u05D9\u05DE\u05D9\u05DD|\u05D3\u05E7\u05D5\u05EA|\u05E9\u05E2\u05D5\u05EA)/i);if(dateMatch)date=`\u05DC\u05E4\u05E0\u05D9 ${dateMatch[1]} ${dateMatch[2]}`;let url=`https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=${id}`;results.push({id,title,company,companyUrl,location,jobType,date,url})}return results}function parseJobDetail(html,id){let title="(untitled)",titleMatch=html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);if(titleMatch)title=clean(titleMatch[1]);let company=null,companyUrl=null,companyMatch=html.match(/href="[^"]*\/Employer\/HP\/Default\.aspx\?cid=(\d+)"[^>]*>([\s\S]*?)<\/a>/i);if(companyMatch)companyUrl=`https://www.alljobs.co.il/Employer/HP/Default.aspx?cid=${companyMatch[1]}`,company=clean(companyMatch[2])||null;let location=null,locMatch=html.match(/\u05DE\u05D9\u05E7\u05D5\u05DD \u05D4\u05DE\u05E9\u05E8\u05D4\s*:?\s*([\s\S]*?)(?=<b>|<strong>|\u05E1\u05D5\u05D2 \u05DE\u05E9\u05E8\u05D4)/i);if(locMatch)location=clean(locMatch[1])||null;let jobType=null,typeMatch=html.match(/\u05E1\u05D5\u05D2 \u05DE\u05E9\u05E8\u05D4\s*:?\s*([\s\S]*?)(?=<b>|<strong>|\u05D3\u05E8\u05D9\u05E9\u05D5\u05EA)/i);if(typeMatch)jobType=clean(typeMatch[1])||null;let description=null,requirements=null,reqSplit=html.split(/\u05D3\u05E8\u05D9\u05E9\u05D5\u05EA\s*:/i);if(reqSplit.length>=2)description=clean(reqSplit[0].slice(-2000))||null,requirements=clean(reqSplit[1].slice(0,3000))||null;else{let mainContent=html.match(/class="[^"]*job[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);if(mainContent)description=clean(mainContent[1])||null}let applyUrl=null,applyMatch=html.match(/href="([^"]*apply[^"]*)"/i)||html.match(/href="([^"]*candidat[^"]*)"/i);if(applyMatch)applyUrl=decodeHtmlEntities(applyMatch[1]);let url=`https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=${id}`;return{id,title,company,companyUrl,location,jobType,date:null,url,description,requirements,applyUrl}}var REGIONS={"tel aviv":"2",central:"2",merkaz:"2",haifa:"1",jerusalem:"3","beer sheva":"7",south:"7",north:"10",sharon:"6",shfela:"8"},CATEGORIES={software:"235",computers:"357",internet:"320",qa:"432",devops:"330","data scientist":"1733","data analyst":"1732",bi:"1310","big data":"1671",python:"1694",java:"1153","c++":"1203",fullstack:"1712",frontend:"1758",backend:"1929",cyber:"1553","product manager":"1156",ux:"1373",hr:"661",sales:"493",finance:"576"};function resolveParam(value,map){if(!value)return;if(/^\d+$/.test(value))return value;return map[value.toLowerCase()]??value}function buildUrl(opts){let params=new URLSearchParams;params.set("page",String(opts.page));let position=resolveParam(opts.position,CATEGORIES);if(position)params.set("position",position);let region=resolveParam(opts.region,REGIONS);if(region)params.set("region",region);if(opts.jobType)params.set("type",opts.jobType);if(opts.query)params.set("freetxt",opts.query);return`${SEARCH_URL}?${params.toString()}`}function renderTable(cards){if(cards.length===0)return"No results.";let rows=cards.map((c)=>{let title=(c.title||"").slice(0,40).padEnd(40),company=(c.company||"\u2014").slice(0,24).padEnd(24),loc=(c.location||"\u2014").slice(0,22).padEnd(22),date=(c.date||"\u2014").slice(0,16);return`${c.id.padEnd(11)} ${title} ${company} ${loc} ${date}`}),header="ID".padEnd(11)+" "+"TITLE".padEnd(40)+" "+"COMPANY".padEnd(24)+" "+"LOCATION".padEnd(22)+" DATE";return[header,"-".repeat(header.length),...rows].join(`
`)}async function runSearch(opts){try{let html=await htmlFetch(buildUrl(opts));if(!html)return writeError("Empty response from AllJobs","EMPTY_RESPONSE"),1;let cards=parseJobCards(html);if(opts.limit&&opts.limit>0)cards=cards.slice(0,opts.limit);if(opts.format==="table")process.stdout.write(renderTable(cards)+`
`);else if(opts.format==="plain")process.stdout.write(cards.map((c)=>`${c.title}
  ${c.company||"\u2014"} \xB7 ${c.location||"\u2014"} \xB7 ${c.date||"\u2014"}
  id: ${c.id}
  ${c.url}`).join(`

`)+`
`);else process.stdout.write(JSON.stringify({meta:{count:cards.length,page:opts.page},results:cards},null,2)+`
`);return 0}catch(e){return writeError(e instanceof Error?e.message:String(e),"SEARCH_FAILED"),1}}function renderPlain(d){let lines=[d.title,`Company: ${d.company||"\u2014"}`,`Location: ${d.location||"\u2014"}`,`Type: ${d.jobType||"\u2014"}`,`URL: ${d.url}`];if(d.description)lines.push("",d.description);if(d.requirements)lines.push("","Requirements:",d.requirements);if(d.applyUrl)lines.push("",`Apply: ${d.applyUrl}`);return lines.join(`
`)}async function runDetail(opts){try{let id=opts.id.replace(/.*JobID=/i,"").replace(/[^\d]/g,"");if(!id)return writeError("Could not extract a JobID from the input","BAD_ID"),1;let url=`${DETAIL_URL}?JobID=${id}`,html=await htmlFetch(url);if(!html)return writeError(`Job ${id} not found (empty response)`,"NOT_FOUND"),1;let detail=parseJobDetail(html,id);if(opts.format==="plain")process.stdout.write(renderPlain(detail)+`
`);else process.stdout.write(JSON.stringify(detail,null,2)+`
`);return 0}catch(e){return writeError(e instanceof Error?e.message:String(e),"DETAIL_FAILED"),1}}function parseFlags(argv){let flags={_:[]},alias={q:"query",n:"limit"};for(let i=0;i<argv.length;i++){let a=argv[i];if(a.startsWith("--")||a.startsWith("-")){let key=alias[a.replace(/^-+/,"")]??a.replace(/^-+/,""),next=argv[i+1];if(next===void 0||next.startsWith("-"))flags[key]=!0;else flags[key]=next,i++}else flags._.push(a)}return flags}var HELP=`alljobs-cli \u2014 search jobs on AllJobs.co.il (Israel's largest job board)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]
  bun run src/cli.ts regions
  bun run src/cli.ts categories

SEARCH FLAGS
  --query, -q <text>      Free-text search (Hebrew or English). e.g. "\u05DE\u05E4\u05EA\u05D7 Python"
  --position <id|name>    Category filter. Name or numeric ID. e.g. "software", "235"
  --region <id|name>      Region filter. Name or numeric ID. e.g. "tel aviv", "2"
  --jobtype <id>          Employment type: 4=full-time, 5=part-time, 37=hybrid, etc.
  --page <n>              1-indexed page. Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

DETAIL FLAGS
  --format <fmt>          json (default) | plain.

EXAMPLES
  bun run src/cli.ts search -q "data scientist" --region "tel aviv" --format table
  bun run src/cli.ts search --position software --region central --format table
  bun run src/cli.ts search -q "\u05DE\u05E4\u05EA\u05D7 Python" --region "tel aviv" --format json
  bun run src/cli.ts detail 8547226 --format plain
  bun run src/cli.ts regions
  bun run src/cli.ts categories

REGIONS (usable with --region)
  tel aviv (2), central (2), haifa (1), jerusalem (3),
  beer sheva (7), south (7), north (10), sharon (6), shfela (8)

CATEGORIES (usable with --position)
  software (235), computers (357), internet (320), qa (432),
  python (1694), java (1153), fullstack (1712), frontend (1758),
  backend (1929), cyber (1553), product manager (1156), ux (1373)

OUTPUT
  JSON to stdout (deterministic)
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error

Personal use only \u2014 reads AllJobs' public pages; keep volume low.
`;function printRegions(){let rows=Object.entries(REGIONS).map(([name,id])=>`  ${name.padEnd(16)} (id: ${id})`);process.stdout.write(`AllJobs regions:
`+rows.join(`
`)+`
`)}function printCategories(){let rows=Object.entries(CATEGORIES).map(([name,id])=>`  ${name.padEnd(20)} (id: ${id})`);process.stdout.write(`AllJobs categories:
`+rows.join(`
`)+`
`)}function parseIntFlag(name,raw){let val=parseInt(raw,10);if(isNaN(val))return process.stderr.write(JSON.stringify({error:`--${name} must be a number, got "${raw}"`,code:"BAD_ARG"})+`
`),null;return val}async function main(){let argv=process.argv.slice(2),flags=parseFlags(argv),cmd=flags._[0];if(!cmd||flags.help||flags.h)return process.stdout.write(HELP),cmd?0:1;if(cmd==="regions")return printRegions(),0;if(cmd==="categories")return printCategories(),0;if(cmd==="search"){let fmt=flags.format||"json";if(flags.jobage!==void 0){let v=parseIntFlag("jobage",flags.jobage);if(v===null)return 1;flags.jobage=String(v)}if(flags.page!==void 0){let v=parseIntFlag("page",flags.page);if(v===null)return 1;flags.page=String(v)}if(flags.limit!==void 0){let v=parseIntFlag("limit",flags.limit);if(v===null)return 1;flags.limit=String(v)}let opts={query:typeof flags.query==="string"?flags.query:void 0,position:typeof flags.position==="string"?flags.position:void 0,region:typeof flags.region==="string"?flags.region:void 0,jobType:typeof flags.jobtype==="string"?flags.jobtype:void 0,page:flags.page?Math.max(1,parseInt(flags.page,10)):1,limit:flags.limit?parseInt(flags.limit,10):void 0,format:["json","table","plain"].includes(fmt)?fmt:"json"};return runSearch(opts)}if(cmd==="detail"){let id=flags._[1];if(!id)return process.stderr.write(JSON.stringify({error:"detail requires an <id|url>",code:"NO_ID"})+`
`),1;let fmt=flags.format||"json";return runDetail({id,format:fmt==="plain"?"plain":"json"})}return process.stderr.write(JSON.stringify({error:`Unknown command "${cmd}"`,code:"BAD_CMD"})+`
`),1}main().then((code)=>process.exit(code));
