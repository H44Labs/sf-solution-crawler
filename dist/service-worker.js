var e=class extends Error{constructor(){super(`All AI providers exhausted after retries`),this.name=`AllProvidersExhaustedError`}},t=class extends Error{constructor(e,t){super(`Auth error ${e}: ${t?.substring(0,300)||`no details`}`),this.status=e,this.body=t,this.name=`AuthError`}},n=3,r=new Set([429,500,503]),i=new Set([401,403]),a=[1e3,2e3,4e3],o=e=>new Promise(t=>setTimeout(t,e));function s(e){return{text:e.content?.[0]?.text??``,tokensUsed:(e.usage?.input_tokens??0)+(e.usage?.output_tokens??0)}}function c(e){return{text:e.choices?.[0]?.message?.content??``,tokensUsed:e.usage?.total_tokens??0}}function l(e,t,n){return{url:`${e.baseUrl}/v1/messages`,headers:{"x-api-key":e.apiKey,"anthropic-version":`2024-10-22`,"anthropic-dangerous-direct-browser-access":`true`,"content-type":`application/json`},body:{model:e.model,max_tokens:4096,system:t,messages:[{role:`user`,content:n}]}}}function u(e,t,n){return{url:`${e.baseUrl}/v1/chat/completions`,headers:{Authorization:`Bearer ${e.apiKey}`,"content-type":`application/json`},body:{model:e.model,messages:[{role:`system`,content:t},{role:`user`,content:n}]}}}function d(e,t,n){return{url:`${e.baseUrl}/openai/v1/chat/completions`,headers:{Authorization:`Bearer ${e.apiKey}`,"content-type":`application/json`},body:{model:e.model,messages:[{role:`system`,content:t},{role:`user`,content:n}]}}}function f(e,t,n){return{url:`${e.baseUrl}/v1beta/models/${e.model}:generateContent?key=${e.apiKey}`,headers:{"content-type":`application/json`},body:{system_instruction:{parts:[{text:t}]},contents:[{parts:[{text:n}]}],generationConfig:{maxOutputTokens:4096}}}}function p(e){return{text:e.candidates?.[0]?.content?.parts?.[0]?.text??``,tokensUsed:(e.usageMetadata?.promptTokenCount??0)+(e.usageMetadata?.candidatesTokenCount??0)}}function m(e,t,n){switch(e.type){case`claude`:return l(e,t,n);case`openai`:return u(e,t,n);case`groq`:return d(e,t,n);case`gemini`:return f(e,t,n)}}function h(e,t){switch(e.type){case`claude`:return s(t);case`gemini`:return p(t);case`openai`:case`groq`:return c(t)}}var g=class{constructor(e,t=o,n=e=>console.log(e)){this.providers=e,this.delay=t,this.logger=n}async sendMessage(r,i){for(let e of this.providers){let o=null;for(let s=0;s<n;s++)try{return await this.callProvider(e,r,i)}catch(r){if(r instanceof t)throw r;o=r,this.logger(`[AI Retry] ${e.type} attempt ${s+1}/${n} failed: ${o.message.substring(0,300)}`),await this.delay(a[s])}this.logger(`[AI ERROR] ${e.type} exhausted all ${n} retries.`)}throw new e}async callProvider(e,n,a){let{url:o,headers:s,body:c}=m(e,n,a),l=await fetch(o,{method:`POST`,headers:s,body:JSON.stringify(c)});if(i.has(l.status)){let e=``;try{e=await l.text()}catch{}throw new t(l.status,e)}if(!l.ok||r.has(l.status)){let e=``;try{e=await l.text()}catch{}throw Error(`HTTP ${l.status}: ${e.substring(0,500)}`)}return h(e,await l.json())}};function _(e){return`You are an expert Solutions Engineer analyzing Salesforce pages to gather data for a NICE WFM Solution Design Document.

## Your Role
You analyze scraped Salesforce page content and:
1. Extract values for template fields from the page data
2. Decide where to navigate next to find remaining fields
3. Use context clues from opportunity names, product names, and SKUs

## Template Fields to Find
${e.map(e=>`- ${e}`).join(`
`)}

## Field Semantics
- [Licensed Agents] = number of licensed WFM agent seats
- [ACD Interval] = time interval in minutes for ACD data collection (typically 15 or 30)
- [ACD Information (Vendor)] = ACD vendor name (e.g., CXone, Avaya, Genesys)
- [ACD Model/Version] = specific ACD product version
- [Target Go Live Date] = planned deployment date
- [Purchased Date] = contract/purchase date
- [Enhanced Strategic Planner] = Yes/No for ESP module
- [AI Forecasting] = Yes/No for AI forecasting capability
- [GDPR Compliance] = Yes/No for GDPR requirements
- [Disaster Recovery] = Yes/No or DR option (Option 1/Option 2)
- [Existing WFM Version] = current WFM version (for migrations)
- [Employee Engagement Manager] = Yes/No for EEM module

## Product Domains
- **WFM** (Workforce Management): scheduling, forecasting, adherence, agent management
- **EEM** (Employee Engagement Manager): agent self-service, shift bidding, time-off
- **Performance Management**: NPM (NICE Performance Manager), CXone Performance Manager — these are connectors within WFM, not standalone products

## Output Format
Respond with ONLY valid JSON:
{
  "extractedFields": [
    {
      "templateField": "[Field Name]",
      "value": "extracted value",
      "rawEvidence": "the exact text from the page that supports this",
      "confidence": "high|medium|low"
    }
  ],
  "nextNavigation": {
    "action": "navigate|click|scroll|done|askUser",
    "target": "CSS selector, link text, or URL",
    "reason": "why navigate here",
    "fieldsSought": ["[Field A]", "[Field B]"]
  }
}

## Important Rules
- ONLY extract values you can see in the provided page data
- NEVER fabricate or guess values
- Use "done" action when all critical fields are found or no more useful pages to visit
- Use "askUser" when you need human clarification
- Look for context clues: opportunity names often contain customer name, product hints
- Quote line items reveal products purchased (WFM, EEM, NPM, etc.)
- Related lists may contain valuable linked records`}function v(){return`You are a quality reviewer for data extracted from Salesforce pages. Your job is to validate extractions and catch hallucinations.

## Your Role
You receive:
1. Fields extracted by the Crawler agent
2. The raw page content that was scraped

For each extracted field, you must:
1. Verify the value exists in the raw page content
2. Verify it makes sense in context (e.g., a number for Licensed Agents, a date for Target Go Live Date)
3. Grade confidence: high, medium, or low

## Grading Rules
- **high**: Value is clearly present in raw text and semantically correct
- **medium**: Value is plausible but not an exact match (e.g., inferred from context)
- **low**: Value cannot be found in raw text, or doesn't make sense in context (likely hallucination)

## Output Format
Respond with ONLY valid JSON:
{
  "reviews": [
    {
      "templateField": "[Field Name]",
      "originalValue": "what the crawler extracted",
      "verdict": "accepted|flagged|rejected",
      "confidence": "high|medium|low",
      "reasoning": "brief explanation",
      "suggestedValue": "corrected value if different, or null"
    }
  ]
}

## Important Rules
- Cross-reference EVERY extracted value against the raw page content
- If you can't find the exact value in the raw content, grade it LOW
- Numbers should be numeric, dates should be date-like, Yes/No fields should be Yes or No
- Don't accept vague or partial matches as high confidence`}function y(){return`You are the final decision maker for a Salesforce data extraction session. You resolve conflicts, determine document configuration, and decide when the crawl is complete.

## Your Role
You receive:
1. Crawler extractions with Reviewer grades
2. The full session state (fields found, fields remaining, pages visited)

You must decide:
1. Accept or reject each field based on Reviewer grades
2. Whether to ask the user for clarification on uncertain fields
3. The deployment type (New Business vs. Migration)
4. Which product sections to include (WFM, EEM, Performance Management)
5. Whether the crawl is complete or needs more pages

## Deployment Type Signals
- **Migration**: opportunity name contains "migration", "upgrade", "conversion"; [Existing WFM Version] field is populated; product SKUs indicate upgrade paths
- **New Business**: no migration signals present; default assumption

## Product Section Signals
- **WFM**: present if any WFM-related fields found (Licensed Agents, ACD info, etc.)
- **EEM**: present if [Employee Engagement Manager] = Yes or EEM products in quotes
- **Performance Management**: present if NPM or CXone Performance Manager found in connectors

## Completion Rules
- If >80% of critical fields found with high confidence: recommend completion
- If 60-80% found: can complete with warning about missing fields
- If <60%: recommend continuing crawl or asking user
- If token budget is near limit: prioritize remaining critical unfilled fields, stop non-essential crawling

## Output Format
Respond with ONLY valid JSON:
{
  "fieldDecisions": [
    {
      "templateField": "[Field Name]",
      "decision": "accepted|askUser|recrawl",
      "reason": "brief explanation"
    }
  ],
  "questionsForUser": [
    {
      "field": "[Field Name]",
      "question": "What is the...?",
      "context": "I found X but need clarification on..."
    }
  ],
  "deploymentType": "new_business|migration|unknown",
  "productsDetected": {
    "wfm": true,
    "eem": false,
    "performanceManagement": false
  },
  "completionAssessment": {
    "isComplete": false,
    "percentFilled": 65,
    "recommendation": "continue|complete|askUser",
    "reason": "explanation"
  }
}`}var b={action:`done`,target:``,reason:`Failed to parse AI response`,fieldsSought:[]},x=class{constructor(e,t){this.aiClient=e,this.fieldRegistry=t}async analyze(e,t){let n=_(this.fieldRegistry),r=this.trimPageData(e),i=JSON.stringify({pageData:r,fieldsRemaining:t.fieldsRemaining,pagesVisited:t.pagesVisited.map(e=>({url:e.url,title:e.title}))});console.log(`[CrawlerAgent] Sending ${r.fields.length} fields, ${i.length} chars to AI`);let a=await this.aiClient.sendMessage(n,i);return this.parseResponse(a.text,a.tokensUsed)}trimPageData(e){let t=e.fields.filter(e=>!e.label.startsWith(`__RAW_TEXT`)),n=e.fields.filter(e=>e.label.startsWith(`__RAW_TEXT`)),r=t.slice(0,80).map(e=>({...e,value:e.value.substring(0,150)}));r.length<10&&n.length>0&&r.push({...n[0],value:n[0].value.substring(0,2e3)});let i=e.quickLinks.slice(0,15).map(e=>({text:e.text.substring(0,80),href:e.href.substring(0,120)}));return{...e,fields:r,quickLinks:i,notes:e.notes.slice(0,5).map(e=>e.substring(0,200))}}parseResponse(e,t){try{let n=e.trim().replace(/^```(?:json)?\s*/i,``).replace(/\s*```\s*$/,``).trim(),r=JSON.parse(n);if(!Array.isArray(r.extractedFields))throw Error(`extractedFields is not an array`);if(typeof r.nextNavigation!=`object`||r.nextNavigation===null)throw Error(`nextNavigation is missing or not an object`);let i=r.extractedFields.map(e=>({templateField:String(e.templateField??``),value:String(e.value??``),rawEvidence:String(e.rawEvidence??``),confidence:e.confidence??`low`})),a=r.nextNavigation;return{extractedFields:i,nextNavigation:{action:a.action??`done`,target:String(a.target??``),reason:String(a.reason??``),fieldsSought:Array.isArray(a.fieldsSought)?a.fieldsSought:[]},tokensUsed:t}}catch{return{extractedFields:[],nextNavigation:b,tokensUsed:t}}}},S=class{constructor(e){this.aiClient=e}async validate(e,t){let n=v(),r=JSON.stringify({extractions:e,rawPageContent:{fields:t.fields,relatedLists:t.relatedLists,notes:t.notes}}),i=await this.aiClient.sendMessage(n,r);return this.parseResponse(i.text,i.tokensUsed,e)}parseResponse(e,t,n){let r=e.replace(/^```(?:json)?\s*/i,``).replace(/\s*```\s*$/,``).trim().match(/\{[\s\S]*\}/);if(r)try{let e=JSON.parse(r[0]);if(e&&typeof e==`object`&&Array.isArray(e.reviews))return{reviews:e.reviews.map(e=>({templateField:e.templateField,originalValue:e.originalValue,verdict:e.verdict,confidence:e.confidence,reasoning:e.reasoning,suggestedValue:e.suggestedValue??null})),tokensUsed:t}}catch{}return{reviews:n.map(e=>({templateField:e.templateField,originalValue:e.value,verdict:`flagged`,confidence:`medium`,reasoning:`Could not parse reviewer response; flagged for manual review.`,suggestedValue:null})),tokensUsed:t}}},C={fieldDecisions:[],questionsForUser:[],deploymentType:`unknown`,productsDetected:{wfm:!1,eem:!1,performanceManagement:!1},completionAssessment:{isComplete:!1,percentFilled:0,recommendation:`continue`,reason:`Failed to parse arbiter response`}},w=class{constructor(e){this.aiClient=e}async decide(e,t,n){let r=y(),i=JSON.stringify({crawlerExtractions:e,reviewResults:t,sessionState:{fieldsFound:Object.keys(n.fieldsFound),fieldsRemaining:n.fieldsRemaining,pagesVisited:n.pagesVisited.length,tokenUsage:n.tokenUsage,deploymentType:n.deploymentType}}),a=await this.aiClient.sendMessage(r,i);return this.parseResponse(a.text,a.tokensUsed)}async holisticReview(e){let t=y(),n=JSON.stringify({type:`final_review`,allFields:e.fieldsFound,deploymentType:e.deploymentType,productsDetected:e.productsDetected,totalFields:Object.keys(e.fieldsFound).length+e.fieldsRemaining.length,filledFields:Object.keys(e.fieldsFound).length}),r=await this.aiClient.sendMessage(t,n);return this.parseFinalReview(r.text,r.tokensUsed)}parseResponse(e,t){try{let n=e.trim().replace(/^```(?:json)?\s*/i,``).replace(/\s*```\s*$/,``).trim().match(/\{[\s\S]*\}/);if(!n)return{...C,tokensUsed:t};let r=JSON.parse(n[0]),i=Array.isArray(r.fieldDecisions)?r.fieldDecisions.map(e=>({templateField:String(e.templateField??``),decision:e.decision??`askUser`,reason:String(e.reason??``)})):[],a=Array.isArray(r.questionsForUser)?r.questionsForUser.map(e=>({field:String(e.field??``),question:String(e.question??``),context:String(e.context??``)})):[],o=r.deploymentType,s=o===`new_business`||o===`migration`||o===`unknown`?o:`unknown`,c=typeof r.productsDetected==`object`&&r.productsDetected!==null?r.productsDetected:{},l={wfm:!!(c.wfm??!1),eem:!!(c.eem??!1),performanceManagement:!!(c.performanceManagement??!1)},u=typeof r.completionAssessment==`object`&&r.completionAssessment!==null?r.completionAssessment:{},d=u.recommendation,f=d===`complete`||d===`askUser`||d===`continue`?d:`continue`;return{fieldDecisions:i,questionsForUser:a,deploymentType:s,productsDetected:l,completionAssessment:{isComplete:!!(u.isComplete??!1),percentFilled:typeof u.percentFilled==`number`?u.percentFilled:0,recommendation:f,reason:String(u.reason??``)},tokensUsed:t}}catch{return{...C,tokensUsed:t}}}parseFinalReview(e,t){try{let n=e.trim().replace(/^```(?:json)?\s*/i,``).replace(/\s*```\s*$/,``).trim().match(/\{[\s\S]*\}/);if(!n)return{approved:!1,issues:[`Failed to parse arbiter response`],tokensUsed:t};let r=JSON.parse(n[0]);return{approved:!!(r.approved??!1),issues:Array.isArray(r.issues)?r.issues.map(e=>String(e)):[],tokensUsed:t}}catch{return{approved:!1,issues:[`Failed to parse arbiter response`],tokensUsed:t}}}},T=class{constructor(e,t,n){this.crawler=e,this.reviewer=t,this.arbiter=n}async processPage(e,t){let n=await this.crawler.analyze(e,t),r={};for(let t of n.extractedFields)t.templateField&&t.value&&(r[t.templateField]={value:t.value,confidence:t.confidence,source:e.pageContext.title,rawEvidence:t.rawEvidence});let i=n.extractedFields.some(e=>e.templateField===`[Existing WFM Version]`&&e.value),a=(e.pageContext.title||``).toLowerCase(),o=i||a.includes(`migration`)||a.includes(`upgrade`)||a.includes(`conversion`),s=n.extractedFields.some(e=>e.templateField===`[Employee Engagement Manager]`&&e.value.toLowerCase().includes(`yes`)),c=n.nextNavigation.action===`done`;return{acceptedFields:r,navigation:n.nextNavigation,questionsForUser:[],deploymentType:o?`migration`:`new_business`,productsDetected:{wfm:!0,eem:s,performanceManagement:!1},isComplete:c,totalTokensUsed:n.tokensUsed}}async finalReview(e){return this.arbiter.holisticReview(e)}},E=`crawl_session_`,D=`crawl_session_index`,O=1440*60*1e3,k=class{static async createSession(e,t,n){return{crawlId:crypto.randomUUID(),seName:e,opportunityName:t,opportunityUrl:n,deploymentType:`unknown`,pagesVisited:[],fieldsFound:{},fieldsRemaining:[],pendingQuestions:[],productsDetected:{wfm:!1,eem:!1,performanceManagement:!1},tokenUsage:{total:0,budget:1e5},status:`crawling`,lastUpdated:new Date().toISOString()}}static async save(e){let t=E+e.crawlId;await chrome.storage.local.set({[t]:e});let n=await this.getIndex();n.includes(e.crawlId)||(n.push(e.crawlId),await chrome.storage.local.set({[D]:n}))}static async load(e){let t=E+e;return(await chrome.storage.local.get([t]))[t]||null}static async delete(e){let t=E+e;await chrome.storage.local.remove([t]);let n=(await this.getIndex()).filter(t=>t!==e);await chrome.storage.local.set({[D]:n})}static async getInterruptedSession(){let e=await this.getIndex();for(let t of e){let e=await this.load(t);if(e&&e.status!==`complete`)return e}return null}static async cleanupStale(){let e=await this.getIndex(),t=Date.now();for(let n of e){let e=await this.load(n);e&&t-new Date(e.lastUpdated).getTime()>O&&await this.delete(n)}}static async getIndex(){return(await chrome.storage.local.get([D]))[D]||[]}},A=class{constructor(e,t){this.isPaused=!1,this.isCancelled=!1,this.eventHandler=null,this.council=e,this.config=t}onEvent(e){this.eventHandler=e}emit(e){this.eventHandler?.(e)}async start(e,t,n,r,i,a){let o=await k.createSession(e,t,n);return await k.save(o),this.emit({type:`log`,message:`Starting analysis of ${t}...`}),this.crawlLoop(o,r,i,a)}async resume(e,t,n,r){let i=await k.load(e);return i?(i.status=`crawling`,this.emit({type:`log`,message:`Resuming analysis of ${i.opportunityName}...`}),this.crawlLoop(i,t,n,r)):null}pause(){this.isPaused=!0}cancel(){this.isCancelled=!0}async crawlLoop(t,n,r,i){for(;t.status===`crawling`&&t.pagesVisited.length<this.config.maxPages;){if(this.isPaused)return t.status=`paused`,await k.save(t),this.emit({type:`paused`,message:`Crawl paused`}),t;if(this.isCancelled)return await k.delete(t.crawlId),t;if(i())return t.status=`paused`,await k.save(t),this.emit({type:`error`,message:`Salesforce session expired. Please re-authenticate and resume.`}),t;let a;try{a=await n(),t.pagesVisited.push({url:a.pageContext.url,title:a.pageContext.title,timestamp:new Date().toISOString()}),this.emit({type:`log`,message:`Reading ${a.pageContext.title}...`})}catch(e){this.emit({type:`error`,message:`Failed to scrape page: ${e}`});break}let o;try{o=await this.council.processPage(a,t)}catch(n){return n instanceof e?(t.status=`paused`,await k.save(t),this.emit({type:`error`,message:`All AI providers exhausted. Please check API keys and try again.`}),t):(t.status=`paused`,await k.save(t),this.emit({type:`error`,message:`AI error: ${n.message||n}`}),t)}for(let[e,n]of Object.entries(o.acceptedFields))t.fieldsFound[e]={value:n.value,confidence:n.confidence,source:n.source,rawEvidence:n.rawEvidence,reviewerVerdict:`accepted`,arbiterDecision:`accepted`},t.fieldsRemaining=t.fieldsRemaining.filter(t=>t!==e);t.deploymentType=o.deploymentType,t.productsDetected=o.productsDetected,t.tokenUsage.total+=o.totalTokensUsed;let s=Object.keys(t.fieldsFound).length+t.fieldsRemaining.length;if(this.emit({type:`progress`,message:`Found ${Object.keys(t.fieldsFound).length}/${s} fields`,data:{found:Object.keys(t.fieldsFound).length,total:s}}),o.questionsForUser.length>0)return t.pendingQuestions=o.questionsForUser,t.status=`askingUser`,await k.save(t),this.emit({type:`question`,message:o.questionsForUser[0].question,data:o.questionsForUser[0]}),t;if(o.isComplete)return t.status=`complete`,await k.save(t),this.emit({type:`complete`,message:`Analysis complete!`}),t;if(t.tokenUsage.total>=t.tokenUsage.budget)return t.status=`complete`,await k.save(t),this.emit({type:`complete`,message:`Token budget reached. Completing with available data.`}),t;(o.navigation.action===`navigate`||o.navigation.action===`click`)&&(this.emit({type:`log`,message:`Navigating to ${o.navigation.target}...`}),await r(o.navigation)||this.emit({type:`log`,message:`Navigation failed, continuing with available data`})),await k.save(t)}return t.status===`crawling`&&(t.status=`complete`,await k.save(t),this.emit({type:`complete`,message:`Maximum pages reached. Completing with available data.`})),t}};chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:!0});var j=null;chrome.runtime.onMessage.addListener((e,t,n)=>(M(e,t).then(n).catch(e=>{console.error(`[SW] Message handler error:`,e),n({error:e.message})}),!0));async function M(e,t){switch(e.type){case`PING`:return{status:`ok`};case`DETECT_MODE`:return P(e);case`START_CRAWL`:{let{seName:t}=e.payload;await N(`[1/7] START_CRAWL received for SE: ${t}`);let n=await I();await N(`[2/7] Config loaded: maxPages=${n.maxPages}, tokenBudget=${n.tokenBudget}`);let r=await chrome.storage.local.get([`personal_api_key`]),i=await chrome.storage.local.get([`fallback_api_key`]),a=r.personal_api_key,o=i.fallback_api_key,s=a||o;if(!s)return await N(`[ERROR] No API key configured. Open Settings to add one.`),{status:`error`,message:`No API key configured`};await N(`[3/7] API key found (${a?`personal`:`fallback`}, ${s.substring(0,8)}...)`);let c=n.providers?.[0]?.type||`groq`,l=c===`claude`?`https://api.anthropic.com`:c===`groq`?`https://api.groq.com`:c===`gemini`?`https://generativelanguage.googleapis.com`:`https://api.openai.com`,u=c===`claude`?`claude-sonnet-4-6-20250514`:c===`groq`?`llama-3.3-70b-versatile`:c===`gemini`?`gemini-2.0-flash`:`gpt-4o`,d=[{type:c,apiKey:s,baseUrl:l,model:u}];await N(`[4/7] Provider: ${c} | Model: ${u} | URL: ${l}`);let f=new g(d,void 0,e=>{N(e)}),p=await L(),m=new T(new x(f,p),new S(f),new w(f));await N(`[5/7] AI Council created (${p.length} template fields registered)`);let h=new A(m,n);j=h,h.onEvent(async e=>{await N(`[Engine/${e.type}] ${e.message}`)});let _=`Unknown Opportunity`,v=``;try{let[e]=await chrome.tabs.query({active:!0,currentWindow:!0});e?.url&&(v=e.url,_=e.title||`Salesforce Opportunity`),await N(`[6/7] Tab detected: "${_}" at ${v.substring(0,60)}...`)}catch(e){await N(`[WARN] Could not read tab info: ${e.message}`)}let y=async()=>{await N(`[Scraper] Sending SCRAPE_PAGE to content script...`);try{let e=await P({type:`SCRAPE_PAGE`});if(!e||e.error)throw await N(`[Scraper ERROR] ${e?.error||`No response from content script`}`),Error(e?.error||`Scrape failed - no response`);return await N(`[Scraper] Page scraped: ${e.fields?.length||0} fields, ${e.relatedLists?.length||0} related lists, ${e.quickLinks?.length||0} quick links`),e}catch(e){throw await N(`[Scraper ERROR] ${e.message}`),e}},b=async e=>{await N(`[Navigator] Navigating to: ${e.target} (reason: ${e.reason})`);try{let t=(await P({type:`NAVIGATE`,payload:e}))?.success??!1;return await N(`[Navigator] Navigation ${t?`succeeded`:`FAILED`}`),t}catch(e){return await N(`[Navigator ERROR] ${e.message}`),!1}},C=()=>!1;await N(`[7/7] Testing AI connection...`);try{let e,t,n={"content-type":`application/json`};c===`gemini`?(t=`${l}/v1beta/models/${u}:generateContent?key=${s}`,e={contents:[{parts:[{text:`Respond with OK.`}]}],generationConfig:{maxOutputTokens:32}}):c===`claude`?(t=`${l}/v1/messages`,e={model:u,max_tokens:32,system:`Respond with OK.`,messages:[{role:`user`,content:`Test`}]},n[`x-api-key`]=s,n[`anthropic-version`]=`2024-10-22`,n[`anthropic-dangerous-direct-browser-access`]=`true`):c===`groq`?(t=`${l}/openai/v1/chat/completions`,e={model:u,messages:[{role:`system`,content:`Respond with OK.`},{role:`user`,content:`Test`}],max_tokens:32},n.Authorization=`Bearer ${s}`):(t=`${l}/v1/chat/completions`,e={model:u,messages:[{role:`system`,content:`Respond with OK.`},{role:`user`,content:`Test`}],max_tokens:32},n.Authorization=`Bearer ${s}`),await N(`[7/7] Testing: POST ${t} with model "${u}"...`);let r=await fetch(t,{method:`POST`,headers:n,body:JSON.stringify(e)}),i=await r.text();if(!r.ok)return await N(`[ERROR] AI test returned HTTP ${r.status}: ${i.substring(0,400)}`),await N(`[ERROR] Fix your API key or model in Settings and try again.`),{status:`error`,message:`HTTP ${r.status}`};await N(`[7/7] AI connection OK! (HTTP ${r.status})`)}catch(e){return await N(`[ERROR] AI connection test failed: ${e.message}`),{status:`error`,message:e.message}}return await N(`[7/7] Starting crawl loop...`),h.start(t,_,v,y,b,C).then(async e=>{let t=Object.keys(e.fieldsFound).length,n=e.fieldsRemaining.length;if(await N(`[COMPLETE] Analysis finished! Found ${t} fields, ${n} remaining. Status: ${e.status}`),t>0){await N(`[COMPLETE] Fields found:`);for(let[t,n]of Object.entries(e.fieldsFound))await N(`  ${t} = "${n.value}" (${n.confidence} confidence)`)}e.status===`paused`&&Object.keys(e.fieldsFound).length===0&&(await N(`[WARN] Crawl paused with no fields found. Common causes:`),await N(`  - API key invalid or expired`),await N(`  - API rate limit hit`),await N(`  - Content script not injected (try refreshing the Salesforce page)`))}).catch(async e=>{await N(`[FATAL ERROR] Crawl failed: ${e.message}`),await N(`[FATAL ERROR] Stack: ${e.stack?.substring(0,300)||`no stack`}`)}),{status:`started`}}case`RESUME_CRAWL`:return{status:`resumed`};case`PAUSE_CRAWL`:return j&&j.pause(),await N(`[Engine] Crawl paused by user`),{status:`paused`};case`CANCEL_CRAWL`:return j&&j.cancel(),j=null,await N(`[Engine] Crawl cancelled by user`),{status:`cancelled`};case`SCRAPE_PAGE`:return P({type:`SCRAPE_PAGE`,payload:e.payload});case`NAVIGATE`:return P({type:`NAVIGATE`,payload:e.payload});case`CRAWL_UPDATE`:return await F(e),{status:`ok`};case`ASK_USER`:return await F(e),{status:`ok`};case`USER_ANSWER`:return{status:`ok`,answer:e.payload};case`GENERATE_DOC`:return{status:`generating`,templateSource:(await chrome.storage.local.get([`template_file`])).template_file?`custom`:`bundled`};case`GET_TEMPLATE`:{let e=await chrome.storage.local.get([`template_file`]);return e.template_file?{source:`custom`,data:e.template_file}:{source:`bundled`,url:chrome.runtime.getURL(`templates/WFM Design Document Template (Cloud) v1 2025 - JS.docx`)}}case`RECRAWL_SECTION`:return P({type:`SCRAPE_PAGE`,payload:e.payload});case`GET_SETTINGS`:return(await chrome.storage.local.get([`crawl_config`])).crawl_config||R();case`SAVE_SETTINGS`:return await chrome.storage.local.set({crawl_config:e.payload}),{status:`saved`};default:return{error:`Unknown message type: ${e.type}`}}}async function N(e){let t=`[${new Date().toLocaleTimeString()}] ${e}`;console.log(t);try{await chrome.runtime.sendMessage({type:`CRAWL_UPDATE`,payload:{event:t}})}catch{}}async function P(e){let[t]=await chrome.tabs.query({active:!0,currentWindow:!0});if(!t?.id)throw await N(`[ERROR] No active tab found — cannot communicate with content script`),Error(`No active tab found`);try{return await chrome.tabs.sendMessage(t.id,e)}catch(e){throw await N(`[ERROR] Content script communication failed: ${e.message}`),e}}async function F(e){try{await chrome.runtime.sendMessage(e)}catch{}}async function I(){return(await chrome.storage.local.get([`crawl_config`])).crawl_config||R()}async function L(){return[`[Licensed Agents]`,`[Purchased Date]`,`[Target Go Live Date]`,`[Enhanced Strategic Planner]`,`[AI Forecasting]`,`[GDPR Compliance]`,`[Disaster Recovery]`,`[Existing WFM Version]`,`[Current Licensed Agents]`,`[ACD Information (Vendor)]`,`[ACD Model/Version]`,`[ACD Interval]`,`[Employee Engagement Manager]`,`[Environment]`,`[Tenant No.]`,`[ACS Required]`,`[3rd Party Vendor Requirement]`,`[Smart Sync]`,`[Intended Use]`]}function R(){return{maxPages:20,tokenBudget:1e5,navigationTimeout:15e3,providers:[{type:`groq`,apiKey:``,baseUrl:`https://api.groq.com`,model:`llama-3.3-70b-versatile`}],teamRoster:[{name:`Jay Sanchez-Orsini`,email:`jay.sanchez-orsini@nice.com`}],productDomains:[`WFM`,`EEM`,`Performance Management`]}}