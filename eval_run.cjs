const fs = require('fs');
const WF1 = 'http://localhost:5678/webhook/e1a2b3c4-0000-4000-8000-000000000001/webhookin/estate-report';
const SCEN = [
  { id: 's1-gangnam', lawd_cd: '11680', deal_ymd: '202508' },
  { id: 's2-songpa', lawd_cd: '11710', deal_ymd: '202508' },
  { id: 's3-mapo', lawd_cd: '11440', deal_ymd: '202508' },
  { id: 's4-empty', lawd_cd: '11680', deal_ymd: '202508', apt: '없는단지XYZ' },
  { id: 's5-badcode', lawd_cd: '99999', deal_ymd: '202508' }
];
(async () => {
  fs.mkdirSync('eval', { recursive: true });
  const only = process.argv[2]; // e.g. v1 or v2
  const versions = only ? [only] : ['v1', 'v2'];
  for (const pv of versions) {
    for (const s of SCEN) {
      const name = s.id + '-' + pv;
      const body = { lawd_cd: s.lawd_cd, deal_ymd: s.deal_ymd, scenario: name, prompt_version: pv };
      if (s.apt) body.apt = s.apt;
      const t0 = Date.now();
      try {
        const r = await fetch(WF1, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(170000) });
        const j = await r.json();
        j._clientMs = Date.now() - t0;
        j._scenario = name;
        fs.writeFileSync('eval/run_' + name + '.json', JSON.stringify(j, null, 2));
        console.log(name + ' OK report=' + j.report_id + ' clientMs=' + j._clientMs);
      } catch (e) {
        fs.writeFileSync('eval/run_' + name + '.json', JSON.stringify({ _scenario: name, _error: String(e && e.message || e) }, null, 2));
        console.log(name + ' FAIL ' + (e && e.message));
      }
    }
  }
})();
