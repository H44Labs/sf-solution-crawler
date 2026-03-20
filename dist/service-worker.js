var e=class extends Error{constructor(){super(`All AI providers exhausted after retries`),this.name=`AllProvidersExhaustedError`}},t=class extends Error{constructor(e){super(`Auth error: ${e}`),this.status=e,this.name=`AuthError`}},n=3,r=new Set([429,500,503]),i=new Set([401,403]),a=[1e3,2e3,4e3],o=e=>new Promise(t=>setTimeout(t,e));function s(e){return{text:e.content?.[0]?.text??``,tokensUsed:(e.usage?.input_tokens??0)+(e.usage?.output_tokens??0)}}function c(e){return{text:e.choices?.[0]?.message?.content??``,tokensUsed:e.usage?.total_tokens??0}}function l(e,t,n){return{url:`${e.baseUrl}/v1/messages`,headers:{"x-api-key":e.apiKey,"anthropic-version":`2023-06-01`,"content-type":`application/json`},body:{model:e.model,max_tokens:4096,system:t,messages:[{role:`user`,content:n}]}}}function u(e,t,n){return{url:`${e.baseUrl}/v1/chat/completions`,headers:{Authorization:`Bearer ${e.apiKey}`,"content-type":`application/json`},body:{model:e.model,messages:[{role:`system`,content:t},{role:`user`,content:n}]}}}function d(e,t,n){return{url:`${e.baseUrl}/openai/v1/chat/completions`,headers:{Authorization:`Bearer ${e.apiKey}`,"content-type":`application/json`},body:{model:e.model,messages:[{role:`system`,content:t},{role:`user`,content:n}]}}}function f(e,t,n){switch(e.type){case`claude`:return l(e,t,n);case`openai`:return u(e,t,n);case`groq`:return d(e,t,n)}}function p(e,t){switch(e.type){case`claude`:return s(t);case`openai`:case`groq`:return c(t)}}var m=class{constructor(e,t=o){this.providers=e,this.delay=t}async sendMessage(r,i){for(let e of this.providers)for(let o=0;o<n;o++)try{return await this.callProvider(e,r,i)}catch(e){if(e instanceof t)throw e;await this.delay(a[o])}throw new e}async callProvider(e,n,a){let{url:o,headers:s,body:c}=f(e,n,a),l=await fetch(o,{method:`POST`,headers:s,body:JSON.stringify(c)});if(i.has(l.status))throw new t(l.status);if(!l.ok||r.has(l.status)){let e=``;try{e=await l.text()}catch{}throw Error(`HTTP ${l.status}: ${e.substring(0,500)}`)}return p(e,await l.json())}};function h(e){return`You are an expert Solutions Engineer analyzing Salesforce pages to gather data for a NICE WFM Solution Design Document.

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
- Related lists may contain valuable linked records`}function g(){return`You are a quality reviewer for data extracted from Salesforce pages. Your job is to validate extractions and catch hallucinations.

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
- Don't accept vague or partial matches as high confidence`}function _(){return`You are the final decision maker for a Salesforce data extraction session. You resolve conflicts, determine document configuration, and decide when the crawl is complete.

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
}`}var v={action:`done`,target:``,reason:`Failed to parse AI response`,fieldsSought:[]},y=class{constructor(e,t){this.aiClient=e,this.fieldRegistry=t}async analyze(e,t){let n=h(this.fieldRegistry),r=JSON.stringify({pageData:e,fieldsRemaining:t.fieldsRemaining,pagesVisited:t.pagesVisited.map(e=>({url:e.url,title:e.title}))}),i=await this.aiClient.sendMessage(n,r);return this.parseResponse(i.text,i.tokensUsed)}parseResponse(e,t){try{let n=e.trim().replace(/^```(?:json)?\s*/i,``).replace(/\s*```\s*$/,``).trim(),r=JSON.parse(n);if(!Array.isArray(r.extractedFields))throw Error(`extractedFields is not an array`);if(typeof r.nextNavigation!=`object`||r.nextNavigation===null)throw Error(`nextNavigation is missing or not an object`);let i=r.extractedFields.map(e=>({templateField:String(e.templateField??``),value:String(e.value??``),rawEvidence:String(e.rawEvidence??``),confidence:e.confidence??`low`})),a=r.nextNavigation;return{extractedFields:i,nextNavigation:{action:a.action??`done`,target:String(a.target??``),reason:String(a.reason??``),fieldsSought:Array.isArray(a.fieldsSought)?a.fieldsSought:[]},tokensUsed:t}}catch{return{extractedFields:[],nextNavigation:v,tokensUsed:t}}}},b=class{constructor(e){this.aiClient=e}async validate(e,t){let n=g(),r=JSON.stringify({extractions:e,rawPageContent:{fields:t.fields,relatedLists:t.relatedLists,notes:t.notes}}),i=await this.aiClient.sendMessage(n,r);return this.parseResponse(i.text,i.tokensUsed,e)}parseResponse(e,t,n){let r=e.replace(/^```(?:json)?\s*/i,``).replace(/\s*```\s*$/,``).trim().match(/\{[\s\S]*\}/);if(r)try{let e=JSON.parse(r[0]);if(e&&typeof e==`object`&&Array.isArray(e.reviews))return{reviews:e.reviews.map(e=>({templateField:e.templateField,originalValue:e.originalValue,verdict:e.verdict,confidence:e.confidence,reasoning:e.reasoning,suggestedValue:e.suggestedValue??null})),tokensUsed:t}}catch{}return{reviews:n.map(e=>({templateField:e.templateField,originalValue:e.value,verdict:`flagged`,confidence:`medium`,reasoning:`Could not parse reviewer response; flagged for manual review.`,suggestedValue:null})),tokensUsed:t}}},x={fieldDecisions:[],questionsForUser:[],deploymentType:`unknown`,productsDetected:{wfm:!1,eem:!1,performanceManagement:!1},completionAssessment:{isComplete:!1,percentFilled:0,recommendation:`continue`,reason:`Failed to parse arbiter response`}},S=class{constructor(e){this.aiClient=e}async decide(e,t,n){let r=_(),i=JSON.stringify({crawlerExtractions:e,reviewResults:t,sessionState:{fieldsFound:Object.keys(n.fieldsFound),fieldsRemaining:n.fieldsRemaining,pagesVisited:n.pagesVisited.length,tokenUsage:n.tokenUsage,deploymentType:n.deploymentType}}),a=await this.aiClient.sendMessage(r,i);return this.parseResponse(a.text,a.tokensUsed)}async holisticReview(e){let t=_(),n=JSON.stringify({type:`final_review`,allFields:e.fieldsFound,deploymentType:e.deploymentType,productsDetected:e.productsDetected,totalFields:Object.keys(e.fieldsFound).length+e.fieldsRemaining.length,filledFields:Object.keys(e.fieldsFound).length}),r=await this.aiClient.sendMessage(t,n);return this.parseFinalReview(r.text,r.tokensUsed)}parseResponse(e,t){try{let n=e.trim().replace(/^```(?:json)?\s*/i,``).replace(/\s*```\s*$/,``).trim().match(/\{[\s\S]*\}/);if(!n)return{...x,tokensUsed:t};let r=JSON.parse(n[0]),i=Array.isArray(r.fieldDecisions)?r.fieldDecisions.map(e=>({templateField:String(e.templateField??``),decision:e.decision??`askUser`,reason:String(e.reason??``)})):[],a=Array.isArray(r.questionsForUser)?r.questionsForUser.map(e=>({field:String(e.field??``),question:String(e.question??``),context:String(e.context??``)})):[],o=r.deploymentType,s=o===`new_business`||o===`migration`||o===`unknown`?o:`unknown`,c=typeof r.productsDetected==`object`&&r.productsDetected!==null?r.productsDetected:{},l={wfm:!!(c.wfm??!1),eem:!!(c.eem??!1),performanceManagement:!!(c.performanceManagement??!1)},u=typeof r.completionAssessment==`object`&&r.completionAssessment!==null?r.completionAssessment:{},d=u.recommendation,f=d===`complete`||d===`askUser`||d===`continue`?d:`continue`;return{fieldDecisions:i,questionsForUser:a,deploymentType:s,productsDetected:l,completionAssessment:{isComplete:!!(u.isComplete??!1),percentFilled:typeof u.percentFilled==`number`?u.percentFilled:0,recommendation:f,reason:String(u.reason??``)},tokensUsed:t}}catch{return{...x,tokensUsed:t}}}parseFinalReview(e,t){try{let n=e.trim().replace(/^```(?:json)?\s*/i,``).replace(/\s*```\s*$/,``).trim().match(/\{[\s\S]*\}/);if(!n)return{approved:!1,issues:[`Failed to parse arbiter response`],tokensUsed:t};let r=JSON.parse(n[0]);return{approved:!!(r.approved??!1),issues:Array.isArray(r.issues)?r.issues.map(e=>String(e)):[],tokensUsed:t}}catch{return{approved:!1,issues:[`Failed to parse arbiter response`],tokensUsed:t}}}},C=class{constructor(e,t,n){this.crawler=e,this.reviewer=t,this.arbiter=n}async processPage(e,t){let n=await this.crawler.analyze(e,t),r=n.extractedFields.map(e=>({templateField:e.templateField,value:e.value,rawEvidence:e.rawEvidence,confidence:e.confidence})),i=await this.reviewer.validate(r,e),a=await this.arbiter.decide(n.extractedFields,i.reviews,t),o={};for(let t of a.fieldDecisions)if(t.decision===`accepted`){let r=n.extractedFields.find(e=>e.templateField===t.templateField),a=i.reviews.find(e=>e.templateField===t.templateField);r&&(o[t.templateField]={value:a?.suggestedValue||r.value,confidence:a?.confidence||r.confidence,source:e.pageContext.title,rawEvidence:r.rawEvidence})}let s=n.tokensUsed+i.tokensUsed+a.tokensUsed;return{acceptedFields:o,navigation:n.nextNavigation,questionsForUser:a.questionsForUser,deploymentType:a.deploymentType,productsDetected:a.productsDetected,isComplete:a.completionAssessment.isComplete,totalTokensUsed:s}}async finalReview(e){return this.arbiter.holisticReview(e)}},w=`crawl_session_`,T=`crawl_session_index`,E=1440*60*1e3,D=class{static async createSession(e,t,n){return{crawlId:crypto.randomUUID(),seName:e,opportunityName:t,opportunityUrl:n,deploymentType:`unknown`,pagesVisited:[],fieldsFound:{},fieldsRemaining:[],pendingQuestions:[],productsDetected:{wfm:!1,eem:!1,performanceManagement:!1},tokenUsage:{total:0,budget:1e5},status:`crawling`,lastUpdated:new Date().toISOString()}}static async save(e){let t=w+e.crawlId;await chrome.storage.local.set({[t]:e});let n=await this.getIndex();n.includes(e.crawlId)||(n.push(e.crawlId),await chrome.storage.local.set({[T]:n}))}static async load(e){let t=w+e;return(await chrome.storage.local.get([t]))[t]||null}static async delete(e){let t=w+e;await chrome.storage.local.remove([t]);let n=(await this.getIndex()).filter(t=>t!==e);await chrome.storage.local.set({[T]:n})}static async getInterruptedSession(){let e=await this.getIndex();for(let t of e){let e=await this.load(t);if(e&&e.status!==`complete`)return e}return null}static async cleanupStale(){let e=await this.getIndex(),t=Date.now();for(let n of e){let e=await this.load(n);e&&t-new Date(e.lastUpdated).getTime()>E&&await this.delete(n)}}static async getIndex(){return(await chrome.storage.local.get([T]))[T]||[]}},O=class{constructor(e,t){this.isPaused=!1,this.isCancelled=!1,this.eventHandler=null,this.council=e,this.config=t}onEvent(e){this.eventHandler=e}emit(e){this.eventHandler?.(e)}async start(e,t,n,r,i,a){let o=await D.createSession(e,t,n);return await D.save(o),this.emit({type:`log`,message:`Starting analysis of ${t}...`}),this.crawlLoop(o,r,i,a)}async resume(e,t,n,r){let i=await D.load(e);return i?(i.status=`crawling`,this.emit({type:`log`,message:`Resuming analysis of ${i.opportunityName}...`}),this.crawlLoop(i,t,n,r)):null}pause(){this.isPaused=!0}cancel(){this.isCancelled=!0}async crawlLoop(t,n,r,i){for(;t.status===`crawling`&&t.pagesVisited.length<this.config.maxPages;){if(this.isPaused)return t.status=`paused`,await D.save(t),this.emit({type:`paused`,message:`Crawl paused`}),t;if(this.isCancelled)return await D.delete(t.crawlId),t;if(i())return t.status=`paused`,await D.save(t),this.emit({type:`error`,message:`Salesforce session expired. Please re-authenticate and resume.`}),t;let a;try{a=await n(),t.pagesVisited.push({url:a.pageContext.url,title:a.pageContext.title,timestamp:new Date().toISOString()}),this.emit({type:`log`,message:`Reading ${a.pageContext.title}...`})}catch(e){this.emit({type:`error`,message:`Failed to scrape page: ${e}`});break}let o;try{o=await this.council.processPage(a,t)}catch(n){if(n instanceof e)return t.status=`paused`,await D.save(t),this.emit({type:`error`,message:`All AI providers exhausted. Please check API keys and try again.`}),t;throw n}for(let[e,n]of Object.entries(o.acceptedFields))t.fieldsFound[e]={value:n.value,confidence:n.confidence,source:n.source,rawEvidence:n.rawEvidence,reviewerVerdict:`accepted`,arbiterDecision:`accepted`},t.fieldsRemaining=t.fieldsRemaining.filter(t=>t!==e);t.deploymentType=o.deploymentType,t.productsDetected=o.productsDetected,t.tokenUsage.total+=o.totalTokensUsed;let s=Object.keys(t.fieldsFound).length+t.fieldsRemaining.length;if(this.emit({type:`progress`,message:`Found ${Object.keys(t.fieldsFound).length}/${s} fields`,data:{found:Object.keys(t.fieldsFound).length,total:s}}),o.questionsForUser.length>0)return t.pendingQuestions=o.questionsForUser,t.status=`askingUser`,await D.save(t),this.emit({type:`question`,message:o.questionsForUser[0].question,data:o.questionsForUser[0]}),t;if(o.isComplete)return t.status=`complete`,await D.save(t),this.emit({type:`complete`,message:`Analysis complete!`}),t;if(t.tokenUsage.total>=t.tokenUsage.budget)return t.status=`complete`,await D.save(t),this.emit({type:`complete`,message:`Token budget reached. Completing with available data.`}),t;(o.navigation.action===`navigate`||o.navigation.action===`click`)&&(this.emit({type:`log`,message:`Navigating to ${o.navigation.target}...`}),await r(o.navigation)||this.emit({type:`log`,message:`Navigation failed, continuing with available data`})),await D.save(t)}return t.status===`crawling`&&(t.status=`complete`,await D.save(t),this.emit({type:`complete`,message:`Maximum pages reached. Completing with available data.`})),t}};chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:!0});var k=null;chrome.runtime.onMessage.addListener((e,t,n)=>(A(e,t).then(n).catch(e=>{console.error(`[SW] Message handler error:`,e),n({error:e.message})}),!0));async function A(e,t){switch(e.type){case`PING`:return{status:`ok`};case`DETECT_MODE`:return M(e);case`START_CRAWL`:{let{seName:t}=e.payload;await j(`[1/7] START_CRAWL received for SE: ${t}`);let n=await P();await j(`[2/7] Config loaded: maxPages=${n.maxPages}, tokenBudget=${n.tokenBudget}`);let r=await chrome.storage.local.get([`personal_api_key`]),i=await chrome.storage.local.get([`fallback_api_key`]),a=r.personal_api_key,o=i.fallback_api_key,s=a||o;if(!s)return await j(`[ERROR] No API key configured. Open Settings to add one.`),{status:`error`,message:`No API key configured`};await j(`[3/7] API key found (${a?`personal`:`fallback`}, ${s.substring(0,8)}...)`);let c=n.providers?.[0]?.type||`groq`,l=c===`claude`?`https://api.anthropic.com`:c===`groq`?`https://api.groq.com`:`https://api.openai.com`,u=c===`claude`?`claude-sonnet-4-20250514`:c===`groq`?`llama-3.3-70b-versatile`:`gpt-4o`,d=[{type:c,apiKey:s,baseUrl:l,model:u}];await j(`[4/7] Provider: ${c} | Model: ${u} | URL: ${l}`);let f=new m(d),p=await F(),h=new C(new y(f,p),new b(f),new S(f));await j(`[5/7] AI Council created (${p.length} template fields registered)`);let g=new O(h,n);k=g,g.onEvent(async e=>{await j(`[Engine/${e.type}] ${e.message}`)});let _=`Unknown Opportunity`,v=``;try{let[e]=await chrome.tabs.query({active:!0,currentWindow:!0});e?.url&&(v=e.url,_=e.title||`Salesforce Opportunity`),await j(`[6/7] Tab detected: "${_}" at ${v.substring(0,60)}...`)}catch(e){await j(`[WARN] Could not read tab info: ${e.message}`)}return await j(`[7/7] Starting crawl loop...`),g.start(t,_,v,async()=>{await j(`[Scraper] Sending SCRAPE_PAGE to content script...`);try{let e=await M({type:`SCRAPE_PAGE`});if(!e||e.error)throw await j(`[Scraper ERROR] ${e?.error||`No response from content script`}`),Error(e?.error||`Scrape failed - no response`);return await j(`[Scraper] Page scraped: ${e.fields?.length||0} fields, ${e.relatedLists?.length||0} related lists, ${e.quickLinks?.length||0} quick links`),e}catch(e){throw await j(`[Scraper ERROR] ${e.message}`),e}},async e=>{await j(`[Navigator] Navigating to: ${e.target} (reason: ${e.reason})`);try{let t=(await M({type:`NAVIGATE`,payload:e}))?.success??!1;return await j(`[Navigator] Navigation ${t?`succeeded`:`FAILED`}`),t}catch(e){return await j(`[Navigator ERROR] ${e.message}`),!1}},()=>!1).then(async e=>{let t=Object.keys(e.fieldsFound).length,n=e.fieldsRemaining.length;if(await j(`[COMPLETE] Analysis finished! Found ${t} fields, ${n} remaining. Status: ${e.status}`),t>0){await j(`[COMPLETE] Fields found:`);for(let[t,n]of Object.entries(e.fieldsFound))await j(`  ${t} = "${n.value}" (${n.confidence} confidence)`)}e.status===`paused`&&Object.keys(e.fieldsFound).length===0&&(await j(`[WARN] Crawl paused with no fields found. Common causes:`),await j(`  - API key invalid or expired`),await j(`  - API rate limit hit`),await j(`  - Content script not injected (try refreshing the Salesforce page)`))}).catch(async e=>{await j(`[FATAL ERROR] Crawl failed: ${e.message}`),await j(`[FATAL ERROR] Stack: ${e.stack?.substring(0,300)||`no stack`}`)}),{status:`started`}}case`RESUME_CRAWL`:return{status:`resumed`};case`PAUSE_CRAWL`:return k&&k.pause(),await j(`[Engine] Crawl paused by user`),{status:`paused`};case`CANCEL_CRAWL`:return k&&k.cancel(),k=null,await j(`[Engine] Crawl cancelled by user`),{status:`cancelled`};case`SCRAPE_PAGE`:return M({type:`SCRAPE_PAGE`,payload:e.payload});case`NAVIGATE`:return M({type:`NAVIGATE`,payload:e.payload});case`CRAWL_UPDATE`:return await N(e),{status:`ok`};case`ASK_USER`:return await N(e),{status:`ok`};case`USER_ANSWER`:return{status:`ok`,answer:e.payload};case`GENERATE_DOC`:return{status:`generating`,templateSource:(await chrome.storage.local.get([`template_file`])).template_file?`custom`:`bundled`};case`GET_TEMPLATE`:{let e=await chrome.storage.local.get([`template_file`]);return e.template_file?{source:`custom`,data:e.template_file}:{source:`bundled`,url:chrome.runtime.getURL(`templates/WFM Design Document Template (Cloud) v1 2025 - JS.docx`)}}case`RECRAWL_SECTION`:return M({type:`SCRAPE_PAGE`,payload:e.payload});case`GET_SETTINGS`:return(await chrome.storage.local.get([`crawl_config`])).crawl_config||I();case`SAVE_SETTINGS`:return await chrome.storage.local.set({crawl_config:e.payload}),{status:`saved`};default:return{error:`Unknown message type: ${e.type}`}}}async function j(e){let t=`[${new Date().toLocaleTimeString()}] ${e}`;console.log(t);try{await chrome.runtime.sendMessage({type:`CRAWL_UPDATE`,payload:{event:t}})}catch{}}async function M(e){let[t]=await chrome.tabs.query({active:!0,currentWindow:!0});if(!t?.id)throw await j(`[ERROR] No active tab found — cannot communicate with content script`),Error(`No active tab found`);try{return await chrome.tabs.sendMessage(t.id,e)}catch(e){throw await j(`[ERROR] Content script communication failed: ${e.message}`),e}}async function N(e){try{await chrome.runtime.sendMessage(e)}catch{}}async function P(){return(await chrome.storage.local.get([`crawl_config`])).crawl_config||I()}async function F(){return[`[Licensed Agents]`,`[Purchased Date]`,`[Target Go Live Date]`,`[Enhanced Strategic Planner]`,`[AI Forecasting]`,`[GDPR Compliance]`,`[Disaster Recovery]`,`[Existing WFM Version]`,`[Current Licensed Agents]`,`[ACD Information (Vendor)]`,`[ACD Model/Version]`,`[ACD Interval]`,`[Employee Engagement Manager]`,`[Environment]`,`[Tenant No.]`,`[ACS Required]`,`[3rd Party Vendor Requirement]`,`[Smart Sync]`,`[Intended Use]`]}function I(){return{maxPages:20,tokenBudget:1e5,navigationTimeout:15e3,providers:[{type:`groq`,apiKey:``,baseUrl:`https://api.groq.com`,model:`llama-3.3-70b-versatile`}],teamRoster:[{name:`Jay Sanchez-Orsini`,email:`jay.sanchez-orsini@nice.com`}],productDomains:[`WFM`,`EEM`,`Performance Management`]}}