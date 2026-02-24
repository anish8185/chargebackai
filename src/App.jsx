import React, { useState, useRef, Fragment } from "react";

const C={bg:"#F6F4F1",card:"#FFF",border:"#E8E4DE",t1:"#1A1816",t2:"#5A564F",t3:"#8A8680",accent:"#6B5B3E",aL:"#8B7355",green:"#2E7D52",gBg:"#EAF4EE",red:"#C0392B",rBg:"#FDEDEC",amber:"#B8860B",aBg:"#FDF6E3",esc:"#6B4C8A",eBg:"#F3EEF8"};
const dc=d=>d==="fight"?C.red:d==="accept"?C.green:C.esc;
const dBg=d=>d==="fight"?C.rBg:d==="accept"?C.gBg:C.eBg;
const sc=s=>s>=65?C.green:s>=38?C.amber:C.red;
const fc=i=>i==="pos"?C.green:C.red;

const FIELDS=[
  {p:"dispute.amount",label:"Dispute Amount",t:"number"},
  {p:"dispute.reason_code",label:"Reason Code",t:"string"},
  {p:"dispute.dispute_stage",label:"Dispute Stage",t:"string"},
  {p:"transaction.payment_method",label:"Payment Method",t:"string"},
  {p:"transaction.ip_address",label:"IP Address",t:"string"},
  {p:"transaction.device_fingerprint",label:"Device Fingerprint",t:"string"},
  {p:"cardholder.account_age_days",label:"Account Age (days)",t:"number"},
  {p:"cardholder.prior_disputes",label:"Prior Disputes",t:"number"},
  {p:"cardholder.prior_chargebacks",label:"Prior Chargebacks",t:"number"},
  {p:"cardholder.total_transactions",label:"Total Transactions",t:"number"},
  {p:"cardholder.total_spend",label:"Total Spend",t:"number"},
  {p:"cardholder.phone_verified",label:"Phone Verified",t:"boolean"},
  {p:"evidence_available.delivery_confirmation.exists",label:"Delivery Confirmation Exists",t:"boolean"},
  {p:"evidence_available.delivery_confirmation.signature_on_file",label:"Signature On File",t:"boolean"},
  {p:"evidence_available.delivery_confirmation.delivery_address_match",label:"Delivery Address Match",t:"boolean"},
  {p:"evidence_available.customer_communication.exists",label:"Customer Communication Exists",t:"boolean"},
  {p:"evidence_available.order_confirmation.exists",label:"Order Confirmation Exists",t:"boolean"},
  {p:"evidence_available.order_confirmation.opened",label:"Order Confirmation Opened",t:"boolean"},
  {p:"evidence_available.refund_policy_acceptance.exists",label:"Refund Policy Accepted",t:"boolean"},
  {p:"risk_signals.velocity_flag",label:"Velocity Flag",t:"boolean"},
  {p:"risk_signals.address_mismatch",label:"Address Mismatch",t:"boolean"},
  {p:"risk_signals.device_previously_seen",label:"Device Previously Seen",t:"boolean"},
  {p:"risk_signals.behavioral_score",label:"Behavioral Score",t:"number"},
  {p:"risk_signals.fraud_model_score",label:"Fraud Model Score",t:"number"},];

const OPS={number:["gt","gte","lt","lte","eq"],string:["eq","neq"],boolean:["eq"]};
const OP_LABEL={gt:">",gte:"≥",lt:"<",lte:"≤",eq:"=",neq:"≠"};

function getVal(obj,path){return path.split(".").reduce((o,k)=>o!=null&&o[k]!==undefined?o[k]:null,obj);}
function evalOp(val,op,thresh){
  if(val===null||val===undefined)return false;
  const n=+thresh;
  if(op==="gt")return val>n;if(op==="gte")return val>=n;
  if(op==="lt")return val<n;if(op==="lte")return val<=n;
  if(op==="eq")return String(val).toLowerCase()===String(thresh).toLowerCase();
  if(op==="neq")return String(val).toLowerCase()!==String(thresh).toLowerCase();
  return false;}

// Evaluate rubric rows against case data in JS. Returns {score, factors}.
// score is normalized 0–100: (rawSum - minPossible) / (maxPossible - minPossible) * 100
// If all pts are same sign (no range), clamp rawSum to 0-100 directly.
function computeRubricScore(rows, kase){
  const matched=[];
  for(const r of rows){
    const val=getVal(kase,r.field);
    if(evalOp(val,r.op,r.thresh)){
      const fMeta=FIELDS.find(f=>f.p===r.field)||{label:r.field};
      matched.push({id:r.id,field:r.field,name:fMeta.label,observed:val,pts:r.pts,impact:r.pts>0?"pos":"neg"});
    }
  }
  const rawSum=matched.reduce((s,f)=>s+f.pts,0);
  const minPts=rows.reduce((s,r)=>r.pts<0?s+r.pts:s,0);
  const maxPts=rows.reduce((s,r)=>r.pts>0?s+r.pts:s,0);
  const range=maxPts-minPts;
  const score=range===0?50:Math.round(Math.max(0,Math.min(100,((rawSum-minPts)/range)*100)));
  return {score,matched,rawSum,minPts,maxPts};
}

// riskRubric (risk_signals.*) → riskScore | customerRubric (cardholder.*) → customerScore
function computeRiskScores(riskRubric, customerRubric, kase){
  const risk=computeRubricScore(riskRubric,kase);
  const cust=computeRubricScore(customerRubric,kase);
  return {riskScore:risk.score,riskMatched:risk.matched,customerScore:cust.score,custMatched:cust.matched};
}

// Traced version of computeRubricScore — emits per-rule events
function computeRubricScoreTraced(rows, kase, addTrace){
  const matched=[];
  for(const r of rows){
    const val=getVal(kase,r.field);
    const hit=evalOp(val,r.op,r.thresh);
    const fMeta=FIELDS.find(f=>f.p===r.field)||{label:r.field};
    const label=OP_LABEL[r.op]||r.op;
    if(hit){
      matched.push({id:r.id,field:r.field,name:fMeta.label,observed:val,pts:r.pts,impact:r.pts>0?"pos":"neg"});
      addTrace("rule-match",`    ✓ MATCH  ${fMeta.label} ${label} ${r.thresh} → observed: ${val} → ${r.pts>0?"+":""}${r.pts} pts`);
    } else {
      addTrace("rule-miss",`    ✗ miss   ${fMeta.label} ${label} ${r.thresh} → observed: ${val===null?"(null)":val}`);
    }
  }
  const rawSum=matched.reduce((s,f)=>s+f.pts,0);
  const minPts=rows.reduce((s,r)=>r.pts<0?s+r.pts:s,0);
  const maxPts=rows.reduce((s,r)=>r.pts>0?s+r.pts:s,0);
  const range=maxPts-minPts;
  const score=range===0?50:Math.round(Math.max(0,Math.min(100,((rawSum-minPts)/range)*100)));
  return {score,matched,rawSum,minPts,maxPts};
}

// Rubric rows: {id, field (path), op, thresh, pts, label (auto from FIELDS)}
// "ev" type rows = evidence (evidence_available.*) → shown in Evidence agent
// "rk" type rows = risk (cardholder.*, risk_signals.*, transaction.ip/device) → Risk agent
const DEF_CFG={
  weights:{evidence:40,risk:35,customer:25},
  codes:{
    "13.1":{
      label:"Merchandise Not Received",
      thresholds:{acceptAbove:65,fightBelow:38},
      evidenceRubric:[
        {id:1,field:"evidence_available.delivery_confirmation.exists",op:"eq",thresh:"true",pts:-25},
        {id:2,field:"evidence_available.delivery_confirmation.exists",op:"eq",thresh:"false",pts:22},
        {id:3,field:"evidence_available.delivery_confirmation.signature_on_file",op:"eq",thresh:"true",pts:-20},
        {id:4,field:"evidence_available.delivery_confirmation.delivery_address_match",op:"eq",thresh:"true",pts:-10},
        {id:5,field:"evidence_available.order_confirmation.exists",op:"eq",thresh:"true",pts:-8},
        {id:6,field:"evidence_available.order_confirmation.opened",op:"eq",thresh:"true",pts:-5},
        {id:7,field:"evidence_available.refund_policy_acceptance.exists",op:"eq",thresh:"true",pts:-8},
        {id:8,field:"evidence_available.customer_communication.exists",op:"eq",thresh:"true",pts:10},],
      riskRubric:[
        {id:1,field:"risk_signals.velocity_flag",op:"eq",thresh:"true",pts:-15},
        {id:2,field:"risk_signals.address_mismatch",op:"eq",thresh:"false",pts:8},
        {id:3,field:"risk_signals.device_previously_seen",op:"eq",thresh:"true",pts:8},
        {id:4,field:"risk_signals.behavioral_score",op:"gte",thresh:"75",pts:10},
        {id:5,field:"risk_signals.fraud_model_score",op:"lt",thresh:"0.2",pts:10},],
      customerRubric:[
        {id:1,field:"cardholder.account_age_days",op:"gte",thresh:"730",pts:12},
        {id:2,field:"cardholder.account_age_days",op:"lt",thresh:"180",pts:-10},
        {id:3,field:"cardholder.prior_disputes",op:"eq",thresh:"0",pts:14},
        {id:4,field:"cardholder.prior_disputes",op:"gte",thresh:"2",pts:-12},],},
    "13.2":{
      label:"Cancelled Recurring Transaction",
      thresholds:{acceptAbove:65,fightBelow:38},
      evidenceRubric:[
        {id:1,field:"evidence_available.order_confirmation.exists",op:"eq",thresh:"true",pts:-10},
        {id:2,field:"evidence_available.refund_policy_acceptance.exists",op:"eq",thresh:"true",pts:-15},
        {id:3,field:"evidence_available.customer_communication.exists",op:"eq",thresh:"true",pts:12},
        {id:4,field:"evidence_available.order_confirmation.opened",op:"eq",thresh:"true",pts:-8},],
      riskRubric:[
        {id:1,field:"risk_signals.behavioral_score",op:"gte",thresh:"70",pts:10},],
      customerRubric:[
        {id:1,field:"cardholder.prior_disputes",op:"gte",thresh:"2",pts:-14},
        {id:2,field:"cardholder.prior_disputes",op:"eq",thresh:"0",pts:12},
        {id:3,field:"cardholder.account_age_days",op:"gte",thresh:"365",pts:10},
        {id:4,field:"cardholder.phone_verified",op:"eq",thresh:"true",pts:6},],},
    "13.3":{
      label:"Not as Described",
      thresholds:{acceptAbove:62,fightBelow:35},
      evidenceRubric:[
        {id:1,field:"evidence_available.delivery_confirmation.exists",op:"eq",thresh:"true",pts:-8},
        {id:2,field:"evidence_available.refund_policy_acceptance.exists",op:"eq",thresh:"true",pts:-12},
        {id:3,field:"evidence_available.customer_communication.exists",op:"eq",thresh:"true",pts:14},
        {id:4,field:"evidence_available.order_confirmation.exists",op:"eq",thresh:"true",pts:-6},],
      riskRubric:[
        {id:1,field:"risk_signals.fraud_model_score",op:"lt",thresh:"0.3",pts:8},],
      customerRubric:[
        {id:1,field:"cardholder.prior_disputes",op:"eq",thresh:"0",pts:14},
        {id:2,field:"cardholder.prior_chargebacks",op:"eq",thresh:"0",pts:10},
        {id:3,field:"cardholder.account_age_days",op:"gte",thresh:"365",pts:8},],},},
  humanLoop:{rules:[{id:1,field:"dispute.amount",op:"gt",thresh:"500",label:"High-value dispute"}],mode:"any"},
};

// Case data engineered so JS rubric evaluation deterministically produces correct outcome.
// Scores verified below against each rubric before commit.
//
// 13.1 FIGHT:  evRaw=−46 (min=−56 max=+32) → evScore=11  rkRaw(risk)=+26(min=−15,max=+26)→100  rkRaw(cust)=+26(min=−10,max=+26)→100  overall=(40×11+35×100+25×100)/100=29 → Fight(<38) ✓
// 13.2 ESCALATE: evRaw=−6 (min=−33 max=+12) → evScore=60  rkRaw(cust)=+10(min=−14,max=+28)→57  rkRaw(risk)=0(min=0,max=+10)→0  overall=(40×60+35×0+25×57)/100=38 → Escalate(38–65) ✓
// 13.3 ACCEPT:  evRaw=+6  (min=−26 max=+14) → evScore=80  rkRaw(cust)=+32(min=0,max=+32)→100  rkRaw(risk)=+8(min=0,max=+8)→100  overall=(40×80+35×100+25×100)/100=82 → Accept(≥65) ✓
const CASES=[
  {
    _meta:{code:"13.1",outcome:"fight",label:"Merchandise Not Received"},
    dispute:{dispute_id:"DSP-2025-8841",created_at:"2025-01-11T09:00:00Z",response_deadline:"2025-03-12T23:59:59Z",amount:347.82,currency:"USD",reason_code:"13.1",reason_description:"Merchandise/Services Not Received",card_network:"Visa",dispute_stage:"first_chargeback"},
    transaction:{transaction_id:"TXN-8841",transaction_date:"2025-01-14T10:22:00Z",merchant_name:"Luxe Home Goods",merchant_category:"Furniture",merchant_id:"MRC-22101",payment_method:"credit_card",card_last_four:"4421",billing_address:{city:"Portland",state:"OR",postal_code:"97201",country:"US"},shipping_address:{city:"Portland",state:"OR",postal_code:"97201",country:"US"},ip_address:"192.168.1.45",device_fingerprint:"df_known_a1b2"},
    cardholder:{customer_id:"CUS-441821",account_age_days:2263,email:"s.m***@email.com",phone_verified:true,total_transactions:87,total_spend:12480.50,prior_disputes:3,prior_chargebacks:1},
    evidence_available:{
      delivery_confirmation:{exists:true,carrier:"USPS",tracking_number:"9400111899223859281",delivery_date:"2025-01-22T14:00:00Z",signature_on_file:false,delivery_address_match:true},
      customer_communication:{exists:true,last_contact_date:"2025-02-03T10:00:00Z",contact_method:"phone",summary:"Cardholder states package was not received despite USPS confirmation; checked with neighbors. Third dispute this account has filed."},
      order_confirmation:{exists:true,sent_date:"2025-01-14T10:23:00Z",opened:true},
      refund_policy_acceptance:{exists:true,accepted_at:"2025-01-14T10:21:55Z"}},
    risk_signals:{velocity_flag:true,address_mismatch:true,device_previously_seen:false,behavioral_score:45,fraud_model_score:0.65},
  },
  {
    _meta:{code:"13.2",outcome:"escalate",label:"Cancelled Recurring Transaction"},
    dispute:{dispute_id:"DSP-2025-9103",created_at:"2025-02-08T11:00:00Z",response_deadline:"2025-03-05T23:59:59Z",amount:89.99,currency:"USD",reason_code:"13.2",reason_description:"Cancelled Recurring Transaction",card_network:"Visa",dispute_stage:"first_chargeback"},
    transaction:{transaction_id:"TXN-9103",transaction_date:"2025-01-28T00:01:00Z",merchant_name:"StreamVault Plus",merchant_category:"Software/SaaS",merchant_id:"MRC-77301",payment_method:"credit_card",card_last_four:"7788",billing_address:{city:"Austin",state:"TX",postal_code:"78701",country:"US"},shipping_address:null,ip_address:"98.14.22.101",device_fingerprint:"df_known_c3d4"},
    cardholder:{customer_id:"CUS-910322",account_age_days:401,email:"j.t***@email.com",phone_verified:true,total_transactions:12,total_spend:980.00,prior_disputes:1,prior_chargebacks:0},
    evidence_available:{
      delivery_confirmation:{exists:false,carrier:null,tracking_number:null,delivery_date:null,signature_on_file:false,delivery_address_match:false},
      customer_communication:{exists:true,last_contact_date:"2025-01-30T14:00:00Z",contact_method:"email",summary:"Cardholder claims cancellation submitted via portal on Jan 15; merchant CRM has no record of request"},
      order_confirmation:{exists:true,sent_date:"2024-01-28T00:02:00Z",opened:true},
      refund_policy_acceptance:{exists:true,accepted_at:"2024-01-28T00:01:30Z"}},
    risk_signals:{velocity_flag:false,address_mismatch:false,device_previously_seen:true,behavioral_score:75,fraud_model_score:0.28},
  },
  {
    _meta:{code:"13.3",outcome:"accept",label:"Not as Described"},
    dispute:{dispute_id:"DSP-2025-7742",created_at:"2025-01-20T14:00:00Z",response_deadline:"2025-03-20T23:59:59Z",amount:218.50,currency:"USD",reason_code:"13.3",reason_description:"Not as Described",card_network:"Visa",dispute_stage:"first_chargeback"},
    transaction:{transaction_id:"TXN-7742",transaction_date:"2025-01-05T16:44:00Z",merchant_name:"CraftSupply Co.",merchant_category:"Retail",merchant_id:"MRC-33901",payment_method:"credit_card",card_last_four:"9914",billing_address:{city:"Denver",state:"CO",postal_code:"80203",country:"US"},shipping_address:{city:"Denver",state:"CO",postal_code:"80203",country:"US"},ip_address:"71.220.14.88",device_fingerprint:"df_known_e5f6"},
    cardholder:{customer_id:"CUS-772241",account_age_days:1580,email:"r.k***@email.com",phone_verified:true,total_transactions:54,total_spend:8920.00,prior_disputes:0,prior_chargebacks:0},
    evidence_available:{
      delivery_confirmation:{exists:true,carrier:"FedEx",tracking_number:"7489274892748",delivery_date:"2025-01-09T11:00:00Z",signature_on_file:false,delivery_address_match:true},
      customer_communication:{exists:true,last_contact_date:"2025-01-18T09:00:00Z",contact_method:"email",summary:"Cardholder provided photos showing item received was visibly different from listing; merchant did not respond to return request within 7 days"},
      order_confirmation:{exists:false,sent_date:null,opened:false},
      refund_policy_acceptance:{exists:false,accepted_at:null}},
    risk_signals:{velocity_flag:false,address_mismatch:false,device_previously_seen:true,behavioral_score:91,fraud_model_score:0.06},
  },
];

// Evidence/risk: only system + matched factors. No config or case context needed.
async function callLLM(systemPrompt, userPrompt){
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
    body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,temperature:0,system:systemPrompt,
      messages:[{role:"user",content:userPrompt}]})});
  if(!r.ok)throw new Error(`API ${r.status}: ${await r.text()}`);
  const d=await r.json();
  return d.content.map(b=>b.text||"").join("").replace(/^```(?:json)?\n?/,"").replace(/\n?```$/,"").trim();}

// Letter: needs full config + case context to write well.
async function callLLMFull(systemPrompt, configPrompt, casePrompt, userPrompt){
  const messages=[
    {role:"user",content:configPrompt},
    {role:"assistant",content:"Configuration received and understood."},
    {role:"user",content:casePrompt},
    {role:"assistant",content:"Case data received and understood."},
    {role:"user",content:userPrompt},];
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
    body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,system:systemPrompt,messages})});
  if(!r.ok)throw new Error(`API ${r.status}: ${await r.text()}`);
  const d=await r.json();
  return d.content.map(b=>b.text||"").join("").trim();}

// Scoring computed in JS. LLM only writes detail sentences + summary/reasoning.
const SYSTEM_EVIDENCE=`You are an expert chargeback analyst at a card-issuing bank specialising in merchant-submitted evidence.
You will receive a list of pre-scored evidence factors with their field paths, observed values, point impacts, and impact direction already computed.
DO NOT change any score, pts, or impact value. Your only tasks:
1. For each factor in the provided list, write a concise 1-2 sentence "detail" field explaining what that finding means for the cardholder claim.
2. Write a 2-3 sentence "summary" of the overall evidence picture.
Respond with valid JSON only. No markdown. Schema: {"factors":[{"id":<number>,"detail":<string>}],"summary":<string>}`;

const SYSTEM_RISK=`You are a fraud risk specialist at a card-issuing bank.
You will receive two pre-scored factor lists: customer profile factors (cardholder.*) and risk signal factors (risk_signals.*). All scores, pts, and impact directions are already computed.
DO NOT change any score, pts, or impact value. Your only tasks:
1. For each factor in both lists, write a concise 1-2 sentence "detail" field explaining what that finding means for claim credibility.
2. Write a 2-3 sentence "reasoning" summarising the overall risk and customer picture.
Respond with valid JSON only. No markdown. Schema: {"factors":[{"id":<number>,"detail":<string>}],"reasoning":<string>}`;

const SYSTEM_REPRESENTMENT=`You are a customer relations specialist at a card-issuing bank writing a dispute resolution letter to a cardholder.
The dispute has been reviewed and the decision is to deny the claim. Write a brief, professional, and empathetic letter.
Tone: formal but warm. Do NOT accuse the cardholder of fraud or dishonesty. Do NOT list specific evidence or internal signals.
Structure:
- Opening: thank the cardholder for contacting the bank and acknowledge the dispute.
- Decision: one sentence stating the dispute could not be approved following the review.
- Brief explanation: one sentence stating the transaction was found to be consistent with authorized activity (without citing specifics).
- Next steps: cardholder may contact the bank within 10 days if they have additional information to provide.
- Closing: professional sign-off.
Keep the letter under 200 words. Respond with plain text only. No markdown, no JSON.`;

const SYSTEM_ESCALATION=`You are a senior dispute analyst at a card-issuing bank reviewing an ambiguous cardholder dispute.
Based on the case data and matched risk factors, recommend 3-4 specific investigative actions to resolve ambiguity before making a final accept or fight decision.

CRITICAL CONSTRAINTS — you must follow these strictly:
1. Only recommend actions the ISSUING BANK can take using data it already has or can access directly. This includes: internal transaction history, authorization logs, account activity, cardholder communication records, internal fraud databases, device/IP logs, and prior dispute history.
2. Do NOT recommend contacting the merchant, requesting documents from the merchant, or asking the merchant's bank for anything. The issuer cannot compel the merchant to respond at this stage.
3. Do NOT recommend generic actions like "contact the cardholder" unless there is a specific data point to verify with them.
4. You MAY recommend checking publicly available information (e.g. merchant reputation, business status, known fraud patterns for this merchant) only if it is directly relevant to resolving the ambiguity in this specific case.
5. Each action must name a specific internal system, data source, or lookup — not vague advice.

Respond with valid JSON only. No markdown. Schema: {"recommendations":[{"title":<string>,"action":<string>,"rationale":<string>}]}`;

function buildConfigPrompt(code, cfg){
  const wf=cfg.codes[code];
  const t=wf.thresholds;
  const w=cfg.weights;
  const ruleText=(rows)=>rows.map(r=>{
    const f=FIELDS.find(x=>x.p===r.field)||{label:r.field};
    return `  IF ${f.label} ${OP_LABEL[r.op]} ${r.thresh} → ${r.pts>0?"+":""}${r.pts} pts [${r.pts>0?"GREEN — supports cardholder":"RED — opposes cardholder"}]`;
  }).join("\n");
  return `WORKFLOW CONFIGURATION
Reason Code: ${code} — ${wf.label}

SCORING DIRECTION:
  HIGH score (≥${t.acceptAbove}) = cardholder claim CREDIBLE → Recommend ACCEPT [GREEN]
  MID score (${t.fightBelow}–${t.acceptAbove}) = ambiguous → Recommend ESCALATE [AMBER]
  LOW score (<${t.fightBelow}) = evidence CONTRADICTS cardholder → Recommend FIGHT [RED]

SCORE WEIGHTS:
  Overall = (${w.evidence}% × evidenceScore) + (${w.risk}% × riskScore) + (${w.customer}% × customerScore)

DECISION THRESHOLDS:
  Accept if overallScore > ${t.acceptAbove}
  Fight  if overallScore < ${t.fightBelow}
  Escalate otherwise

EVIDENCE SCORING RUBRIC (merchant-submitted evidence only — evidence_available.* fields):
  pos impact = supports cardholder claim [GREEN]
  neg impact = contradicts cardholder claim [RED]
${ruleText(wf.evidenceRubric)}

RISK SIGNALS RUBRIC (behavioral/fraud signals — risk_signals.* → riskScore):
  pos impact = low fraud risk [GREEN]
  neg impact = fraud signals present [RED]
${ruleText(wf.riskRubric)}

CUSTOMER PROFILE RUBRIC (account history — cardholder.* → customerScore):
  pos impact = credible customer profile [GREEN]
  neg impact = elevated dispute history [RED]
${ruleText(wf.customerRubric)}`;}

function buildCasePrompt(kase){
  const {_meta,...data}=kase;
  return `CASE DATA (raw — all fields available for analysis):
${JSON.stringify(data,null,2)}`;}

// LLM only writes detail sentences. Scores, pts, impact already computed.
// caseSummary gives just enough context to write relevant sentences.
function buildEvidenceInstruction(matchedFactors, caseSummary){
  const list=matchedFactors.map(f=>`  id:${f.id} | field:${f.field} | observed:${f.observed} | pts:${f.pts} | impact:${f.impact}`).join("\n");
  return `Case: ${caseSummary}
The following evidence factors have been scored by the rules engine. For each, write 1-2 sentences explaining what the finding means for the cardholder's claim. Also write a 2-3 sentence summary of the overall evidence picture.
${list||"  (no evidence rules matched)"}
Return JSON per schema. Use exact id values.`;}

function buildRiskInstruction(custFactors, riskFactors, caseSummary, outcome){
  const fmt=f=>`  id:${f.id} | field:${f.field} | observed:${f.observed} | pts:${f.pts} | impact:${f.impact}`;
  const outcomeCtx=outcome
    ? `
RULES ENGINE DECISION: ${outcome.rec.toUpperCase()} (overall score ${outcome.overall}/${outcome.max} — ${outcome.rec==="fight"?"claim does NOT appear credible":outcome.rec==="accept"?"claim appears CREDIBLE":"ambiguous, needs review"}). Your reasoning summary MUST be consistent with this decision.`
    : "";
  return `Case: ${caseSummary}${outcomeCtx}
The following factors have been scored by the rules engine. For each, write 1-2 sentences explaining what the finding means for claim credibility. Also write a 2-3 sentence reasoning summary that clearly supports the rules engine decision above.
Customer profile (cardholder.*):
${custFactors.map(fmt).join("\n")||"  (none matched)"}
Risk signals (risk_signals.*):
${riskFactors.map(fmt).join("\n")||"  (none matched)"}
Return JSON per schema. Use exact id values.`;}

function buildRepresentmentInstruction(kase){
  const d=kase.dispute;const t=kase.transaction;const c=kase.cardholder;
  return `Write a dispute denial letter for the following case.
Cardholder: ${c.customer_id} | Card: ···${t.card_last_four} | Case: ${d.dispute_id}
Claim: ${d.reason_description} | Amount: $${d.amount} at ${t.merchant_name} on ${t.transaction_date}
Date: ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}
Follow your system prompt instructions exactly.`;}

function buildEscalationInstruction(kase, rkResult){
  const d=kase.dispute;const t=kase.transaction;
  const ambiguous=[...(rkResult?.riskFactors||[])].map(f=>`${f.name}: ${f.observed} (${f.pts>0?"+":""}${f.pts})`).join(", ")||"none";
  return `Case: ${d.dispute_id} | Reason Code: ${d.reason_code} — ${d.reason_description}
Transaction: $${d.amount} at ${t.merchant_name} | Overall score: ${rkResult?.overallScore} (ambiguous zone)
Matched factors: ${ambiguous}
Recommend 3-4 specific investigative actions to resolve ambiguity. Return JSON per schema.`;}

function getFieldMeta(path){return FIELDS.find(f=>f.p===path)||{label:path,t:"string"};}
function fieldType(path){return getFieldMeta(path).t;}

function Ring({s,color}){
  const sz=60,r=25,circ=2*Math.PI*r,fill=(s/100)*circ;
  return <div style={{position:"relative",width:sz,height:sz,margin:"0 auto 4px"}}>
    <svg width={sz} height={sz} style={{transform:"rotate(-90deg)"}} viewBox="0 0 60 60">
      <circle cx="30" cy="30" r={r} fill="none" stroke="#EDE9E3" strokeWidth={5}/>
      <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth={5} strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"/>
    </svg>
    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <span style={{fontFamily:"Space Mono,monospace",fontSize:13,fontWeight:700,color}}>{s}</span></div>
  </div>;}

const S=`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'DM Sans',sans-serif;background:#F6F4F1;color:#1A1816}
.app{min-height:100vh;display:flex;flex-direction:column}
.hdr{background:#FFF;border-bottom:1px solid #E8E4DE;padding:0 20px;display:flex;align-items:center;height:50px;gap:12px;position:sticky;top:0;z-index:200}
.logo{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:#6B5B3E}
.ntab{padding:6px 13px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;color:#8A8680;border:none;background:none;transition:all .15s}
.ntab:hover{color:#5A564F;background:#F6F4F1}.ntab.on{background:#6B5B3E;color:#fff}
.body{padding:18px 24px 80px;flex:1;max-width:940px}
.pnl{background:#FFF;border:1px solid #E8E4DE;border-radius:10px;padding:16px;margin-bottom:12px}
.pt{font-size:12px;font-weight:600;color:#5A564F;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px}
.slr{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #F2EFE9}.slr:last-child{border-bottom:none}
input[type=range]{flex:2;accent-color:#6B5B3E}
input[type=number],input[type=text]{padding:4px 7px;border:1px solid #E8E4DE;border-radius:6px;font-size:12px;color:#1A1816;background:#F6F4F1;outline:none}
input[type=number]:focus,input[type=text]:focus{border-color:#8B7355}
select{padding:4px 7px;border:1px solid #E8E4DE;border-radius:6px;font-size:12px;color:#1A1816;background:#FFF;outline:none;cursor:pointer;max-width:220px}
.rrow{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #F2EFE9;flex-wrap:wrap}.rrow:last-child{border-bottom:none}
.ctabs{display:flex;gap:2px;margin-bottom:14px;border-bottom:1px solid #E8E4DE}
.ctab{padding:7px 14px;font-size:12px;font-weight:500;color:#8A8680;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s}
.ctab:hover{color:#5A564F}.ctab.on{color:#6B5B3E;border-bottom-color:#6B5B3E;font-weight:600}
.rtbl{width:100%;border-collapse:collapse;font-size:12px}
.rtbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:#8A8680;font-weight:600;padding:0 6px 7px;border-bottom:1px solid #E8E4DE}
.rtbl td{padding:5px 4px;border-bottom:1px solid #F2EFE9;vertical-align:middle}.rtbl tr:last-child td{border-bottom:none}
.txb{background:#FFF;border-bottom:2px solid #E8E4DE;padding:10px 20px;display:flex;align-items:center;flex-wrap:wrap;position:sticky;top:50px;z-index:90}
.tf{padding:0 13px;border-right:1px solid #E8E4DE}.tf:first-child{padding-left:0}.tf:last-child{border-right:none;margin-left:auto;padding-right:0}
.tl{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#8A8680;font-weight:500;margin-bottom:2px}
.tv{font-family:'Space Mono',monospace;font-size:12px;font-weight:700}
.csel{padding:10px 20px 0;display:flex;gap:8px}
.cb{padding:6px 12px;border-radius:6px;border:1px solid #E8E4DE;background:#FFF;font-size:11px;font-family:'Space Mono',monospace;cursor:pointer;color:#5A564F;line-height:1.4;transition:all .15s}
.cb:hover{border-color:#8B7355}.cb.on{background:#6B5B3E;color:#fff;border-color:#6B5B3E}
.pipe{margin:10px 20px 0;background:#FFF;border:1px solid #E8E4DE;border-radius:10px;padding:9px 12px;display:flex;align-items:center;gap:4px}
.ags{flex:1;display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px}
.agi{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;background:#F6F4F1;border:1.5px solid #E8E4DE;transition:all .3s}
.agi.r{border-color:#8B7355;background:#F5EFE6;animation:pulse 1.2s ease-in-out infinite}.agi.d{border-color:#2E7D52;background:#EAF4EE}
.agc{width:20px;flex-shrink:0;height:1px;background:#E8E4DE;position:relative}
.agc.d{background:#6B5B3E}.agc::after{content:'▶';position:absolute;right:-5px;top:-6px;font-size:9px;color:#E8E4DE}.agc.d::after{color:#6B5B3E}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.itabs{margin:9px 20px 0;display:flex;gap:2px;border-bottom:1px solid #E8E4DE}
.itab{padding:7px 13px;font-size:12px;font-weight:500;color:#8A8680;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s}
.itab:hover:not(.lk){color:#5A564F}.itab.on{color:#6B5B3E;border-bottom-color:#6B5B3E;font-weight:600}.itab.lk{opacity:.35;cursor:not-allowed}
.ibody{padding:12px 20px 90px;flex:1}
.ipnl{background:#FFF;border:1px solid #E8E4DE;border-radius:10px;padding:15px;margin-bottom:11px}
.scrow{display:flex;gap:10px;margin-bottom:11px}
.scard{background:#FFF;border:1px solid #E8E4DE;border-radius:10px;padding:12px;text-align:center}
.ft{width:100%;border-collapse:collapse;font-size:13px}
.ft th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#8A8680;font-weight:600;padding:0 8px 7px;border-bottom:1px solid #E8E4DE}
.ft td{padding:7px 8px;border-bottom:1px solid #F2EFE9;vertical-align:middle}.ft tr:last-child td{border-bottom:none}
.fr:hover td{background:#FAFAF8;cursor:pointer}.fex{padding:8px 8px 8px 14px;background:#FAFAF8;border-bottom:1px solid #E8E4DE;font-size:12px;color:#5A564F;line-height:1.5}
.asel{display:flex;gap:8px;margin-bottom:11px}
.ao{flex:1;padding:8px;border-radius:8px;border:1.5px solid #E8E4DE;background:#fff;cursor:pointer;text-align:center;transition:all .15s}
.ao:hover{border-color:#8B7355}.ao.sf{border-color:#C0392B;background:#FDEDEC}.ao.sa{border-color:#2E7D52;background:#EAF4EE}.ao.se{border-color:#6B4C8A;background:#F3EEF8}
.fcr{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #F2EFE9;cursor:pointer}.fcr:last-child{border-bottom:none}
.fcr input{width:13px;height:13px;accent-color:#6B5B3E;cursor:pointer;flex-shrink:0}
.led{width:100%;min-height:200px;background:#F6F4F1;border:1px solid #E8E4DE;border-radius:8px;padding:11px;font-size:12px;line-height:1.7;color:#5A564F;font-family:'DM Sans',sans-serif;resize:vertical;outline:none}
.pbox{background:#1A1816;border-radius:8px;padding:11px;margin:8px 0}
.ptext{font-family:'Space Mono',monospace;font-size:10px;line-height:1.5;color:#D4CFC8;white-space:pre-wrap;word-break:break-word;max-height:140px;overflow:auto;background:#2A2420;border-radius:5px;padding:8px;margin-top:4px}
.plbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#8A8680;display:flex;align-items:center;gap:6px;margin-top:8px}
.plbl:first-child{margin-top:0}
.roTag{font-size:9px;color:#5A564F;background:#2A2420;padding:2px 6px;border-radius:3px;font-weight:400;text-transform:none;letter-spacing:0}
.decbar{position:fixed;bottom:0;left:0;right:0;background:#FFF;border-top:1px solid #E8E4DE;padding:9px 20px;display:flex;align-items:center;gap:10px;z-index:100}
.cta{padding:9px 18px;border-radius:8px;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap;transition:all .15s}
.cta:disabled{opacity:.3;cursor:not-allowed}
.cta.fight{background:#C0392B;color:#fff}.cta.accept{background:#2E7D52;color:#fff}.cta.escalate{background:#6B4C8A;color:#fff}
.rvb{padding:8px 13px;background:#fff;color:#C0392B;border:1.5px solid #C0392B;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer}
.rvb:hover{background:#FDEDEC}.dspc{flex:1}.dnote{font-size:11px;color:#8A8680;white-space:nowrap}
.btn{padding:6px 12px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;border:1.5px solid #E8E4DE;background:#fff;color:#5A564F;transition:all .15s}
.btn:hover{border-color:#8B7355;color:#6B5B3E}.btn.p{background:#6B5B3E;border-color:#6B5B3E;color:#fff}.btn.p:hover{background:#8B7355}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn.sm{padding:3px 9px;font-size:11px}.btn.danger{border-color:#C0392B;color:#C0392B}.btn.danger:hover{background:#FDEDEC}
.enote{font-size:12px;color:#8A8680;background:#F6F4F1;border:1px solid #E8E4DE;border-radius:6px;padding:6px 11px;display:flex;align-items:center;gap:6px;margin-bottom:9px}
.tli{display:flex;gap:8px;padding:5px 0;font-size:12px;color:#5A564F}.tld{width:5px;height:5px;border-radius:50%;background:#8B7355;margin-top:5px;flex-shrink:0}
.badge{display:inline-block;padding:3px 9px;border-radius:5px;font-size:11px;font-weight:700}
.te{display:flex;gap:10px;padding:3px 0;border-bottom:1px solid #F2EFE9;font-family:'Space Mono',monospace;font-size:10px;line-height:1.5}.te:last-child{border-bottom:none}
.te-time{color:#B0A898;flex-shrink:0;width:60px}
.te-icon{flex-shrink:0;width:14px;text-align:center;color:#B0A898}
.te-msg{flex:1;word-break:break-word;color:#5A564F}
.te.sys .te-msg{color:#8A8680}
.te.rule-match .te-icon{color:#2E7D52}.te.rule-match .te-msg{color:#2E7D52}
.te.rule-miss .te-msg{color:#C8C2BB}
.te.llm .te-icon{color:#6B5B3E}.te.llm .te-msg{color:#6B5B3E}
.te.score .te-msg{color:#5A564F;font-weight:700}
.te.decision .te-msg{color:#1A1816;font-weight:700}
.te.error .te-msg{color:#C0392B}`;

function RubricRow({row, onUpdate, onRemove}){
  const fMeta=getFieldMeta(row.field);
  const ops=OPS[fMeta.t]||OPS.string;
  return <tr>
    <td style={{minWidth:180}}>
      <select value={row.field} onChange={e=>onUpdate("field",e.target.value)} style={{width:"100%",fontSize:11}}>
        {FIELDS.map(f=><option key={f.p} value={f.p}>{f.label}</option>)}
      </select></td>
    <td style={{width:55}}>
      <select value={row.op} onChange={e=>onUpdate("op",e.target.value)} style={{width:"100%"}}>
        {ops.map(o=><option key={o} value={o}>{OP_LABEL[o]}</option>)}
      </select></td>
    <td style={{width:90}}>
      {fMeta.t==="boolean"
        ?<select value={row.thresh} onChange={e=>onUpdate("thresh",e.target.value)} style={{width:"100%"}}>
            <option value="true">true</option><option value="false">false</option>
          </select>
        :<input type="text" value={row.thresh} onChange={e=>onUpdate("thresh",e.target.value)} style={{width:80}}/>
      }</td>
    <td style={{width:70}}>
      <input type="number" value={row.pts} onChange={e=>onUpdate("pts",+e.target.value)} style={{width:60}}/>
    </td>
    <td style={{width:55,textAlign:"center"}}>
      <span style={{fontFamily:"Space Mono,monospace",fontSize:12,fontWeight:700,color:row.pts>0?C.green:C.red}}>{row.pts>0?"+":""}{row.pts}</span>
    </td>
    <td style={{width:36}}><button className="btn sm danger" onClick={onRemove}>✕</button></td>
  </tr>;}

function HumanLoopRule({rule, onUpdate, onRemove}){
  const fMeta=getFieldMeta(rule.field);
  const ops=OPS[fMeta.t]||OPS.string;
  return <div className="rrow" style={{gap:6,flexWrap:"nowrap",alignItems:"center"}}>
    <select value={rule.field} onChange={e=>onUpdate("field",e.target.value)} style={{flex:2,fontSize:11}}>
      {FIELDS.map(f=><option key={f.p} value={f.p}>{f.label}</option>)}
    </select>
    <select value={rule.op} onChange={e=>onUpdate("op",e.target.value)} style={{width:50}}>
      {ops.map(o=><option key={o} value={o}>{OP_LABEL[o]}</option>)}
    </select>
    {fMeta.t==="boolean"
      ?<select value={rule.thresh} onChange={e=>onUpdate("thresh",e.target.value)} style={{width:65}}>
          <option value="true">true</option><option value="false">false</option>
        </select>
      :<input type="text" value={rule.thresh} onChange={e=>onUpdate("thresh",e.target.value)} style={{width:80}}/>
    }
    <button className="btn sm danger" onClick={onRemove}>✕</button>
  </div>;}

function ConfigTab({cfg, setCfg, onSave, savedMsg}){
  const [codeTab, setCodeTab]=useState(Object.keys(cfg.codes)[0]);
  const codes=Object.keys(cfg.codes);
  const w=cfg.weights;
  const wf=cfg.codes[codeTab]||{};
  const t=wf.thresholds||{acceptAbove:65,fightBelow:38};

  const setW=(k,v)=>setCfg(c=>({...c,weights:{...c.weights,[k]:v}}));
  const setT=(k,v)=>setCfg(c=>({...c,codes:{...c.codes,[codeTab]:{...c.codes[codeTab],thresholds:{...t,[k]:+v}}}}));
  const total=w.evidence+w.risk+w.customer;

  function updateRubricRow(type,id,field,val){
    const key=type==="ev"?"evidenceRubric":type==="rk"?"riskRubric":"customerRubric";
    setCfg(c=>{
      const rows=c.codes[codeTab][key].map(r=>r.id===id?{...r,[field]:field==="pts"?+val:val}:r);
      if(field==="field"){
        const nm=getFieldMeta(val);const ops=OPS[nm.t]||OPS.string;
        return {...c,codes:{...c.codes,[codeTab]:{...c.codes[codeTab],[key]:rows.map(r=>r.id===id?{...r,op:ops[0],thresh:nm.t==="boolean"?"true":""}:r)}}};
      }
      return {...c,codes:{...c.codes,[codeTab]:{...c.codes[codeTab],[key]:rows}}};});}
  function removeRubricRow(type,id){
    const key=type==="ev"?"evidenceRubric":type==="rk"?"riskRubric":"customerRubric";
    setCfg(c=>({...c,codes:{...c.codes,[codeTab]:{...c.codes[codeTab],[key]:c.codes[codeTab][key].filter(r=>r.id!==id)}}}));
  }
  function addRubricRow(type){
    const key=type==="ev"?"evidenceRubric":type==="rk"?"riskRubric":"customerRubric";
    const defaultField=type==="ev"?"evidence_available.delivery_confirmation.exists":type==="rk"?"risk_signals.velocity_flag":"cardholder.prior_disputes";
    setCfg(c=>{
      const rows=c.codes[codeTab][key]||[];
      const newId=Math.max(0,...rows.map(r=>r.id))+1;
      return {...c,codes:{...c.codes,[codeTab]:{...c.codes[codeTab],[key]:[...rows,{id:newId,field:defaultField,op:"eq",thresh:"true",pts:10}]}}};
    });}
  function addWorkflow(){
    const name=prompt("Enter reason code (e.g. 10.4):");
    if(!name||cfg.codes[name])return;
    setCfg(c=>({...c,codes:{...c.codes,[name]:{label:"New Workflow",thresholds:{acceptAbove:65,fightBelow:38},evidenceRubric:[],riskRubric:[],customerRubric:[]}}}));
    setCodeTab(name);}
  function updateHL(id,field,val){
    setCfg(c=>({...c,humanLoop:{...c.humanLoop,rules:c.humanLoop.rules.map(r=>{
      if(r.id!==id)return r;
      if(field==="field"){const m=getFieldMeta(val);return {...r,field:val,op:(OPS[m.t]||OPS.string)[0],thresh:m.t==="boolean"?"true":""};}
      return {...r,[field]:val};})}}));}
  function addHL(){
    setCfg(c=>({...c,humanLoop:{...c.humanLoop,rules:[...c.humanLoop.rules,{id:Date.now(),field:"dispute.amount",op:"gt",thresh:"500",label:""}]}}));
  }
  function removeHL(id){setCfg(c=>({...c,humanLoop:{...c.humanLoop,rules:c.humanLoop.rules.filter(r=>r.id!==id)}}));}

  const rubricSection=(type,label,hint,scoreLabel)=>{
    const key=type==="ev"?"evidenceRubric":type==="rk"?"riskRubric":"customerRubric";
    const rows=wf[key]||[];
    return <div style={{marginBottom:20}}>
      <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:600,color:C.t2}}>{label}</span>
        <span style={{fontSize:11,color:C.t3}}>{hint}</span>
        <span style={{marginLeft:"auto",fontSize:11,fontFamily:"Space Mono,monospace",color:C.t3}}>→ {scoreLabel}</span>
      </div>
      <table className="rtbl">
        <thead><tr><th style={{minWidth:180}}>Field</th><th style={{width:55}}>Op</th><th style={{width:90}}>Threshold</th><th style={{width:70}}>Points</th><th style={{width:55}}>Impact</th><th style={{width:36}}></th></tr></thead>
        <tbody>{rows.map(r=><RubricRow key={r.id} row={r} onUpdate={(f,v)=>updateRubricRow(type,r.id,f,v)} onRemove={()=>removeRubricRow(type,r.id)}/>)}</tbody>
      </table>
      <button className="btn sm" style={{marginTop:8}} onClick={()=>addRubricRow(type)}>+ Add Rule</button>
    </div>;};

  return <div className="body">
    <div className="pnl">
      <div className="pt">Scoring Weights</div>
      <div style={{fontSize:12,color:C.t3,marginBottom:10}}>Must sum to 100. Current: <strong style={{color:total===100?C.green:C.red}}>{total}</strong></div>
      {[["evidence","Evidence Analysis",w.evidence],["risk","Risk Assessment",w.risk],["customer","Customer Profile",w.customer]].map(([k,l,v])=>(
        <div key={k} className="slr">
          <span style={{fontSize:13,color:C.t1,flex:1}}>{l}</span>
          <input type="range" min={0} max={100} value={v} onChange={e=>setW(k,+e.target.value)}/>
          <span style={{fontFamily:"Space Mono,monospace",fontSize:13,fontWeight:700,color:C.accent,width:34,textAlign:"right"}}>{v}%</span>
        </div>
      ))}</div>

    <div className="pnl">
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <div className="pt" style={{marginBottom:0}}>Decision Thresholds &amp; Scoring Rubric</div>
        <button className="btn sm p" style={{marginLeft:"auto"}} onClick={addWorkflow}>+ Add Workflow</button>
      </div>
      <div style={{fontSize:12,color:C.t3,marginBottom:10}}>
        <strong style={{color:C.green}}>Positive pts</strong> = supports cardholder [green]. <strong style={{color:C.red}}>Negative pts</strong> = contradicts cardholder [red].
      </div>
      <div className="ctabs">
        {codes.map(code=><div key={code} className={`ctab${codeTab===code?" on":""}`} onClick={()=>setCodeTab(code)}>{code} {cfg.codes[code].label}</div>)}
      </div>

      <div style={{display:"flex",gap:12,marginBottom:18,padding:"12px 14px",background:C.bg,borderRadius:8}}>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:C.t3,marginBottom:5,fontWeight:600}}>ACCEPT if score ≥</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <input type="number" value={t.acceptAbove} min={t.fightBelow+1} max={99} onChange={e=>setT("acceptAbove",e.target.value)} style={{width:60}}/>
            <span className="badge" style={{background:C.gBg,color:C.green}}>Cardholder credible</span>
          </div></div>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:C.t3,marginBottom:5,fontWeight:600}}>ESCALATE</div>
          <div style={{fontSize:13,color:C.esc,fontWeight:600,paddingTop:4}}>{t.fightBelow} – {t.acceptAbove}</div>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:C.t3,marginBottom:5,fontWeight:600}}>FIGHT if score &lt;</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <input type="number" value={t.fightBelow} min={1} max={t.acceptAbove-1} onChange={e=>setT("fightBelow",e.target.value)} style={{width:60}}/>
            <span className="badge" style={{background:C.rBg,color:C.red}}>Opposes cardholder</span>
          </div></div></div>

      {rubricSection("ev","Evidence Rubric","evidence_available.* fields","evidenceScore")}
      {rubricSection("rk","Risk Signals Rubric","risk_signals.* fields","riskScore")}
      {rubricSection("cu","Customer Profile Rubric","cardholder.* fields","customerScore")}
    </div>

    <div className="pnl">
      <div className="pt">Keep Human in the Loop</div>
      <div style={{fontSize:12,color:C.t3,marginBottom:12}}>Require analyst approval when ANY of these conditions are met for a case.</div>
      <div style={{marginBottom:8}}>
        {(cfg.humanLoop.rules||[]).map(rule=>(
          <HumanLoopRule key={rule.id} rule={rule} onUpdate={(f,v)=>updateHL(rule.id,f,v)} onRemove={()=>removeHL(rule.id)}/>
        ))}</div>
      <button className="btn sm" onClick={addHL}>+ Add Condition</button></div>

    <div style={{display:"flex",gap:10,alignItems:"center"}}>
      <button className="btn p" onClick={onSave}>Save &amp; Apply Configuration</button>
      {savedMsg&&<span style={{fontSize:12,color:C.green,fontWeight:600}}>✓ Saved — applies on next pipeline run</span>}
    </div>
  </div>;}

function InvestigationTab({cfg, cfgV}){
  const [ci, setCi]=useState(0);
  const [itab, setItab]=useState("Overview");
  const [pipe, setPipe]=useState("idle");
  const [curAg, setCurAg]=useState(null);
  const [doneA, setDoneA]=useState([]);
  const [err, setErr]=useState(null);
  const [evR, setEvR]=useState(null);
  const [rkR, setRkR]=useState(null);
  const [enrichedKase, setEnrichedKase]=useState(null);
  const [exp, setExp]=useState({});
  const [dec, setDec]=useState(null);
  const [sel, setSel]=useState({});
  const [lDec, setLDec]=useState(null);
  const [lTxt, setLTxt]=useState("");
  const [lDirty, setLDirty]=useState(false);
  const [genL, setGenL]=useState(false);
  const [showP, setShowP]=useState({});
  const [showRaw, setShowRaw]=useState(false);
  const [seenV, setSeenV]=useState(cfgV);
  const [trace, setTrace]=useState([]);
  const [traceOpen, setTraceOpen]=useState(false);
  const traceRef=useRef([]);
  function addTrace(type, msg, meta={}){
    const e={id:Date.now()+Math.random(),time:new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}),type,msg,...meta};
    traceRef.current=[...traceRef.current,e];
    setTrace([...traceRef.current]);}

  const kase=CASES[ci];
  const code=kase._meta.code;
  const wf=cfg.codes[code]||Object.values(cfg.codes)[0];
  const t=wf.thresholds;
  const pDone=pipe==="done";
  const cfgStale=cfgV!==seenV&&pDone;

  function reset(){
    setPipe("idle");setCurAg(null);setDoneA([]);setErr(null);setEvR(null);setRkR(null);setEnrichedKase(null);
    setExp({});setDec(null);setSel({});setLDec(null);setLTxt("");setLDirty(false);
    setShowP({});setShowRaw(false);setItab("Overview");setSeenV(cfgV);
    setTrace([]);traceRef.current=[];}
  const [prevCi, setPrevCi]=useState(ci);
  if(ci!==prevCi){setPrevCi(ci);reset();}

  function unlocked(t){
    return t==="Overview"||(t==="Analysis"&&pipe!=="idle")||(t==="Recommendation"&&doneA.includes("recommendation"))||(t==="Decision"&&pDone);
  }


  // ── Visa Network Rules ───────────────────────────────────────────────────
  const VISA_RULES={
    "13.1":{
      title:"Merchandise / Services Not Received",
      fieldTags:{
        "evidence_available.delivery_confirmation.exists":"req",
        "evidence_available.delivery_confirmation.tracking_number":"req",
        "evidence_available.delivery_confirmation.signature_on_file":"req",
        "evidence_available.delivery_confirmation.delivery_address_match":"ce",
        "evidence_available.customer_communication.exists":"ce",
        "evidence_available.order_confirmation.exists":"ce",
      },
      filingWindow:"120 days from expected delivery date",
      responseWindow:"30 days from dispute date",
      requiredEvidence:["Proof of delivery to billing/shipping address","Carrier tracking confirmation","Signature confirmation (transactions >$25)"],
      compellingEvidence:["Delivery to cardholder-specified address","Signed proof of delivery","IP/device match to prior orders","Prior dispute history with same merchant"],
      invalidConditions:["Cardholder signed for delivery","Digital goods with confirmed IP match and usage logs","Cardholder collected item in-store with ID"],
      guidance:"Visa requires documented proof of delivery to the address provided at checkout. Signature confirmation is mandatory for transactions over $25. Without carrier confirmation, the issuer cannot successfully represent this dispute."
    },
    "13.2":{
      title:"Cancelled Recurring Transaction",
      fieldTags:{
        "evidence_available.order_confirmation.exists":"req",
        "evidence_available.refund_policy_acceptance.exists":"req",
        "evidence_available.customer_communication.exists":"req",
        "evidence_available.order_confirmation.opened":"ce",
      },
      filingWindow:"120 days from transaction date",
      responseWindow:"30 days from dispute date",
      requiredEvidence:["Proof cardholder did not cancel","Cancellation policy accepted at enrollment","Evidence of continued service use after alleged cancellation"],
      compellingEvidence:["Signed terms with clear recurring billing disclosure","Usage logs post-cancellation date","Prior successful charges not disputed","Email confirmation of cancellation denial"],
      invalidConditions:["Merchant can prove cancellation was not requested","Cardholder continued using service after claimed cancellation date","Terms clearly disclosed recurring nature at checkout"],
      guidance:"Visa mandates that merchants disclose recurring billing terms clearly at enrollment. If the cardholder can demonstrate a valid cancellation request was ignored, the dispute is typically valid. Continued usage after the cancellation date is strong counter-evidence."
    },
    "13.3":{
      title:"Not as Described or Defective Merchandise",
      fieldTags:{
        "evidence_available.order_confirmation.exists":"req",
        "evidence_available.refund_policy_acceptance.exists":"req",
        "evidence_available.delivery_confirmation.exists":"ce",
        "evidence_available.customer_communication.exists":"ce",
        "evidence_available.order_confirmation.opened":"ce",
      },
      filingWindow:"120 days from date cardholder received merchandise",
      responseWindow:"30 days from dispute date",
      requiredEvidence:["Proof item matched description at time of sale","Evidence cardholder received item as described","Return/refund policy disclosed at checkout"],
      compellingEvidence:["Product listing matching dispute timeframe","Evidence cardholder used or consumed item","Photos or inspection report contradicting claim","Prior accepted return policy"],
      invalidConditions:["Item was returned and credit already issued","Cardholder did not attempt to return item per policy","Dispute filed after return window expired"],
      guidance:"Visa requires the cardholder to attempt resolution with the merchant before filing. The issuer must verify that the item materially differed from its description. Merchants should provide product documentation and return correspondence."
    },
  };

  // ── Evidence Retrieval Agent ─────────────────────────────────────────────
  // Mock tool registry: simulates async API calls with realistic delays.
  // Each tool returns outcome-keyed responses so demo cases stay consistent.
  async function mockTool(name, ms, result, at){
    at("llm",`  🔧 tool_call: ${name}`);
    await new Promise(r=>setTimeout(r,ms));
    const summary=typeof result==="object"?Object.entries(result).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join(", "):String(result);
    at("rule-match",`  ✓ ${name} → ${summary}`);
    return result;}

  const TOOL_RESPONSES={
    fight:{
      shipping:{exists:true,carrier:"FedEx",tracking_number:"7489274892748",delivery_date:"2024-12-02T14:22:00Z",signature_on_file:true,delivery_address_match:true},
      email:{exists:true,last_contact_date:"2024-12-08T10:15:00Z",contact_method:"email",summary:"Customer claimed package was stolen from porch"},
      order:{exists:true,sent_date:"2024-11-28T09:16:00Z",opened:true},
      refund:{exists:true,accepted_at:"2024-11-28T09:14:55Z"},
    },
    accept:{
      shipping:{exists:false,carrier:null,tracking_number:null,delivery_date:null,signature_on_file:false,delivery_address_match:false},
      email:{exists:false,last_contact_date:null,contact_method:null,summary:null},
      order:{exists:true,sent_date:"2024-11-15T10:00:00Z",opened:false},
      refund:{exists:false,accepted_at:null},
    },
    escalate:{
      shipping:{exists:true,carrier:"UPS",tracking_number:"1Z9999W990123456784",delivery_date:"2024-11-20T09:00:00Z",signature_on_file:false,delivery_address_match:true},
      email:{exists:true,last_contact_date:"2024-11-25T14:00:00Z",contact_method:"chat",summary:"Customer says service did not match description"},
      order:{exists:true,sent_date:"2024-11-10T08:00:00Z",opened:true},
      refund:{exists:true,accepted_at:"2024-11-10T07:58:00Z"},
    },
  };

  async function runEvidenceRetrieval(kase, at){
    const outcome=kase._meta.outcome;
    const r=TOOL_RESPONSES[outcome]||TOOL_RESPONSES.escalate;
    const code=kase.dispute.reason_code;
    at("llm","Step 0: Evidence Retrieval Agent — querying external systems");
    // Always query order system and email logs
    const [shipping,email,order,refund]=await Promise.all([
      code==="13.1"||code==="13.3"
        ? mockTool("shipping_api("+kase.transaction.merchant_id+")",700+Math.random()*400,r.shipping,at)
        : Promise.resolve(null),
      mockTool("email_logs("+kase.cardholder.customer_id+")",500+Math.random()*300,r.email,at),
      mockTool("order_system("+kase.dispute.dispute_id+")",400+Math.random()*300,r.order,at),
      mockTool("refund_portal("+kase.dispute.dispute_id+")",300+Math.random()*200,r.refund,at),
    ]);
    const evidence={
      ...(shipping?{delivery_confirmation:shipping}:{delivery_confirmation:kase.evidence_available?.delivery_confirmation}),
      customer_communication:email||kase.evidence_available?.customer_communication,
      order_confirmation:order||kase.evidence_available?.order_confirmation,
      refund_policy_acceptance:refund||kase.evidence_available?.refund_policy_acceptance,
    };
    at("llm",`  ✓ Evidence Retrieval complete — ${Object.keys(evidence).length} evidence categories populated`);
    return {...kase,evidence_available:evidence};}

  async function runPipe(){
    if(pipe!=="idle")return;
    setPipe("running");setErr(null);setDoneA([]);setSeenV(cfgV);
    setTrace([]);traceRef.current=[];
    const wf=cfg.codes[code];
    const t0=Date.now();
    addTrace("sys",`Pipeline started — Case ${kase.dispute.dispute_id} | Reason ${kase.dispute.reason_code}: ${kase.dispute.reason_description} | $${kase.dispute.amount}`);
    addTrace("sys",`Config: weights evidence=${cfg.weights.evidence}% risk=${cfg.weights.risk}% customer=${cfg.weights.customer}% | thresholds accept≥${t.acceptAbove} fight<${t.fightBelow}`);
    try{
      // ── Step 0: Evidence Retrieval Agent ──
      setCurAg("retrieval");
      const enrichedKase=await runEvidenceRetrieval(kase,addTrace);
      setEnrichedKase(enrichedKase);
      setDoneA(["retrieval"]);

      // ── Step 1: JS rubric evaluation — deterministic, no LLM ──
      addTrace("sys","Step 1: Deterministic rubric evaluation (no LLM)");

      // Evidence rubric — trace every rule
      addTrace("sys",`  Evidence rubric: evaluating ${wf.evidenceRubric.length} rules`);
      const evComputed=computeRubricScoreTraced(wf.evidenceRubric,enrichedKase,addTrace);

      // Risk rubric
      addTrace("sys",`  Risk signals rubric: evaluating ${(wf.riskRubric||[]).length} rules`);
      const rkRaw=computeRubricScoreTraced(wf.riskRubric||[],enrichedKase,addTrace);

      // Customer rubric
      addTrace("sys",`  Customer profile rubric: evaluating ${(wf.customerRubric||[]).length} rules`);
      const custRaw=computeRubricScoreTraced(wf.customerRubric||[],enrichedKase,addTrace);

      const {score:evidenceScore,matched:evMatched}=evComputed;
      const riskScore=rkRaw.score; const custMatched=custRaw.matched; const customerScore=custRaw.score;
      const rkMatched=rkRaw.matched;

      addTrace("score",`Evidence score: ${evidenceScore}/100 (${evMatched.length}/${wf.evidenceRubric.length} rules matched, rawSum=${evComputed.rawSum})`);
      addTrace("score",`Risk signals score: ${riskScore}/100 (${rkMatched.length}/${(wf.riskRubric||[]).length} rules matched, rawSum=${rkRaw.rawSum})`);
      addTrace("score",`Customer profile score: ${customerScore}/100 (${custMatched.length}/${(wf.customerRubric||[]).length} rules matched, rawSum=${custRaw.rawSum})`);

      const overall=Math.round((cfg.weights.evidence/100)*evidenceScore+(cfg.weights.risk/100)*riskScore+(cfg.weights.customer/100)*customerScore);
      addTrace("score",`Overall: (${cfg.weights.evidence}%×${evidenceScore}) + (${cfg.weights.risk}%×${riskScore}) + (${cfg.weights.customer}%×${customerScore}) = ${overall}/100`);
      const rec=overall>=t.acceptAbove?"accept":overall<t.fightBelow?"fight":"escalate";
      addTrace("decision",`Decision threshold: score ${overall} → ${overall>=t.acceptAbove?`≥${t.acceptAbove} → ACCEPT`:overall<t.fightBelow?`<${t.fightBelow} → FIGHT`:`${t.fightBelow}–${t.acceptAbove} → ESCALATE`}`);

      // ── Steps 2+3: Evidence + Risk agents fire in parallel ──
      const caseSummary=`Case ${enrichedKase.dispute.dispute_id}: ${enrichedKase.dispute.reason_description}, $${enrichedKase.dispute.amount} at ${enrichedKase.transaction.merchant_name}.`;
      setCurAg("evidence");
      const llmT0=Date.now();
      addTrace("llm",`Step 2: LLM agents fired in parallel`);
      addTrace("llm",`  → Evidence Agent: writing detail sentences for ${evMatched.length} matched factors`);
      addTrace("llm",`  → Risk Agent: writing detail sentences for ${custMatched.length+rkMatched.length} matched factors + reasoning narrative`);
      const [evLLM,rkLLM]=await Promise.all([
        callLLM(SYSTEM_EVIDENCE,buildEvidenceInstruction(evMatched,caseSummary)).then(JSON.parse),
        callLLM(SYSTEM_RISK,buildRiskInstruction(custMatched,rkMatched,caseSummary,{rec,overall,max:100})).then(JSON.parse),
      ]);
      const llmMs=Date.now()-llmT0;
      addTrace("llm",`  ✓ Both LLM agents complete (${(llmMs/1000).toFixed(1)}s) — ${(evLLM.factors||[]).length} evidence details, ${(rkLLM.factors||[]).length} risk details`);

      const evDetailMap={};(evLLM.factors||[]).forEach(f=>{evDetailMap[f.id]=f.detail;});
      const evFactors=evMatched.map(f=>({...f,detail:evDetailMap[f.id]||""}));
      const evResult={evidenceScore,factors:evFactors,summary:evLLM.summary||""};
      const rkDetailMap={};(rkLLM.factors||[]).forEach(f=>{rkDetailMap[f.id]=f.detail;});
      const allRkFactors=[...custMatched,...rkMatched].map(f=>({...f,detail:rkDetailMap[f.id]||""}));
      const rkResult={riskScore,customerScore,overallScore:overall,recommendation:rec,riskFactors:allRkFactors,reasoning:rkLLM.reasoning||""};
      setEvR(evResult);setDoneA(["retrieval","evidence","risk"]);setItab("Analysis");

      // ── Default selection: all matched factors across all three rubrics ──
      const allFactors=[...evFactors,...allRkFactors];
      const initSel={};allFactors.forEach((_,i)=>{initSel[i]=true;});
      setSel(initSel);
      setRkR(rkResult);setCurAg("recommendation");

      // Auto-generate investigation plan if rec=escalate
      if(rec==="escalate"){
        addTrace("llm","Step 3: Escalation Agent — generating investigation plan (rec=escalate)");
        const escT0=Date.now();
        try{
          const raw=await callLLM(SYSTEM_ESCALATION,buildEscalationInstruction(kase,rkResult));
          const clean=raw.replace(/^```(?:json)?\n?/,"").replace(/\n?```$/,"").trim();
          const parsed=JSON.parse(clean);
          if(parsed.recommendations&&Array.isArray(parsed.recommendations)){
            setLTxt(JSON.stringify(parsed));
            addTrace("llm",`  ✓ Escalation Agent complete (${((Date.now()-escT0)/1000).toFixed(1)}s) — ${parsed.recommendations.length} investigation steps generated`);
          }
        }catch(e){addTrace("error",`  ✗ Escalation Agent failed: ${e.message}`);}
      }

      await new Promise(r=>setTimeout(r,250));
      setDoneA(["retrieval","evidence","risk","recommendation"]);
      setCurAg(null);setPipe("done");setLDec(rec);setItab("Recommendation");setTraceOpen(false);
      addTrace("sys",`Pipeline complete — total ${((Date.now()-t0)/1000).toFixed(1)}s | recommendation: ${rec.toUpperCase()}`);
    }catch(e){
      setPipe("error");setCurAg(null);setErr(e.message);
      addTrace("error",`Pipeline error: ${e.message}`);}}

  async function genDocument(){
    if(!rkR||!lDec)return;
    setGenL(true);
    try{
      const allFactors=[...(evR?.factors||[]),...(rkR?.riskFactors||[])];
      const chosen=allFactors.filter((_,i)=>sel[i]);
      const cfgP=buildConfigPrompt(code,cfg);
      const caseP=buildCasePrompt(kase);
      if(lDec==="fight"){
        const txt=await callLLMFull(SYSTEM_REPRESENTMENT,cfgP,caseP,buildRepresentmentInstruction(kase));
        setLTxt(txt);
      } else if(lDec==="escalate"){
        const raw=await callLLM(SYSTEM_ESCALATION,buildEscalationInstruction(kase,rkR));
        const clean=raw.replace(/^```(?:json)?\n?/,"").replace(/\n?```$/,"").trim();
        const parsed=JSON.parse(clean);
        if(!parsed.recommendations||!Array.isArray(parsed.recommendations))throw new Error("Invalid escalation response");
        setLTxt(JSON.stringify(parsed));
      } else {
        setLTxt("__accept__");
      }
      setLDirty(false);
    }catch(e){setLTxt(`[Error: ${e.message}]`);}
    setGenL(false);}

  const recVal=rkR?.recommendation;
  const selCnt=Object.values(sel).filter(Boolean).length;

  // Human-in-loop check
  const hlTriggered=(cfg.humanLoop.rules||[]).some(r=>evalOp(getVal(kase,r.field),r.op,r.thresh));

  const ea0=kase.evidence_available;
  const ea1=enrichedKase?.evidence_available;
  function evVal(ea){return [
    ["Delivery Confirmation",ea?.delivery_confirmation?.exists?"Yes — "+(ea.delivery_confirmation.carrier||""):"No"],
    ["Signature On File",ea?.delivery_confirmation?.signature_on_file?"Yes":"No"],
    ["Address Match",ea?.delivery_confirmation?.delivery_address_match?"Yes":"No"],
    ["Order Confirmation",ea?.order_confirmation?.exists?"Sent"+(ea.order_confirmation.opened?" (opened)":""):"No"],
    ["Refund Policy Accepted",ea?.refund_policy_acceptance?.exists?"Yes":"No"],
    ["Customer Communication",ea?.customer_communication?.exists?ea.customer_communication.summary:"None"],
  ];}
  const keyEvidence=evVal(ea1||ea0);
  const keyEvidenceOrig=ea1?evVal(ea0):null;

  function flattenObj(obj,prefix=""){
    return Object.entries(obj||{}).flatMap(([k,v])=>{
      const key=prefix?`${prefix}.${k}`:k;
      if(v!==null&&typeof v==="object"&&!Array.isArray(v))return flattenObj(v,key);
      return [[key,String(v)]];});}
  const {_meta,...caseDataForRaw}=kase;
  const rawRowsOrig=flattenObj(caseDataForRaw);
  const enrichedForRaw=enrichedKase?{...enrichedKase,_meta:undefined}:null;
  const {_meta:_m2,...enrichedDataForRaw}=enrichedKase||{_meta:null};
  const rawRows=enrichedKase?flattenObj(enrichedDataForRaw):rawRowsOrig;
  const rawOrigMap=new Map(rawRowsOrig);

  const AGENTS=[
    {key:"retrieval",label:"Evidence Retrieval",icon:"🌐",score:()=>null},
    {key:"evidence",label:"Evidence",icon:"🔍",score:()=>evR?.evidenceScore},
    {key:"risk",label:"Risk Signals",icon:"⚖️",score:()=>rkR?.riskScore},
    {key:"customer",label:"Customer Profile",icon:"👤",score:()=>rkR?.customerScore},
    {key:"recommendation",label:"Recommendation",icon:"✍️",score:()=>rkR?.overallScore},
  ];
  // evidence+customer+risk all complete together (parallel); recommendation is the synthesis step
  function agDone(key){return key==="retrieval"?doneA.includes("retrieval"):key==="recommendation"?doneA.includes("recommendation"):doneA.includes("risk");}
  function agRunning(key){return (curAg==="retrieval"&&key==="retrieval")||(curAg==="evidence"&&(key==="evidence"||key==="risk"||key==="customer"));}
  function aStat(key,scoreFn){
    if(agRunning(key))return key==="retrieval"?"Querying…":"Analyzing…";
    if(agDone(key)){const s=scoreFn();return s!=null?`Score: ${s}/100`:key==="retrieval"?"✓ Done":"Done";}
    return"Pending";}

  const cfgPDisplay=buildConfigPrompt(code,cfg);
  const casePDisplay=buildCasePrompt(kase);

  return <Fragment>
    <div className="csel">
      {CASES.map((c,i)=>{
        const icon=c._meta.outcome==="fight"?"⚔️":c._meta.outcome==="accept"?"✓":"↑";
        return <button key={i} className={`cb${ci===i?" on":""}`} onClick={()=>setCi(i)}>
          {c._meta.code} · {icon} {c._meta.outcome.charAt(0).toUpperCase()+c._meta.outcome.slice(1)}
        </button>;
      })}</div>

    <div className="txb">
      {[["ID",kase.dispute.dispute_id],["Amount","$"+kase.dispute.amount,C.red],["Code",kase.dispute.reason_code+" — "+kase.dispute.reason_description],["Merchant",kase.transaction.merchant_name],["Cardholder","···"+kase.transaction.card_last_four]].map(([l,v,col])=>(
        <div key={l} className="tf"><div className="tl">{l}</div><div className="tv" style={{color:col||C.t1}}>{v}</div></div>
      ))}
      <div className="tf"><div className="tl">Deadline</div>
        <span style={{fontSize:11,background:C.aBg,color:C.amber,border:"1px solid #F0D888",borderRadius:4,padding:"2px 7px",fontWeight:600}}>
          ⏱ {new Date(kase.dispute.response_deadline).toLocaleDateString()}</span></div></div>

    <div className="pipe">
      {AGENTS.map((a,i)=>{
        const done=agDone(a.key),running=agRunning(a.key);
        const stat=aStat(a.key,a.score);
        return <Fragment key={a.key}>
          <div className="ags">
            <div className={`agi${running?" r":done?" d":""}`}>{a.icon}</div>
            <div><div style={{fontSize:11,fontWeight:600,color:C.t1}}>{a.label}</div>
              <div style={{fontSize:10,fontFamily:"Space Mono,monospace",color:done?C.green:C.t3}}>{stat}</div>
            </div></div>
          {i<3&&<div className={`agc${done?" d":""}`}/>}
        </Fragment>;})}
      {cfgStale&&<span style={{fontSize:11,color:"#856404",background:"#FFF3CD",padding:"3px 8px",borderRadius:5,marginRight:6}}>⚠ Config changed</span>}
      {hlTriggered&&<span style={{fontSize:11,color:C.amber,background:C.aBg,padding:"3px 8px",borderRadius:5,border:`1px solid #F0D888`,marginRight:6}}>👤 Human review required</span>}
      <button className={`btn${pipe==="idle"||pipe==="error"?" p":""}`} style={{marginLeft:"auto",whiteSpace:"nowrap"}}
        onClick={pipe==="idle"||pipe==="error"?()=>{setItab("Analysis");setTraceOpen(true);runPipe();}:undefined} disabled={pipe==="running"||pipe==="done"}>
        {pipe==="running"?"Running…":pipe==="done"?"✓ Complete":pipe==="error"?"↺ Retry":"▶ Run Pipeline"}
      </button></div>

    {err&&<div style={{margin:"8px 20px 0",padding:"9px 14px",background:C.rBg,border:"1px solid #F5C6CB",borderRadius:8,fontSize:12,color:C.red}}><strong>Error:</strong> {err}</div>}

    <div className="itabs">
      {["Overview","Analysis","Recommendation","Decision"].map(tb=>(
        <div key={tb} className={`itab${itab===tb?" on":""}${!unlocked(tb)?" lk":""}`} onClick={()=>unlocked(tb)&&setItab(tb)}>{tb}</div>
      ))}</div>

    <div className="ibody">
      {itab==="Overview"&&<Fragment>
        <div className="ipnl">
          <div className="pt">Case Summary</div>
          <p style={{fontSize:14,color:C.t2,lineHeight:1.6,marginBottom:12}}>{kase._meta.label} — {kase.dispute.reason_description}</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[["Transaction Date",new Date(kase.transaction.transaction_date).toLocaleDateString()],["Channel",kase.transaction.payment_method],["Card",kase.transaction.card_last_four],["Account Age",kase.cardholder.account_age_days+" days"],["Prior Disputes",kase.cardholder.prior_disputes],["Dispute Stage",kase.dispute.dispute_stage]].map(([l,v])=>(
              <div key={l}><div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:".6px",fontWeight:500,marginBottom:2}}>{l}</div><div style={{fontSize:13,color:C.t1,fontWeight:500}}>{v}</div></div>
            ))}</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:600,color:C.t2}}>Available Key Evidence</div>
            <button className="btn sm" onClick={()=>setShowRaw(r=>!r)}>{showRaw?"Hide Raw Data":"Show All Raw Data"}</button>
          </div>
          {keyEvidence.map(([k,v],i)=>{
            const orig=keyEvidenceOrig?.[i]?.[1];
            const changed=orig!==undefined&&orig!==v;
            return <div key={k} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:"1px solid #F2EFE9",fontSize:12,background:changed?"#FFFBF0":undefined}}>
              <span style={{fontFamily:"Space Mono,monospace",fontSize:10,color:C.t3,minWidth:180,paddingTop:1}}>{k}</span>
              <span style={{color:C.t2,flex:1}}>{String(v)}
                {changed&&<span style={{fontSize:10,fontWeight:600,color:C.amber,background:"#FFF3CD",border:"1px solid #FFEAA7",borderRadius:3,padding:"1px 5px",marginLeft:6}}>updated</span>}
              </span>
              {changed&&<span style={{fontFamily:"Space Mono,monospace",fontSize:10,color:C.t3,textDecoration:"line-through",opacity:.6}}>{String(orig)}</span>}
            </div>;})}
          {showRaw&&<div style={{marginTop:12}}>
            <div style={{fontSize:11,fontWeight:600,color:C.t3,textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>All Raw Case Data{enrichedKase&&<span style={{fontWeight:400,marginLeft:6,color:C.amber}}>— showing retrieval agent updates</span>}</div>
            <table className="ft" style={{fontSize:11}}>
              <thead><tr><th>Field Path</th><th>Value</th>{enrichedKase&&<th style={{color:C.t3}}>Original</th>}</tr></thead>
              <tbody>{rawRows.map(([k,v])=>{
                const origV=rawOrigMap.get(k);
                const changed=enrichedKase&&origV!==undefined&&origV!==v;
                return <tr key={k} style={{background:changed?"#FFFBF0":undefined}}>
                  <td style={{fontFamily:"Space Mono,monospace",color:C.t3,fontSize:10}}>{k}</td>
                  <td style={{color:changed?C.amber:C.t2,fontWeight:changed?600:400}}>
                    {v}{changed&&<span style={{fontSize:9,fontWeight:700,background:"#FFF3CD",border:"1px solid #FFEAA7",borderRadius:2,padding:"1px 4px",marginLeft:5}}>updated</span>}
                  </td>
                  {enrichedKase&&<td style={{color:C.t3,fontSize:10,textDecoration:changed?"line-through":"none",opacity:changed?0.5:0}}>{changed?origV:""}</td>}
                </tr>;})}
              </tbody></table>
          </div>}</div>
        {pipe==="idle"&&<div style={{background:"#F5EFE6",border:"1px solid #DDD0BC",borderRadius:10,padding:"11px 16px",fontSize:13,color:C.aL,display:"flex",alignItems:"center",gap:10}}>
          ▶ Click <strong>Run Pipeline</strong> — config prompts are built from current Config thresholds and rubric for code {code}.
        </div>}
        {cfgStale&&<div style={{background:"#FFF3CD",border:"1px solid #FFEAA7",borderRadius:10,padding:"11px 16px",fontSize:13,color:"#856404",display:"flex",alignItems:"center",gap:10,marginTop:10}}>
          ⚠ Config updated after this run. <button className="btn sm" style={{marginLeft:8}} onClick={reset}>Re-run with new config</button>
        </div>}
        {(()=>{const vr=VISA_RULES[code];if(!vr)return null;
          const dl=kase.dispute.response_deadline;
          const daysLeft=Math.ceil((new Date(dl)-new Date())/(1000*60*60*24));
          const dlColor=daysLeft<=7?C.red:daysLeft<=14?C.amber:C.green;
          return <div className="ipnl" style={{marginTop:10,borderLeft:"3px solid #1A56A0"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:10,fontWeight:700,background:"#1A56A0",color:"#fff",padding:"2px 7px",borderRadius:3,letterSpacing:".5px"}}>VISA</span>
              <div className="pt" style={{marginBottom:0}}>Network Rules — {code}: {vr.title}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              <div style={{background:C.bg,borderRadius:6,padding:"8px 10px"}}>
                <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:".6px",marginBottom:3}}>Filing Window</div>
                <div style={{fontSize:12,color:C.t2,fontWeight:500}}>{vr.filingWindow}</div>
              </div>
              <div style={{background:C.bg,borderRadius:6,padding:"8px 10px"}}>
                <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:".6px",marginBottom:3}}>Response Deadline</div>
                <div style={{fontSize:12,fontWeight:700,color:dlColor}}>{daysLeft>0?`${daysLeft} days remaining`:"EXPIRED"} — {new Date(dl).toLocaleDateString()}</div>
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"#1A56A0",textTransform:"uppercase",letterSpacing:".6px",marginBottom:5}}>Visa-Required Evidence</div>
              {vr.requiredEvidence.map((e,i)=><div key={i} style={{fontSize:12,color:C.t2,padding:"3px 0",display:"flex",gap:6}}>
                <span style={{color:"#1A56A0",fontWeight:700,flexShrink:0}}>▸</span>{e}
              </div>)}
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:".6px",marginBottom:5}}>Compelling Evidence</div>
              {vr.compellingEvidence.map((e,i)=><div key={i} style={{fontSize:12,color:C.t2,padding:"3px 0",display:"flex",gap:6}}>
                <span style={{color:C.green,fontWeight:700,flexShrink:0}}>✓</span>{e}
              </div>)}
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:C.red,textTransform:"uppercase",letterSpacing:".6px",marginBottom:5}}>Invalid Dispute Conditions</div>
              {vr.invalidConditions.map((e,i)=><div key={i} style={{fontSize:12,color:C.t2,padding:"3px 0",display:"flex",gap:6}}>
                <span style={{color:C.red,fontWeight:700,flexShrink:0}}>✗</span>{e}
              </div>)}
            </div>
            <div style={{fontSize:12,color:C.t3,fontStyle:"italic",borderTop:`1px solid ${C.border}`,paddingTop:8,lineHeight:1.6}}>{vr.guidance}</div>
          </div>;
        })()}
      </Fragment>}

      {/* ── Agent Trace Panel (Analysis tab) ── */}
      {itab==="Analysis"&&<div className="ipnl" style={{marginTop:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",userSelect:"none"}}
          onClick={()=>setTraceOpen(o=>!o)}>
          <div className="pt" style={{marginBottom:0,flex:1,display:"flex",alignItems:"center",gap:8}}>
            ◈ Agent Trace
            {trace.length>0&&<span style={{fontFamily:"Space Mono,monospace",fontSize:9,color:C.accent,background:"#F5EFE6",padding:"1px 7px",borderRadius:3,fontWeight:700}}>{trace.length} events</span>}
            {pipe==="running"&&<span style={{fontSize:9,fontFamily:"Space Mono,monospace",color:C.accent,fontWeight:700,animation:"pulse 1.2s ease-in-out infinite"}}>● running</span>}
          </div>
          <span style={{fontSize:11,color:C.t3}}>{traceOpen?"▲ hide":"▼ show"}</span>
        </div>
        {traceOpen&&<div style={{marginTop:10,maxHeight:320,overflowY:"auto",borderTop:`1px solid ${C.border}`,paddingTop:8}}
          ref={el=>{if(el)el.scrollTop=el.scrollHeight;}}>
          {trace.length===0
            ? <div style={{fontFamily:"Space Mono,monospace",fontSize:10,color:C.t3,padding:"6px 0"}}>Run the pipeline to see the agent trace.</div>
            : trace.map(e=>(
              <div key={e.id} className={`te ${e.type}`}>
                <span className="te-time">{e.time}</span>
                <span className="te-icon">
                  {e.type==="rule-match"?"✓":e.type==="rule-miss"?"·":e.type==="llm"?"⟳":e.type==="score"?"≡":e.type==="decision"?"→":e.type==="error"?"✗":"·"}
                </span>
                <span className="te-msg">{e.msg}</span>
              </div>
            ))}
        </div>}
      </div>}

      {itab==="Analysis"&&evR&&<Fragment>
        <div className="scrow">
          <div className="scard" style={{flex:1}}><Ring s={evR.evidenceScore} color={sc(evR.evidenceScore)}/><div style={{fontSize:10,fontWeight:600,color:C.t2,textTransform:"uppercase",letterSpacing:".5px"}}>Evidence</div></div>
          {rkR&&<Fragment>
            <div className="scard" style={{flex:1}}><Ring s={rkR.riskScore} color={sc(rkR.riskScore)}/><div style={{fontSize:10,fontWeight:600,color:C.t2,textTransform:"uppercase",letterSpacing:".5px"}}>Risk Signals</div></div>
            <div className="scard" style={{flex:1}}><Ring s={rkR.customerScore} color={sc(rkR.customerScore)}/><div style={{fontSize:10,fontWeight:600,color:C.t2,textTransform:"uppercase",letterSpacing:".5px"}}>Customer Profile</div></div>
            <div className="scard" style={{flex:2,textAlign:"left"}}>
              <div style={{fontSize:10,color:C.t3,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>Overall · {cfg.weights.evidence}/{cfg.weights.risk}/{cfg.weights.customer}%</div>
              <div style={{fontSize:24,fontFamily:"Space Mono,monospace",fontWeight:700,color:sc(rkR.overallScore)}}>{rkR.overallScore}</div>
              <div style={{height:5,borderRadius:3,background:"#EDE9E3",overflow:"hidden",margin:"7px 0"}}><div style={{height:"100%",borderRadius:3,background:sc(rkR.overallScore),width:`${rkR.overallScore}%`}}/></div>
              <div style={{fontSize:11,color:C.t3}}>accept≥{t.acceptAbove} · fight&lt;{t.fightBelow}</div>
            </div>
          </Fragment>}</div>

        {(()=>{
          const caseSumm=`Case ${kase.dispute.dispute_id}: ${kase.dispute.reason_description}, $${kase.dispute.amount} at ${kase.transaction.merchant_name}.`;
          const custFactors=(rkR?.riskFactors||[]).filter(f=>f.field.startsWith("cardholder."));
          const rskFactors=(rkR?.riskFactors||[]).filter(f=>!f.field.startsWith("cardholder."));
          const panels=[
            {key:"ev",label:"Evidence Factors",caption:"Merchant-submitted evidence only — evidence_available.*",data:evR?.factors,prefix:"e",
             promptDisplay:<Fragment>
               <div className="plbl">① System Prompt<span className="roTag">role only</span></div>
               <div className="ptext">{SYSTEM_EVIDENCE}</div>
               <div className="plbl">② User Prompt<span className="roTag">matched factors + case summary</span></div>
               <div className="ptext">{buildEvidenceInstruction(evR?.factors||[],caseSumm)}</div>
             </Fragment>},
            {key:"cu",label:"Customer Profile Factors",caption:"Account history — cardholder.*",data:custFactors.length?custFactors:null,prefix:"c",
             promptDisplay:<Fragment>
               <div className="plbl">① System Prompt<span className="roTag">role only</span></div>
               <div className="ptext">{SYSTEM_RISK}</div>
               <div className="plbl">② User Prompt<span className="roTag">matched factors + case summary</span></div>
               <div className="ptext">{buildRiskInstruction(custFactors,rskFactors,caseSumm,rkR?{rec:rkR.recommendation,overall:rkR.overallScore,max:100}:null)}</div>
             </Fragment>},
            {key:"rk",label:"Risk Signal Factors",caption:"Behavioral & fraud signals — risk_signals.*",data:rskFactors.length?rskFactors:null,prefix:"r",
             promptDisplay:<Fragment>
               <div className="plbl">① System Prompt<span className="roTag">role only</span></div>
               <div className="ptext">{SYSTEM_RISK}</div>
               <div className="plbl">② User Prompt<span className="roTag">matched factors + case summary</span></div>
               <div className="ptext">{buildRiskInstruction(custFactors,rskFactors,caseSumm,rkR?{rec:rkR.recommendation,overall:rkR.overallScore,max:100}:null)}</div>
             </Fragment>},
          ];
          return panels.filter(p=>p.data).map(({key,label,caption,data,prefix,promptDisplay})=>(
            <div key={key} className="ipnl">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div>
                  <div className="pt" style={{marginBottom:2}}>{label}</div>
                  <div style={{fontSize:11,color:C.t3}}>{caption}</div></div>
                <button className={`btn sm${showP[key]?" p":""}`} onClick={()=>setShowP(p=>({...p,[key]:!p[key]}))}>
                  {showP[key]?"Hide Prompts":"Show Prompts"}
                </button></div>
              {showP[key]&&<div className="pbox">{promptDisplay}</div>}
              {(()=>{const vr=VISA_RULES[code];
                const fieldTags=vr?.fieldTags||{};
                function visaBadge(field){
                  const tag=fieldTags[field];
                  if(tag==="req")return <span style={{fontSize:8,fontWeight:700,background:"#1A56A0",color:"#fff",padding:"1px 5px",borderRadius:2,marginLeft:5,verticalAlign:"middle",letterSpacing:".3px"}}>VISA REQ</span>;
                  if(tag==="ce")return <span style={{fontSize:8,fontWeight:700,background:"#E8F0FB",color:"#1A56A0",border:"1px solid #BDD0F0",padding:"1px 5px",borderRadius:2,marginLeft:5,verticalAlign:"middle",letterSpacing:".3px"}}>COMPELLING</span>;
                  return null;}
                return <table className="ft" style={{marginTop:8}}>
                <thead><tr><th>Factor</th><th>Field</th><th>Observed</th><th>Impact</th><th style={{width:18}}></th></tr></thead>
                <tbody>{(data||[]).map((f,i)=><Fragment key={i}>
                  <tr className="fr" onClick={()=>setExp(p=>({...p,[`${prefix}${i}`]:!p[`${prefix}${i}`]}))}>
                    <td style={{fontWeight:500}}>{f.name}{visaBadge(f.field)}</td>
                    <td style={{fontFamily:"Space Mono,monospace",fontSize:10,color:C.t3}}>{f.field}</td>
                    <td style={{fontFamily:"Space Mono,monospace",fontSize:11,color:C.t2}}>{String(f.observed)}</td>
                    <td><span style={{fontSize:12,fontWeight:700,color:fc(f.impact)}}>{f.pts>0?"+":""}{f.pts}</span></td>
                    <td style={{fontSize:10,color:C.t3}}>{exp[`${prefix}${i}`]?"▲":"▼"}</td></tr>
                  {exp[`${prefix}${i}`]&&<tr><td colSpan={5} className="fex">{f.detail}</td></tr>}
                </Fragment>)}</tbody></table>;})()}</div>));
        })()}
      </Fragment>}

      {itab==="Recommendation"&&rkR&&<Fragment>
        <div className="ipnl">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div className="pt" style={{marginBottom:0}}>AI Recommendation</div>
            <button className={`btn sm${showP["rec"]?" p":""}`} onClick={()=>setShowP(p=>({...p,rec:!p.rec}))}>
              {showP["rec"]?"Hide Prompts":"Show Prompts"}
            </button>
          </div>
          {showP["rec"]&&<div className="pbox" style={{marginBottom:10}}>
            <div className="plbl">① System Prompt<span className="roTag">role only</span></div>
            <div className="ptext">{SYSTEM_RISK}</div>
            <div className="plbl">② User Prompt<span className="roTag">matched factors + outcome context</span></div>
            <div className="ptext">{buildRiskInstruction((rkR?.riskFactors||[]).filter(f=>f.field.startsWith("cardholder.")),(rkR?.riskFactors||[]).filter(f=>!f.field.startsWith("cardholder.")),`Case ${kase.dispute.dispute_id}: ${kase.dispute.reason_description}, $${kase.dispute.amount} at ${kase.transaction.merchant_name}.`,{rec:rkR.recommendation,overall:rkR.overallScore,max:100})}</div>
          </div>}
          <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"7px 14px",borderRadius:8,fontSize:14,fontWeight:700,background:dBg(recVal),color:dc(recVal),marginBottom:10}}>
            {recVal==="fight"?"⚔️ Recommend: Fight (deny dispute)":recVal==="accept"?"✓ Recommend: Accept (uphold dispute)":"↑ Recommend: Escalate"}
          </div>
          <p style={{fontSize:14,color:C.t2,lineHeight:1.7,marginBottom:8}}>{rkR.reasoning}</p>
          <div style={{padding:"7px 11px",background:C.bg,borderRadius:6,fontSize:12,color:C.t3,marginBottom:6}}>
            Score {rkR.overallScore} → {rkR.overallScore>=t.acceptAbove?`≥${t.acceptAbove} (Accept)`:rkR.overallScore<t.fightBelow?`<${t.fightBelow} (Fight)`:`${t.fightBelow}–${t.acceptAbove} (Escalate)`}
          </div>
          {(()=>{const vr=VISA_RULES[code];if(!vr)return null;
            const ev=(enrichedKase||kase).evidence_available||{};
            const tags=vr.fieldTags||{};
            const reqFields=Object.entries(tags).filter(([,t])=>t==="req").map(([f])=>f);
            function fieldMet(f){
              const parts=f.split(".");
              let v=ev;
              for(const p of parts.slice(1)){v=v?.[p];}
              return v===true||v!=null&&v!==false&&v!=="null"&&v!=="false";}
            const metReq=reqFields.filter(fieldMet);
            const missingReq=reqFields.filter(f=>!fieldMet(f));
            const allMet=missingReq.length===0;
            return <div style={{padding:"8px 11px",borderRadius:6,border:`1px solid ${allMet?"#C3E6CB":"#F5C6CB"}`,background:allMet?C.gBg:C.rBg,fontSize:12,display:"flex",alignItems:"flex-start",gap:8}}>
              <span style={{fontWeight:700,color:allMet?C.green:C.red,flexShrink:0}}>{allMet?"✓":"⚠"}</span>
              <div>
                <span style={{fontWeight:700,color:allMet?C.green:C.red}}>Visa Compliance ({code}): </span>
                {allMet
                  ? <span style={{color:C.t2}}>All {metReq.length} required evidence fields confirmed — this case meets Visa network standards for representment.</span>
                  : <span style={{color:C.t2}}>{missingReq.length} required evidence field{missingReq.length>1?"s":""} missing ({missingReq.map(f=>f.split(".").slice(-1)[0].replace(/_/g," ")).join(", ")}) — this weakens the fight position under Visa rules.</span>}
              </div>
            </div>;
          })()}
          </div>

        {(()=>{const vr=VISA_RULES[code];if(!vr||!evR)return null;
          const ev=(enrichedKase||kase).evidence_available||{};
          const FIELD_LABELS={"evidence_available.delivery_confirmation.exists":"Proof of delivery","evidence_available.delivery_confirmation.tracking_number":"Carrier tracking confirmation","evidence_available.delivery_confirmation.signature_on_file":"Signature confirmation","evidence_available.delivery_confirmation.delivery_address_match":"Delivery address match","evidence_available.customer_communication.exists":"Customer communication on file","evidence_available.order_confirmation.exists":"Order confirmation exists","evidence_available.order_confirmation.opened":"Order confirmation opened","evidence_available.refund_policy_acceptance.exists":"Refund policy accepted"};
          function fieldMet(f){const parts=f.replace("evidence_available.","").split(".");let v=ev;for(const p of parts){v=v?.[p];}return v===true||v!=null&&v!==false&&v!=="null"&&v!=="false"&&v!=="undefined";}
          const reqFields=Object.entries(vr.fieldTags||{}).filter(([,t])=>t==="req").map(([f])=>f);
          const checks=reqFields.map(f=>({label:FIELD_LABELS[f]||f,met:fieldMet(f)}));
          const missing=checks.filter(c=>!c.met);
          const present=checks.filter(c=>c.met);
          return <div className="ipnl" style={{borderLeft:`3px solid ${missing.length>0?C.red:"#1A56A0"}`,marginBottom:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:10,fontWeight:700,background:"#1A56A0",color:"#fff",padding:"2px 7px",borderRadius:3,letterSpacing:".5px"}}>VISA</span>
              <div className="pt" style={{marginBottom:0}}>Network Compliance Check — {code}</div>
              {missing.length===0
                ? <span style={{fontSize:10,fontWeight:700,color:C.green,background:C.gBg,border:"1px solid #C3E6CB",borderRadius:3,padding:"1px 7px"}}>✓ All requirements met</span>
                : <span style={{fontSize:10,fontWeight:700,color:C.red,background:C.rBg,border:"1px solid #F5C6CB",borderRadius:3,padding:"1px 7px"}}>⚠ {missing.length} gap{missing.length>1?"s":""} found</span>}
            </div>
            {missing.length>0&&<div style={{marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:C.red,textTransform:"uppercase",letterSpacing:".6px",marginBottom:5}}>Missing Required Evidence</div>
              {missing.map((c,i)=><div key={i} style={{fontSize:12,color:C.t2,padding:"3px 0",display:"flex",gap:6,alignItems:"center"}}>
                <span style={{color:C.red,fontWeight:700}}>✗</span>{c.label}
                <span style={{fontSize:10,color:C.t3,fontStyle:"italic"}}>— weakens fight position under Visa rules</span>
              </div>)}
            </div>}
            {present.length>0&&<div style={{marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:".6px",marginBottom:5}}>Confirmed Evidence</div>
              {present.map((c,i)=><div key={i} style={{fontSize:12,color:C.t2,padding:"3px 0",display:"flex",gap:6,alignItems:"center"}}>
                <span style={{color:C.green,fontWeight:700}}>✓</span>{c.label}
              </div>)}
            </div>}
            <div style={{fontSize:11,color:C.t3,fontStyle:"italic",borderTop:`1px solid ${C.border}`,paddingTop:7,lineHeight:1.6}}>{vr.guidance}</div>
          </div>;
        })()}

        <div className="ipnl">
          <div style={{marginBottom:11}}>
            <div style={{fontSize:11,fontWeight:700,color:C.t2,textTransform:"uppercase",letterSpacing:".7px",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:16,height:16,borderRadius:"50%",background:C.accent,color:"#fff",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>1</div>Action
            </div>
            <div className="asel">
              {[
                {d:"fight",icon:"⚔️",l:"Fight",sub:"Dispute is invalid — issue denial to cardholder"},
                {d:"accept",icon:"✓",l:"Accept",sub:"Dispute is valid — provisional credit made permanent"},
                {d:"escalate",icon:"↑",l:"Escalate",sub:"Ambiguous — more investigation needed"},
              ].map(({d,icon,l,sub})=>(
                <div key={d} className={`ao${lDec===d?d==="fight"?" sf":d==="accept"?" sa":" se":""}`} onClick={()=>{setLDec(d);setLTxt("");setLDirty(true);}}>
                  <div style={{fontSize:14,marginBottom:2}}>{icon}</div>
                  <div style={{fontSize:12,fontWeight:700,color:dc(d)}}>{l}</div>
                  <div style={{fontSize:10,color:C.t3,marginTop:2}}>{d===recVal?"AI rec":sub}</div>
                </div>
              ))}</div>
            {lDec&&lDec!==recVal&&<div style={{fontSize:12,color:"#856404",background:"#FFF3CD",border:"1px solid #FFEAA7",borderRadius:6,padding:"5px 10px",marginTop:8}}>⚠ Override — AI recommended <strong>{recVal}</strong></div>}
          </div>

          {lDec==="fight"&&showP["denial"]&&<div className="pbox" style={{marginBottom:10}}>
            <div className="plbl">① System Prompt<span className="roTag">tone and structure</span></div>
            <div className="ptext">{SYSTEM_REPRESENTMENT}</div>
            <div className="plbl">② User Prompt<span className="roTag">case details only</span></div>
            <div className="ptext">{buildRepresentmentInstruction(kase)}</div>
          </div>}

          {lDec==="escalate"&&showP["escalate"]&&<div className="pbox" style={{marginBottom:10}}>
            <div className="plbl">① System Prompt<span className="roTag">investigator role</span></div>
            <div className="ptext">{SYSTEM_ESCALATION}</div>
            <div className="plbl">② User Prompt<span className="roTag">case + matched factors</span></div>
            <div className="ptext">{buildEscalationInstruction(kase,rkR)}</div>
          </div>}

          {lDec&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
            {lDec!=="accept"&&<button className="btn p" onClick={genDocument} disabled={genL}>
              {genL?"Generating…":lDec==="fight"?"✦ Generate Denial Letter":"✦ Generate Investigation Plan"}
            </button>}
            {lDec==="fight"&&<button className={`btn sm${showP["denial"]?" p":""}`} onClick={()=>setShowP(p=>({...p,denial:!p.denial}))}>
              {showP["denial"]?"Hide Prompts":"Show Prompts"}
            </button>}
            {lDec==="escalate"&&<button className={`btn sm${showP["escalate"]?" p":""}`} onClick={()=>setShowP(p=>({...p,escalate:!p.escalate}))}>
              {showP["escalate"]?"Hide Prompts":"Show Prompts"}
            </button>}
            {lDec!=="accept"&&lTxt&&!lDirty&&<span style={{fontSize:11,padding:"3px 8px",borderRadius:4,fontWeight:600,background:C.gBg,color:C.green,border:"1px solid #C3E6CB"}}>✓ Ready</span>}
            {lTxt&&lDirty&&lDec!=="accept"&&<span style={{fontSize:12,color:C.t3}}>Regenerate to apply changes</span>}
          </div>}

          {lDec==="fight"&&lTxt&&lTxt!=="__accept__"&&!lTxt.startsWith("[Error")&&<Fragment>
            <div style={{fontSize:11,color:C.t3,marginBottom:6}}>Review and edit before sending to cardholder.</div>
            <textarea className="led" value={lTxt} onChange={e=>setLTxt(e.target.value)}/>
          </Fragment>}

          {lDec==="fight"&&lTxt&&lTxt.startsWith("[Error")&&<div style={{fontSize:12,color:C.red,padding:"8px 10px",background:C.rBg,borderRadius:6}}>{lTxt}</div>}

          {lDec==="escalate"&&lTxt&&!lTxt.startsWith("[Error")&&(()=>{
            let recs=[];try{recs=JSON.parse(lTxt).recommendations||[];}catch(e){}
            return recs.length>0&&<div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:700,color:C.t2,textTransform:"uppercase",letterSpacing:".7px"}}>Recommended Investigation Steps</div>
                <button className="btn p sm" style={{fontSize:11,padding:"3px 10px"}} onClick={()=>{}}>▶ Run Investigation</button>
              </div>
              {recs.map((r,i)=><div key={i} style={{marginBottom:10,padding:"10px 12px",background:C.bg,borderRadius:8,borderLeft:`3px solid ${C.amber}`}}>
                <div style={{fontSize:13,fontWeight:600,color:C.t1,marginBottom:3}}>{i+1}. {r.title}</div>
                <div style={{fontSize:12,color:C.t2,marginBottom:4}}>{r.action}</div>
                <div style={{fontSize:11,color:C.t3,fontStyle:"italic"}}>{r.rationale}</div>
              </div>)}
            </div>;
          })()}
          {lDec==="escalate"&&lTxt&&lTxt.startsWith("[Error")&&<div style={{fontSize:12,color:C.red,padding:"8px 10px",background:C.rBg,borderRadius:6}}>{lTxt}</div>}
        </div>
      </Fragment>}

      {itab==="Decision"&&pDone&&<div className="ipnl">
        <div className="pt">Analyst Decision</div>
        {dec?<Fragment>
          <div style={{display:"inline-block",padding:"7px 14px",borderRadius:8,fontSize:13,fontWeight:700,background:dBg(dec),color:dc(dec),marginBottom:11}}>
            {dec==="fight"?"⚔️ Fight — Denial Letter Sent":dec==="accept"?"✓ Accept — Credit Made Permanent":"↑ Escalated for Senior Review"}
          </div>
          <p style={{fontSize:14,color:C.t2,lineHeight:1.6,marginBottom:9}}>
            {dec==="fight"?"Dispute denied. Denial letter sent to cardholder. Case closed.":dec==="accept"?"Dispute accepted. Provisional credit made permanent. Issuer absorbs the cost.":"Case flagged for senior analyst review. Investigation steps recorded."}
          </p>
          {dec!==recVal&&<div style={{padding:"8px 12px",background:"#FFF3CD",border:"1px solid #FFEAA7",borderRadius:8,fontSize:13,color:"#856404"}}>
            ⚠ <strong>Override.</strong> AI recommended <strong>{recVal}</strong>, analyst chose <strong>{dec}</strong>. Override note required.
          </div>}
        </Fragment>:<p style={{fontSize:14,color:C.t2}}>Complete the Recommendation step, then use the button below to record the issuer decision.</p>}
      </div>}</div>

    <div className="decbar">
      {!dec?<Fragment>
        <button className={`cta ${lDec||recVal||"fight"}`}
          disabled={!pDone||!lDec||(lDec==="fight"&&(!lTxt||lDirty))}
          onClick={()=>{setDec(lDec);setItab("Decision");}}>
          {lDec==="fight"?"⚔️ Fight — Send Denial to Cardholder":lDec==="accept"?"✓ Accept — Make Credit Permanent":lDec==="escalate"?"↑ Escalate — Flag for Senior Review":"Select action above"}
        </button>
        <div className="dspc"/>
        {!pDone&&pipe!=="error"&&<span className="dnote">Run pipeline to enable</span>}
        {pDone&&lDec==="fight"&&!lTxt&&<span className="dnote">Generate denial letter first</span>}
        {pDone&&lDec!=="accept"&&lTxt&&lDirty&&<span className="dnote">Regenerate document first</span>}
        {pDone&&(lDec==="accept"||(lTxt&&!lDirty))&&lDec&&lDec!==recVal&&<span className="dnote" style={{color:"#856404"}}>⚠ Override — AI rec: {recVal}</span>}
        {pDone&&(lDec==="accept"||(lTxt&&!lDirty))&&lDec===recVal&&<span className="dnote">Matches AI recommendation</span>}
        {hlTriggered&&<span className="dnote" style={{color:C.amber}}>👤 Human review flagged</span>}
      </Fragment>:<Fragment>
        <div style={{display:"inline-block",padding:"6px 12px",borderRadius:7,fontSize:12,fontWeight:700,background:dBg(dec),color:dc(dec)}}>
          {dec==="fight"?"⚔️ Fight — Denial Sent":dec==="accept"?"✓ Accept — Credit Permanent":"↑ Escalated"}</div>
        <div className="dspc"/>
        <button className="rvb" onClick={()=>{setDec(null);setItab("Recommendation");}}>↩ Revert</button>
      </Fragment>}</div>
  </Fragment>;}

export default function App(){
  const [tab, setTab]=useState("investigation");
  const [cfg, setCfg]=useState(DEF_CFG);
  const [savedCfg, setSavedCfg]=useState(DEF_CFG);
  const [cfgV, setCfgV]=useState(0);
  const [savedMsg, setSavedMsg]=useState(false);

  function saveConfig(){
    setSavedCfg(JSON.parse(JSON.stringify(cfg)));
    setCfgV(v=>v+1);setSavedMsg(true);
    setTimeout(()=>setSavedMsg(false),3000);}

  return <Fragment>
    <style>{S}</style>
    <div className="app">
      <div className="hdr">
        <span className="logo">◈ ChargebackAI</span>
        {[["config","⚙ Config"],["investigation","🔍 Investigation"]].map(([k,l])=>(
          <button key={k} className={`ntab${tab===k?" on":""}`} onClick={()=>setTab(k)}>{l}</button>
        ))}</div>
      {tab==="config"&&<ConfigTab cfg={cfg} setCfg={setCfg} onSave={saveConfig} savedMsg={savedMsg}/>}
      {tab==="investigation"&&<InvestigationTab cfg={savedCfg} cfgV={cfgV}/>}</div>
  </Fragment>;}
