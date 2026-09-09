const fs = require('fs');
const HOST = 'https://n8n.vibemakers.kr';
const KEY = process.env.N8NKEY;
if (!KEY) throw new Error('N8NKEY missing');
async function api(method, path, body) {
  const r = await fetch(HOST + path, {
    method, headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch { /* raw */ }
  return { status: r.status, json: j, raw: j === null ? t.slice(0, 300) : undefined };
}
(async () => {
  const which = process.argv[2];
  if (which === 'create') {
    for (const f of ['WF1-estate-report.json', 'WF2-estate-approve.json']) {
      const w = JSON.parse(fs.readFileSync(f, 'utf8'));
      const payload = { name: w.name, nodes: w.nodes, connections: w.connections, settings: w.settings || { executionOrder: 'v1' } };
      const r = await api('POST', '/api/v1/workflows', payload);
      console.log(f + ' -> HTTP' + r.status + ' id=' + (r.json && r.json.id) + ' name=' + (r.json && r.json.name));
      if (r.status !== 200 && r.status !== 201) console.log(JSON.stringify(r.json || r.raw).slice(0, 300));
    }
  } else if (which === 'activate') {
    for (const id of process.argv.slice(3)) {
      const r = await api('POST', '/api/v1/workflows/' + id + '/activate');
      console.log(id + ' activate -> HTTP' + r.status + ' ' + JSON.stringify(r.json).slice(0, 200));
    }
  } else if (which === 'update') {
    const id = process.argv[3], f = process.argv[4];
    const w = JSON.parse(fs.readFileSync(f, 'utf8'));
    const r = await api('PUT', '/api/v1/workflows/' + id, { name: w.name, nodes: w.nodes, connections: w.connections, settings: w.settings });
    console.log(f + ' -> HTTP' + r.status + ' nodes=' + (r.json && r.json.nodes && r.json.nodes.length));
    if (r.status !== 200) console.log(JSON.stringify(r.json || r.raw).slice(0, 400));
  } else if (which === 'get') {
    const r = await api('GET', '/api/v1/workflows/' + process.argv[3]);
    console.log('HTTP' + r.status);
    console.log(JSON.stringify({ id: r.json.id, name: r.json.name, active: r.json.active, nodes: r.json.nodes.map(n => n.name) }).slice(0, 500));
  }
})();
