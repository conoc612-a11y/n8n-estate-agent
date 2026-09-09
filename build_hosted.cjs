// hosted-native rebuild: HTTP Request nodes + credentials, Code nodes pure compute.
// No require(), no $env, no $helpers. Loop via SplitInBatches v3 loop-back.
const fs = require('fs');
const crypto = require('crypto');
const CRED = JSON.parse(fs.readFileSync('hosted_cred_ids.json', 'utf8'));
const PUB = 'https://n8n.vibemakers.kr';
const SB_HOST = 'https://bhgijvaxxjnocgfnaaeu.supabase.co';
const RTMS = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
const uuid = () => crypto.randomUUID();
let PX = 0;
const pos = (x, y) => [x, y];
function codeNode(id, name, jsCode, x, y) {
  return { id, name, parameters: { jsCode, mode: 'runOnceForAllItems' }, position: pos(x, y), type: 'n8n-nodes-base.code', typeVersion: 2 };
}
function httpNode(id, name, params, credType, credId, credName, x, y, retry) {
  const n = { id, name, parameters: params, position: pos(x, y), type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2 };
  if (credType) n.credentials = { [credType]: { id: credId, name: credName } };
  if (retry) { n.retryOnFail = true; n.maxTries = 3; n.waitBetweenTries = 2000; }
  return n;
}
function ifNode(id, name, left, right, op, x, y) {
  return {
    id, name, position: pos(x, y), type: 'n8n-nodes-base.if', typeVersion: 2.2,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: uuid(), leftValue: left, rightValue: right, operator: { type: op.t, operation: op.o, name: op.o } }],
        combinator: 'and'
      },
      options: {}
    }
  };
}
const Q = (arr) => ({ parameters: arr.map(([name, value]) => ({ name, value })) });

// ================= WF1H =================
const N = {};
N.webhookIn = { id: 'a1b2c3d4-0001-4000-8000-000000000001', name: 'WebhookIn', parameters: { httpMethod: 'POST', options: {}, path: 'estate-report', responseMode: 'responseNode' }, position: pos(180, 300), type: 'n8n-nodes-base.webhook', typeVersion: 2 };
N.sched = { id: 'a1b2c3d4-0002-4000-8000-000000000002', name: 'ScheduleWeekly', parameters: { rule: { interval: [{ field: 'weeks', triggerAtDay: [1], triggerAtHour: 9, weeksInterval: 1 }] } }, position: pos(180, 480), type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2 };
N.normalize = codeNode('a1b2c3d4-0003-4000-8000-000000000003', 'Normalize', `// Webhook body or schedule default -> {lawd_cd, deal_ymd, apt, memo, prompt_version}
const b = ($input.first().json.body) || $input.first().json || {};
const now = new Date();
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const ymd = String(prev.getFullYear()) + String(prev.getMonth() + 1).padStart(2, '0');
return [{ json: {
  lawd_cd: String(b.lawd_cd || '11680'),
  deal_ymd: String(b.deal_ymd || ymd),
  apt: b.apt ? String(b.apt) : '',
  memo: b.memo ? String(b.memo) : '',
  prompt_version: b.prompt_version === 'v2' ? 'v2' : 'v1',
  scenario: b.scenario ? String(b.scenario) : ''
}}];`, 400, 360);
N.fetchRtms = httpNode(uuid(), 'FetchRTMS', {
  method: 'GET', url: RTMS, authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
  sendQuery: true, queryParameters: Q([['LAWD_CD', '={{ $json.lawd_cd }}'], ['DEAL_YMD', '={{ $json.deal_ymd }}'], ['numOfRows', '=100'], ['pageNo', '=1']]),
  options: { timeout: 25000, response: { response: { responseFormat: 'text', fullResponse: true, neverError: true } } }
}, 'httpQueryAuth', CRED.idDGK, 'DGK serviceKey query', 620, 360, true);
N.parseStats = codeNode(uuid(), 'ParseStats', `// pure: RTMS XML text -> rows -> stats (00/000 success, else empty-hand fallback)
function pick(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '>([\\\\s\\\\S]*?)</' + tag + '>'));
  return m ? m[1].trim() : '';
}
const fr = $('FetchRTMS').first().json;
const p = $('Normalize').first().json;
const xml = fr.body || '';
let rows = [], total = 0, fetchError = '';
if (fr.statusCode !== 200) {
  fetchError = 'HTTP' + fr.statusCode + ' ' + String(xml).slice(0, 120);
} else if (!['00', '000'].includes(pick(xml, 'resultCode'))) {
  fetchError = 'resultCode=' + pick(xml, 'resultCode');
} else {
  const items = [];
  for (const b of xml.split('<item>').slice(1)) {
    const body = b.split('</item>')[0];
    items.push({
      apt: pick(body, 'aptNm'), dong: pick(body, 'umdNm'),
      area: parseFloat(pick(body, 'excluUseAr')) || 0,
      price: parseInt(String(pick(body, 'dealAmount')).replace(/[^0-9]/g, ''), 10) || 0,
      date: pick(body, 'dealYear') + '.' + pick(body, 'dealMonth') + '.' + pick(body, 'dealDay'),
      floor: pick(body, 'floor')
    });
  }
  total = parseInt(pick(xml, 'totalCount'), 10) || items.length;
  rows = p.apt ? items.filter(x => (x.apt || '').includes(p.apt)) : items;
}
const prices = rows.map(x => x.price).filter(x => x > 0).sort((a, b) => a - b);
const sum = prices.reduce((a, b) => a + b, 0);
const stats = {
  count: rows.length, total,
  avg: prices.length ? Math.round(sum / prices.length) : 0,
  median: prices.length ? prices[Math.floor(prices.length / 2)] : 0,
  min: prices.length ? prices[0] : 0, max: prices.length ? prices[prices.length - 1] : 0,
  fetchError
};
return [{ json: { ...p, rows: rows.slice(0, 60), stats } }];`, 840, 360);
N.buildBrief = codeNode(uuid(), 'BuildBrief', `// pure: agent state init (max 8 iterations, usage/cost tracked, trace saved)
const p = $input.first().json;
const SYS_V1 = '너는 한국 아파트 실거래 브리핑 작성자다. 주어진 통계와 표본을 읽고 거래동향을 한 단락으로 요약하라. 숫자를 지어내지 마라. 전망이나 추천을 덧붙이지 마라. 표본이 0건이면 자료 없음이라 쓰고 끝내라.';
const SYS_V2 = '너는 한국 아파트 실거래 브리핑 작성자다. 순서대로 쓴다. (1) 핵심 한 줄: 평균가·중앙값·거래건수. (2) 표본 0건이면 자료 없음이라 쓰고 가능한 원인 한 줄. (3) 5건 이상이면 급등·급매 주목 매물을 각 한 줄. 숫자는 주어진 것만 쓰고 과장 표현 금지.';
const brief = '지역=' + p.lawd_cd + ' 연월=' + p.deal_ymd + (p.apt ? ' 단지=' + p.apt : '')
  + '\\n[통계] ' + JSON.stringify(p.stats)
  + '\\n[표본상위5] ' + JSON.stringify((p.rows || []).slice(0, 5))
  + (p.memo ? '\\n[메모] ' + p.memo : '');
return [{ json: { ...p, sys: p.prompt_version === 'v2' ? SYS_V2 : SYS_V1, brief, t0: Date.now(), iter: 0, trace: [], useP: 0, useC: 0, lastObs: '', action: '', actionArg: null, draft: '', done: false } }];`, 1060, 360);
N.split = { id: uuid(), name: 'LoopIter', parameters: { batchSize: 1, options: {} }, position: pos(1280, 360), type: 'n8n-nodes-base.splitInBatches', typeVersion: 3 };
N.chatBody = codeNode(uuid(), 'ChatBody', `// pure: build chat prompt for this iteration
const s = $input.first().json;
const ask = s.iter === 0
  ? s.brief + '\\n\\n위 자료로 브리핑 초안을 써라. 전월 비교가 필요하면 TOOL:fetch_month:LAWD,YYYYMM 로 조회하고, 과거 리포트가 필요하면 TOOL:recall_reports 로 조회하라. 도구가 필요 없으면 바로 초안을 써라.'
  : '관찰: ' + s.lastObs + '\\n위 결과를 반영해 다음 행동을 정하라. 초안이 완성됐으면 초안만 출력하고 TOOL을 부르지 마라.';
return [{ json: { ...s, chatBody: { model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 600, messages: [{ role: 'system', content: s.sys }, { role: 'user', content: ask }] } } }];`, 1280, 560);
N.chat = httpNode(uuid(), 'Chat', {
  method: 'POST', url: 'https://api.openai.com/v1/chat/completions', authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.chatBody }}',
  options: { timeout: 60000 }
}, 'httpBearerAuth', CRED.idOAI, 'OPENAI bearer', 1500, 560, true);
N.parseReply = codeNode(uuid(), 'ParseReply', `// pure: model reply -> action(fetch_month|recall_reports|finish), usage totals
const out = $input.first().json;
const s = $('ChatBody').first().json;
if (!out.choices || !out.choices[0]) throw new Error('openai bad response ' + JSON.stringify(out).slice(0, 200));
const text = out.choices[0].message.content;
const u = out.usage || {};
const useP = s.useP + (u.prompt_tokens || 0), useC = s.useC + (u.completion_tokens || 0);
const line = (text || '').trim().split('\\n')[0] || '';
let action = 'finish', actionArg = null, draft = '';
const m1 = line.match(/^TOOL:fetch_month:(\\S+)/);
const m2 = /^TOOL:recall_reports/.test(line);
if (m1) {
  const parts = (m1[1] || '').split(',');
  action = 'fetch_month';
  actionArg = { lawd: parts[0] || s.lawd_cd, ymd: parts[1] || s.deal_ymd };
} else if (m2) {
  action = 'recall_reports';
  actionArg = { lawd: s.lawd_cd };
} else {
  draft = text;
}
const trace = s.trace.concat([{ i: s.iter, tool: action === 'finish' ? 'finish' : action }]);
let done = action === 'finish' || s.iter >= 7;
if (done && !draft) draft = '(초안 생성 실패 — 통계만 전달)';
return [{ json: { ...s, useP, useC, action, actionArg, draft, trace, done, lastObs: '' } }];`, 1720, 560);
N.ifFinish = ifNode(uuid(), 'IF_Finish', '={{ $json.done }}', true, { t: 'boolean', o: 'equals' }, 1940, 560);
N.ifTool = ifNode(uuid(), 'IF_IsFetch', "={{ $json.action === 'fetch_month' }}", true, { t: 'boolean', o: 'equals' }, 1940, 760);
N.fetchMonth = httpNode(uuid(), 'FetchMonth', {
  method: 'GET', url: RTMS, authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
  sendQuery: true, queryParameters: Q([['LAWD_CD', '={{ $json.actionArg.lawd }}'], ['DEAL_YMD', '={{ $json.actionArg.ymd }}'], ['numOfRows', '=30'], ['pageNo', '=1']]),
  options: { timeout: 25000, response: { response: { responseFormat: 'text', fullResponse: true, neverError: true } } }
}, 'httpQueryAuth', CRED.idDGK, 'DGK serviceKey query', 2160, 700, true);
N.recall = httpNode(uuid(), 'RecallReports', {
  method: 'GET', url: `={{ "${SB_HOST}/rest/v1/agent_reports?region=like." + $json.actionArg.lawd + "/*&status=eq.approved&order=created_at.desc&limit=2&select=region,final,created_at" }}`,
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  options: { timeout: 15000 }
}, 'httpHeaderAuth', CRED.idSB, 'Supabase apikey header', 2160, 880, true);
N.noteFetch = codeNode(uuid(), 'NoteFetch', `// pure: month-tool observation -> state(iter+1)
function pick(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '>([\\\\s\\\\S]*?)</' + tag + '>'));
  return m ? m[1].trim() : '';
}
const fr = $input.first().json;
const s = $('ParseReply').first().json;
const xml = fr.body || '';
const obs = 'resultCode=' + pick(xml, 'resultCode') + ', items~' + (xml.split('<item>').length - 1);
const trace = s.trace.slice(0, -1).concat([{ i: s.iter, tool: 'fetch_month', obs: String(obs).slice(0, 200) }]);
return [{ json: { ...s, iter: s.iter + 1, trace, lastObs: obs } }];`, 2380, 700);
N.noteRecall = codeNode(uuid(), 'NoteRecall', `// pure: recall-tool observation -> state(iter+1)
const raw = $input.first().json;
const s = $('ParseReply').first().json;
const arr = Array.isArray(raw) ? raw : (raw && raw.data && Array.isArray(raw.data) ? raw.data : []);
const obs = !arr.length ? '승인된 과거 리포트 없음'
  : arr.map(x => '[' + x.created_at + '] ' + String(x.final || '').slice(0, 300)).join('\\n---\\n');
const trace = s.trace.slice(0, -1).concat([{ i: s.iter, tool: 'recall_reports', obs: String(obs).slice(0, 200) }]);
return [{ json: { ...s, iter: s.iter + 1, trace, lastObs: obs } }];`, 2380, 880);
N.finalize = codeNode(uuid(), 'Finalize', `// pure: save payload (stats+rows+trace)
const s = $input.first().json;
return [{ json: { ...s, saveBody: {
  region: s.lawd_cd + '/' + s.deal_ymd + (s.apt ? '/' + s.apt : ''),
  payload: { stats: s.stats, rows: (s.rows || []).slice(0, 20), trace: s.trace || [] },
  draft: s.draft, status: 'pending'
} } }];`, 2160, 560);
N.saveReport = httpNode(uuid(), 'SaveReport', {
  method: 'POST', url: SB_HOST + '/rest/v1/agent_reports', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, specifyHeaders: 'json', jsonHeaders: '={"Prefer": "return=representation"}',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.saveBody }}',
  options: { timeout: 15000 }
}, 'httpHeaderAuth', CRED.idSB, 'Supabase apikey header', 2380, 560, false);
N.saveRun = codeNode(uuid(), 'SaveRun', `// pure: run metrics + approval links (PUBLIC_BASE hardwired for hosted)
const rep = $input.first().json;
const s = $('Finalize').first().json;
const rid = Array.isArray(rep) ? rep[0].id : rep.id;
const ms = Date.now() - s.t0;
const costKrw = Math.round(((s.useP * 0.15 + s.useC * 0.6) / 1e6) * 1400 * 100) / 100;
const base = '${PUB}/webhook/estate-approve?token=' + rid;
return [{ json: {
  ...s, rid, ms, costKrw,
  runBody: { scenario: s.scenario || 'manual', ms, prompt_tokens: s.useP, completion_tokens: s.useC, cost_krw: costKrw, status: 'pending_approval', note: 'prompt=' + s.prompt_version + ' report=' + rid },
  approve_url: base + '&decision=approve', reject_url: base + '&decision=reject'
} }];`, 2600, 560);
N.postRun = httpNode(uuid(), 'PostRun', {
  method: 'POST', url: SB_HOST + '/rest/v1/agent_runs', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, specifyHeaders: 'json', jsonHeaders: '={"Prefer": "return=representation"}',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.runBody }}',
  options: { timeout: 15000 }
}, 'httpHeaderAuth', CRED.idSB, 'Supabase apikey header', 2820, 560, false);
N.buildResp = codeNode(uuid(), 'BuildResp', `// pure: webhook response
const s = $('SaveRun').first().json;
return [{ json: {
  status: 'pending_approval', report_id: s.rid,
  approve_url: s.approve_url, reject_url: s.reject_url,
  draft_preview: String(s.draft).slice(0, 300),
  usage: { prompt_tokens: s.useP, completion_tokens: s.useC }, ms: s.ms, costKrw: s.costKrw
} }];`, 3040, 560);
N.respond = { id: 'a1b2c3d4-0008-4000-8000-000000000008', name: 'RespondPending', parameters: { options: {}, respondWith: 'json', responseBody: '={{$json}}' }, position: pos(3260, 560), type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1 };

const C1 = {};
C1['WebhookIn'] = { main: [[{ index: 0, node: 'Normalize', type: 'main' }]] };
C1['ScheduleWeekly'] = { main: [[{ index: 0, node: 'Normalize', type: 'main' }]] };
C1['Normalize'] = { main: [[{ index: 0, node: 'FetchRTMS', type: 'main' }]] };
C1['FetchRTMS'] = { main: [[{ index: 0, node: 'ParseStats', type: 'main' }]] };
C1['ParseStats'] = { main: [[{ index: 0, node: 'BuildBrief', type: 'main' }]] };
C1['BuildBrief'] = { main: [[{ index: 0, node: 'LoopIter', type: 'main' }]] };
C1['LoopIter'] = { main: [[], [{ index: 0, node: 'ChatBody', type: 'main' }]] };
C1['ChatBody'] = { main: [[{ index: 0, node: 'Chat', type: 'main' }]] };
C1['Chat'] = { main: [[{ index: 0, node: 'ParseReply', type: 'main' }]] };
C1['ParseReply'] = { main: [[{ index: 0, node: 'IF_Finish', type: 'main' }]] };
C1['IF_Finish'] = { main: [[{ index: 0, node: 'Finalize', type: 'main' }], [{ index: 0, node: 'IF_IsFetch', type: 'main' }]] };
C1['IF_IsFetch'] = { main: [[{ index: 0, node: 'FetchMonth', type: 'main' }], [{ index: 0, node: 'RecallReports', type: 'main' }]] };
C1['FetchMonth'] = { main: [[{ index: 0, node: 'NoteFetch', type: 'main' }]] };
C1['RecallReports'] = { main: [[{ index: 0, node: 'NoteRecall', type: 'main' }]] };
C1['NoteFetch'] = { main: [[{ index: 0, node: 'LoopIter', type: 'main' }]] };
C1['NoteRecall'] = { main: [[{ index: 0, node: 'LoopIter', type: 'main' }]] };
C1['Finalize'] = { main: [[{ index: 0, node: 'SaveReport', type: 'main' }]] };
C1['SaveReport'] = { main: [[{ index: 0, node: 'SaveRun', type: 'main' }]] };
C1['SaveRun'] = { main: [[{ index: 0, node: 'PostRun', type: 'main' }]] };
C1['PostRun'] = { main: [[{ index: 0, node: 'BuildResp', type: 'main' }]] };
C1['BuildResp'] = { main: [[{ index: 0, node: 'RespondPending', type: 'main' }]] };
const WF1H = { name: 'estate-report', nodes: Object.values(N), connections: C1, settings: { executionOrder: 'v1' } };

// ================= WF2H =================
const M = {};
M.webhook = { id: 'b1c2d3e4-0001-4000-8000-000000000001', name: 'WebhookApprove', parameters: { httpMethod: 'GET', options: {}, path: 'estate-approve', responseMode: 'responseNode' }, position: pos(200, 300), type: 'n8n-nodes-base.webhook', typeVersion: 2 };
M.parseQ = codeNode(uuid(), 'ParseQuery', `// pure: ?token=<id>&decision=approve|reject&edit=&reason=
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br>');
}
const q = $input.first().json.query || {};
const rid = parseInt(q.token, 10);
const decision = String(q.decision || '');
const edit = String(q.edit || '').slice(0, 500);
const reason = String(q.reason || '').slice(0, 500);
if (!rid || (decision !== 'approve' && decision !== 'reject')) {
  return [{ json: { valid: false, html: '<html><head><meta charset="utf-8"></head><body><h2>잘못된 승인 링크</h2><p>token과 decision(approve|reject)이 필요합니다.</p></body></html>' } }];
}
return [{ json: { valid: true, rid, decision, edit, reason, esc: 0 } }];`, 420, 300);
M.ifValid = ifNode(uuid(), 'IF_Valid', '={{ $json.valid }}', true, { t: 'boolean', o: 'equals' }, 640, 300);
M.getRep = httpNode(uuid(), 'GetReport', {
  method: 'GET', url: `={{ "${SB_HOST}/rest/v1/agent_reports?id=eq." + $json.rid + "&select=id,draft,status" }}`,
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  options: { timeout: 15000 }
}, 'httpHeaderAuth', CRED.idSB, 'Supabase apikey header', 860, 240, true);
M.parseFound = codeNode(uuid(), 'ParseFound', `// pure: branch notfound|already|go-approve|go-reject
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br>');
}
const rows = $input.first().json;
const q = $('ParseQuery').first().json;
const rep = Array.isArray(rows) ? rows[0] : rows;
const wrap = (h) => '<html><head><meta charset="utf-8"></head><body>' + h + '</body></html>';
if (!rep) return [{ json: { ...q, outcome: 'terminal', html: wrap('<h2>리포트 없음</h2><p>id=' + q.rid + ' 없음.</p>') } }];
if (rep.status !== 'pending') return [{ json: { ...q, outcome: 'terminal', html: wrap('<h2>이미 처리됨</h2><p>상태=' + esc(rep.status) + '</p>') } }];
if (q.decision === 'approve') {
  const final = q.edit ? rep.draft + '\\n\\n[승인자 수정]\\n' + q.edit : rep.draft;
  return [{ json: { ...q, outcome: 'go-approve', final, html: wrap('<h2>확정됨</h2><p>' + esc(final) + '</p>') } }];
}
return [{ json: { ...q, outcome: 'go-reject', final: q.reason || '사유 없음', html: wrap('<h2>거절됨</h2><p>' + esc(q.reason || '사유 없음') + '</p>') } }];`, 1080, 240);
M.ifApprove = ifNode(uuid(), 'IF_Approve', "={{ $json.outcome === 'go-approve' }}", true, { t: 'boolean', o: 'equals' }, 1300, 240);
M.ifReject = ifNode(uuid(), 'IF_Reject', "={{ $json.outcome === 'go-reject' }}", true, { t: 'boolean', o: 'equals' }, 1300, 460);
function patchNode(nm, bodyExpr, x, y, retry) {
  return httpNode(uuid(), nm, {
    method: 'PATCH', url: `={{ "${SB_HOST}/rest/v1/agent_reports?id=eq." + $json.rid }}`,
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendHeaders: true, specifyHeaders: 'json', jsonHeaders: '={"Prefer": "return=representation"}',
    sendBody: true, specifyBody: 'json', jsonBody: bodyExpr,
    options: { timeout: 15000 }
  }, 'httpHeaderAuth', CRED.idSB, 'Supabase apikey header', x, y, retry);
}
M.doApprove = patchNode('DoApprove', '={{ ({status: "approved", final: $json.final}) }}', 1520, 180, true);
M.logApprove = httpNode(uuid(), 'LogApprove', {
  method: 'POST', url: SB_HOST + '/rest/v1/agent_runs', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, specifyHeaders: 'json', jsonHeaders: '={"Prefer": "return=representation"}',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ ({scenario: "approval", ms: 0, prompt_tokens: 0, completion_tokens: 0, cost_krw: 0, status: "approved", note: "report=" + $json.rid}) }}',
  options: { timeout: 15000 }
}, 'httpHeaderAuth', CRED.idSB, 'Supabase apikey header', 1740, 180, false);
M.doReject = patchNode('DoReject', '={{ ({status: "rejected", final: $json.final}) }}', 1520, 460, true);
M.logReject = httpNode(uuid(), 'LogReject', {
  method: 'POST', url: SB_HOST + '/rest/v1/agent_runs', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, specifyHeaders: 'json', jsonHeaders: '={"Prefer": "return=representation"}',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ ({scenario: "approval", ms: 0, prompt_tokens: 0, completion_tokens: 0, cost_krw: 0, status: "rejected", note: "report=" + $json.rid}) }}',
  options: { timeout: 15000 }
}, 'httpHeaderAuth', CRED.idSB, 'Supabase apikey header', 1740, 460, false);
M.respond = { id: 'b1c2d3e4-0003-4000-8000-000000000003', name: 'RespondFinal', parameters: { options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }] } }, respondWith: 'text', responseBody: '={{$json.html}}' }, position: pos(1960, 340), type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1 };
const C2 = {};
C2['WebhookApprove'] = { main: [[{ index: 0, node: 'ParseQuery', type: 'main' }]] };
C2['ParseQuery'] = { main: [[{ index: 0, node: 'IF_Valid', type: 'main' }]] };
C2['IF_Valid'] = { main: [[{ index: 0, node: 'GetReport', type: 'main' }], [{ index: 0, node: 'RespondFinal', type: 'main' }]] };
C2['GetReport'] = { main: [[{ index: 0, node: 'ParseFound', type: 'main' }]] };
C2['ParseFound'] = { main: [[{ index: 0, node: 'IF_Approve', type: 'main' }]] };
C2['IF_Approve'] = { main: [[{ index: 0, node: 'DoApprove', type: 'main' }], [{ index: 0, node: 'IF_Reject', type: 'main' }]] };
C2['DoApprove'] = { main: [[{ index: 0, node: 'LogApprove', type: 'main' }]] };
C2['LogApprove'] = { main: [[{ index: 0, node: 'RespondFinal', type: 'main' }]] };
C2['IF_Reject'] = { main: [[{ index: 0, node: 'DoReject', type: 'main' }], [{ index: 0, node: 'RespondFinal', type: 'main' }]] };
C2['DoReject'] = { main: [[{ index: 0, node: 'LogReject', type: 'main' }]] };
C2['LogReject'] = { main: [[{ index: 0, node: 'RespondFinal', type: 'main' }]] };
const WF2H = { name: 'estate-approve', nodes: Object.values(M), connections: C2, settings: { executionOrder: 'v1' } };

fs.writeFileSync('WF1H.hosted.json', JSON.stringify(WF1H, null, 2));
fs.writeFileSync('WF2H.hosted.json', JSON.stringify(WF2H, null, 2));
// sanity: every connection endpoint resolves
for (const [f, w] of [['WF1H', WF1H], ['WF2H', WF2H]]) {
  const names = new Set(w.nodes.map(n => n.name));
  for (const [from, outs] of Object.entries(w.connections)) {
    if (!names.has(from)) throw new Error(f + ' from miss ' + from);
    for (const arr of Object.values(outs).flat()) for (const e of (Array.isArray(arr) ? arr : [])) if (e && e.node && !names.has(e.node)) throw new Error(f + ' to miss ' + e.node);
  }
  for (const n of w.nodes) for (const t of [(n.parameters && n.parameters.jsCode) || '']) {
    if (/\$env\s*\./.test(t) || /require\s*\(/.test(t) || /\$helpers\s*\./.test(t) || /process\.env/.test(t)) throw new Error(f + '/' + n.name + ' banned accessor');
  }
}
console.log('BUILD-OK nodes=' + WF1H.nodes.length + '+' + WF2H.nodes.length);
