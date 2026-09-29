'use strict';

const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');

const STATES = new Set(['active', 'waiting', 'completed', 'stopped']);
const ROLES = new Set(['action', 'gate']);
const AUTHORITIES = new Set(['agent', 'human', 'system']);
const PERMISSIONS = new Set(['repo:read', 'repo:write', 'tracker:read', 'tracker:write', 'network:read', 'external:write']);
const RESUME_EVENTS = new Set(['human_answer', 'spec_change_accepted', 'permission_granted', 'external_dependency_resolved']);
const SELECTORS = new Set(['current_spec', 'current_definition', 'current_subject']);
const now = () => new Date().toISOString();
const sha = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function definitionRevision(graph) {
  return `sha256:${sha(canonical({ schema_version: graph.schema_version, graph_id: graph.graph_id, task_id: graph.task_id, limits: graph.limits, nodes: graph.nodes }))}`;
}
function fail(message) { throw new Error(message); }
function validateDefinition(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('graph definition must be an object');
  for (const key of ['schema_version', 'graph_id', 'task_id', 'run_id', 'spec', 'limits', 'nodes']) if (input[key] === null || input[key] === undefined) fail(`missing ${key}`);
  for (const key of ['graph_id', 'task_id', 'run_id']) if (typeof input[key] !== 'string' || !input[key].trim()) fail(`${key} must be a non-empty string`);
  if (typeof input.spec?.source !== 'string' || !input.spec.source.trim()) fail('spec.source must be a non-empty string');
  if (input.schema_version !== 1 || !/^[0-9a-f]{12}$/.test(input.spec?.revision || '')) fail('unsupported schema_version or invalid spec.revision');
  if (!Array.isArray(input.nodes) || !input.nodes.length) fail('nodes must be non-empty');
  if (!Number.isInteger(input.limits.max_total_attempts) || input.limits.max_total_attempts < 1 || !Number.isInteger(input.limits.max_same_cause_failures) || input.limits.max_same_cause_failures < 1) fail('limits must be positive integers');
  const ids = new Set();
  for (const node of input.nodes) {
    for (const key of ['id', 'kind', 'role', 'required', 'requirement_ids', 'depends_on', 'authority', 'permissions', 'max_attempts', 'success_when']) if (node[key] === null || node[key] === undefined) fail(`node ${node.id || '?'} missing ${key}`);
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(node.id) || ids.has(node.id)) fail(`invalid or duplicate node id: ${node.id}`); ids.add(node.id);
    if (!ROLES.has(node.role) || !AUTHORITIES.has(node.authority) || typeof node.required !== 'boolean') fail(`node ${node.id} has invalid role, authority, or required`);
    if (!Number.isInteger(node.max_attempts) || node.max_attempts < 1) fail(`node ${node.id} max_attempts must be positive`);
    if (!Array.isArray(node.requirement_ids) || !node.requirement_ids.length || !Array.isArray(node.depends_on) || !Array.isArray(node.permissions) || node.permissions.some(p => !PERMISSIONS.has(p))) fail(`node ${node.id} has invalid requirements, dependencies, or permissions`);
    if (!Array.isArray(node.success_when) || !node.success_when.length) fail(`node ${node.id} requires success_when`);
    for (const condition of node.success_when) {
      if (condition.type === 'evidence' && (!condition.kind || !condition.subject || !SELECTORS.has(condition.revision_selector))) fail(`node ${node.id} has invalid evidence condition`);
      else if (condition.type === 'event' && (!condition.event_type || !condition.correlation_id)) fail(`node ${node.id} has invalid event condition`);
      else if (condition.type === 'task_completion' && condition.fingerprint_selector !== 'current_task') fail(`node ${node.id} has invalid task_completion condition`);
      else if (!['evidence', 'event', 'task_completion'].includes(condition.type)) fail(`node ${node.id} has unsupported success condition`);
    }
  }
  const terminals = new Set(['complete', 'stop']);
  for (const n of input.nodes) if (n.depends_on.some(target => !ids.has(target))) fail(`node ${n.id} has invalid dependency`);
  for (const node of input.nodes) for (const target of [...node.depends_on, node.success_to, node.failure_to].filter(Boolean)) if (!ids.has(target) && !terminals.has(target)) fail(`node ${node.id} references unknown target ${target}`);
  const visiting = new Set(), visited = new Set();
  function visit(id) { if (visiting.has(id)) fail('depends_on must be acyclic'); if (visited.has(id)) return; visiting.add(id); const n = input.nodes.find(x => x.id === id); n.depends_on.forEach(visit); visiting.delete(id); visited.add(id); }
  ids.forEach(visit);
  const reqs = Array.isArray(input.requirement_ids) ? input.requirement_ids : [...new Set(input.nodes.flatMap(n => n.requirement_ids))];
  for (const req of reqs) if (!new RegExp(`^${input.spec.revision}:AC-[1-9][0-9]*$`).test(req) || !input.nodes.some(n => n.required && n.requirement_ids.includes(req))) fail(`requirement is not covered by a required node: ${req}`);
  for (const n of input.nodes) for (const req of n.requirement_ids) if (!reqs.includes(req)) fail(`node ${n.id} references unknown requirement ${req}`);
  const reachable = new Set();
  const reachableTerminals = new Set();
  function walk(target) {
    if (terminals.has(target)) { reachableTerminals.add(target); return; }
    if (reachable.has(target)) return;
    reachable.add(target);
    const n = input.nodes.find(item => item.id === target);
    walk(n.success_to || 'complete');
    if (n.failure_to) walk(n.failure_to);
  }
  const entry = input.nodes.find(n => n.depends_on.length === 0);
  walk(entry.id);
  if (input.nodes.some(n => n.required && !reachable.has(n.id))) fail('required node is unreachable');
  if (!reachableTerminals.has('complete')) fail('graph has no reachable completion exit');
  const successVisiting = new Set(), successVisited = new Set();
  function checkSuccessPath(id) {
    if (terminals.has(id) || successVisited.has(id)) return;
    if (successVisiting.has(id)) fail('graph has a success loop without an exit');
    successVisiting.add(id);
    const next = input.nodes.find(item => item.id === id).success_to || 'complete';
    checkSuccessPath(next);
    successVisiting.delete(id);
    successVisited.add(id);
  }
  reachable.forEach(checkSuccessPath);
  return reqs;
}
function safeRunDir(runDir) {
  if (!path.isAbsolute(runDir) || path.basename(runDir) === '..') fail('run directory must be absolute');
  const resolved = path.resolve(runDir);
  if ([resolved, path.dirname(resolved)].some(part => fs.existsSync(part) && fs.lstatSync(part).isSymbolicLink())) fail('run directory and runs root must not be symlinks');
  return resolved;
}
function paths(runDir) {
  const root = safeRunDir(runDir);
  for (const child of ['graph.json', 'meta.json', 'logs', 'evidence']) {
    const target = path.join(root, child);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) fail(`Run path must not be a symlink: ${child}`);
  }
  const events = path.join(root, 'logs', 'events.ndjson');
  if (fs.existsSync(events) && fs.lstatSync(events).isSymbolicLink()) fail('Run event log must not be a symlink');
  return { root, graph: path.join(root, 'graph.json'), events };
}
function readGraph(runDir) {
  const p = paths(runDir);
  const graph = JSON.parse(fs.readFileSync(p.graph, 'utf8'));
  if (!STATES.has(graph.state)) fail('saved graph has invalid state');
  return graph;
}
function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(tmp, file);
}
function eventIds(file) {
  if (!fs.existsSync(file)) return new Set();
  const ids = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line).transition_id; } catch { return null; }
  });
  return new Set(ids.filter(Boolean));
}
function appendTransition(p, graph) {
  const tr = graph.last_transition;
  if (eventIds(p.events).has(tr.transition_id)) return;
  fs.mkdirSync(path.dirname(p.events), { recursive: true });
  fs.appendFileSync(p.events, `${JSON.stringify({ type: 'graph_transition', ...tr, graph_id: graph.graph_id, occurred_at: graph.updated_at })}\n`);
}
function save(runDir, graph, beforeRevision, summary) {
  if (graph.revision !== beforeRevision) fail('internal revision mismatch');
  const p = paths(runDir);
  const transition = { transition_id: randomUUID(), before_revision: beforeRevision, after_revision: beforeRevision + 1, summary };
  graph.revision++;
  graph.updated_at = now();
  graph.last_transition = transition;
  atomicWrite(p.graph, graph);
  appendTransition(p, graph);
  return graph;
}
function recover(runDir) {
  const p = paths(runDir);
  const graph = readGraph(runDir);
  appendTransition(p, graph);
  return graph;
}
function node(graph, id) {
  const found = graph.nodes.find(item => item.id === id);
  if (!found) fail(`unknown node ${id}`);
  return found;
}
function current(graph) {
  if (graph.current.length !== 1) fail('graph has no current node');
  const activeNode = node(graph, graph.current[0]);
  const attempt = [...graph.attempts].reverse().find(item => item.node_id === activeNode.id && (item.state === 'running' || item.state === 'waiting'));
  if (!attempt) fail('current attempt is missing');
  return { attempt, node: activeNode };
}
function instruction(graph) {
  if (graph.state !== 'active') return null;
  const { attempt, node: n } = current(graph);
  return { node_id: n.id, kind: n.kind, role: n.role, requirement_ids: n.requirement_ids, permissions: n.permissions, success_when: n.success_when, attempt_id: attempt.attempt_id };
}
function startAttempt(graph, nodeId, session, subject) {
  const n = node(graph, nodeId);
  const currentAttempts = graph.attempts.filter(attempt => attempt.input_revision.spec_revision === graph.spec.revision);
  const count = currentAttempts.filter(attempt => attempt.node_id === nodeId).length;
  for (const dependency of n.depends_on) {
    const latest = [...graph.attempts].reverse().find(attempt => attempt.node_id === dependency && attempt.input_revision.spec_revision === graph.spec.revision);
    if (!latest || latest.state !== 'succeeded') fail(`dependency ${dependency} is not satisfied for ${nodeId}`);
  }
  if (graph.attempts.length >= graph.limits.max_total_attempts || count >= n.max_attempts) { graph.state = 'stopped'; graph.current = []; return; }
  const attempt = { attempt_id: randomUUID(), node_id: nodeId, number: count + 1, state: 'running', session_ids: session ? [session] : [], started_at: now(), ended_at: null, evidence_refs: [], input_revision: { spec_revision: graph.spec.revision, definition_revision: graph.definition_revision, subject_fingerprint: subject || null } };
  graph.attempts.push(attempt); graph.current = [nodeId]; graph.state = 'active';
}
function createGraph(definition, options = {}) {
  validateDefinition(definition); if (definition.run_id !== path.basename(safeRunDir(options.runDir))) fail('run_id does not match run directory');
  const p = paths(options.runDir); if (fs.existsSync(p.graph)) fail('graph already exists');
  const metaFile = path.join(p.root, 'meta.json');
  if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (meta.task_id && meta.task_id !== definition.task_id) fail('Run task identity collision');
    if (meta.repository_identity && meta.repository_identity !== definition.task_id.slice(0, definition.task_id.lastIndexOf(':'))) fail('Run repository identity collision');
    if (meta.branch && meta.branch !== options.branch) fail('Run branch identity collision');
  }
  const graph = { ...JSON.parse(JSON.stringify(definition)), revision: 0, definition_revision: definitionRevision(definition), permission_ceiling: [...new Set(options.permissions || [])], state: 'active', current: [], attempts: [], wait: null, consumed_event_ids: [], last_transition: null, updated_at: now() };
  const first = graph.nodes.find(n => n.depends_on.length === 0); if (!first) fail('graph has no entry node');
  const granted = new Set(options.permissions || []); for (const n of graph.nodes) if (n.permissions.some(pn => !granted.has(pn))) fail(`permission ceiling does not allow node ${n.id}: ${n.permissions.join(',')}`);
  startAttempt(graph, first.id, options.session, options.subjectFingerprint);
  return save(options.runDir, graph, 0, `start:${first.id}`);
}
function verifyEvent(condition, event, attempt, runDir) {
  if (!event || !event.event_id || event.type !== condition.event_type || event.correlation_id !== condition.correlation_id || event.attempt_id !== attempt.attempt_id) return false;
  const file = paths(runDir).events;
  if (!fs.existsSync(file)) return false;
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).some(line => {
    try { const saved = JSON.parse(line); return saved.event_id === event.event_id && canonical(saved) === canonical(event); } catch { return false; }
  });
}
function evidenceRef(graph, condition, supplied, subjectFingerprint, runDir) {
  if (!/^[a-z][a-z0-9_-]*$/.test(condition.kind)) fail('unsafe evidence kind');
  const file = path.join(paths(runDir).root, 'evidence', `${condition.kind}.json`);
  if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) fail(`fresh ${condition.kind} evidence is required`);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!saved || saved.kind !== condition.kind || typeof saved.body !== 'string') fail(`fresh ${condition.kind} evidence is required`);
  if (!supplied || supplied.kind !== condition.kind || supplied.subject !== condition.subject) fail(`fresh ${condition.kind} evidence is required`);
  const expected = condition.revision_selector === 'current_spec' ? graph.spec.revision : condition.revision_selector === 'current_definition' ? graph.definition_revision : subjectFingerprint;
  if (!expected || supplied.subject_revision !== expected || !saved.fingerprint || saved.fingerprint !== subjectFingerprint || saved.spec_revision !== graph.spec.revision || saved.definition_revision !== graph.definition_revision) fail(`${condition.kind} evidence is stale`);
  return { kind: supplied.kind, path: `evidence/${supplied.kind}.json`, body_sha256: sha(saved.body), subject: supplied.subject, subject_revision: supplied.subject_revision, subject_fingerprint: subjectFingerprint || null, captured_at: saved.captured_at || now() };
}
function assertGateEvidenceFresh(graph, runDir, subjectFingerprint, gate, attempt) {
  for (const ref of attempt.evidence_refs) {
      if (!/^[a-z][a-z0-9_-]*$/.test(ref.kind) || ref.path !== `evidence/${ref.kind}.json`) fail(`unsafe evidence reference for ${gate.id}`);
      const file = path.join(paths(runDir).root, ref.path);
      if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) fail(`${gate.id} evidence is missing`);
      const record = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof record.body !== 'string' || sha(record.body) !== ref.body_sha256 || record.spec_revision !== graph.spec.revision || record.definition_revision !== graph.definition_revision || (ref.subject_fingerprint && ref.subject_fingerprint !== subjectFingerprint)) fail(`${gate.id} evidence is stale`);
  }
}
function assertFreshGates(graph, runDir, subjectFingerprint, options = {}) {
  for (const n of graph.nodes.filter(item => item.role === 'gate' && item.required)) {
    const attempt = [...graph.attempts].reverse().find(item => item.node_id === n.id && item.input_revision.spec_revision === graph.spec.revision);
    if (options.onlySucceeded && attempt?.state !== 'succeeded') continue;
    if (attempt && attempt.state !== 'succeeded') fail(`required gate ${n.id} latest attempt has not succeeded`);
    if (!attempt) fail(`required gate ${n.id} has no success`);
    assertGateEvidenceFresh(graph, runDir, subjectFingerprint, n, attempt);
  }
}
function assertCurrentCompletion(graph, runDir, subjectFingerprint, completion) {
  if (graph.state !== 'completed') return;
  if (completion?.verified !== true || completion.exit_code !== 0 || completion.fingerprint !== subjectFingerprint) fail('completed graph has stale task-completion evidence; verify the current task again');
  assertFreshGates(graph, runDir, subjectFingerprint);
}
function assertReadyGatesFresh(graph, runDir, subjectFingerprint) {
  if (graph.state === 'active') assertFreshGates(graph, runDir, subjectFingerprint, { onlySucceeded: true });
}
function revalidate(runDir, subjectFingerprint, completion, options = {}) {
  const graph = recover(runDir), before = graph.revision;
  if (!['active', 'completed'].includes(graph.state)) fail(`graph is ${graph.state}`);
  if (!options.session) fail('runtime session id is required');
  if (graph.state === 'active' && current(graph).node.role !== 'gate') fail('finish or fail the active action before revalidating gates');
  const gateAttempts = graph.nodes.filter(item => item.role === 'gate' && item.required).map(gate => {
    const index = graph.attempts.findLastIndex(attempt => attempt.node_id === gate.id && attempt.input_revision.spec_revision === graph.spec.revision);
    return { gate, index, attempt: graph.attempts[index] };
  }).filter(item => item.index >= 0 && item.attempt.state === 'succeeded');
  const stale = gateAttempts.filter(({ gate, attempt }) => {
    try { assertGateEvidenceFresh(graph, runDir, subjectFingerprint, gate, attempt); return false; }
    catch { return true; }
  }).sort((left, right) => left.index - right.index);
  let target = stale[0];
  if (!target && graph.state === 'completed' && !completion?.ready) target = gateAttempts.sort((left, right) => right.index - left.index)[0];
  if (!target) fail('there is no stale gate to revalidate');
  for (const attempt of graph.attempts.slice(target.index)) {
    if (node(graph, attempt.node_id).role === 'gate' && attempt.state === 'succeeded') {
      attempt.state = 'cancelled';
      attempt.invalidated_at = now();
    }
  }
  if (graph.state === 'active') {
    const active = current(graph).attempt;
    active.state = 'cancelled'; active.ended_at = now();
  }
  graph.current = [];
  startAttempt(graph, target.gate.id, options.session, subjectFingerprint);
  return save(runDir, graph, before, `revalidate:${target.gate.id}`);
}
function transition(runDir, operation, input = {}, options = {}) {
  const graph = recover(runDir), before = graph.revision; if (graph.state !== 'active') fail(`graph is ${graph.state}`);
  const pair = current(graph), attempt = pair.attempt, n = pair.node;
  if (!options.session) fail('runtime session id is required');
  if (!attempt.session_ids.includes(options.session)) attempt.session_ids.push(options.session);
  if (operation === 'fail') {
    if (!/^[a-z][a-z0-9_]*$/.test(input.cause || '')) fail('failure cause must be lowercase snake_case');
    attempt.state = 'failed'; attempt.failure_cause_code = input.cause; attempt.ended_at = now(); graph.current = [];
    const failures = graph.attempts.filter(a => a.node_id === n.id && a.input_revision.spec_revision === graph.spec.revision).slice(-graph.limits.max_same_cause_failures);
    const repeated = failures.length >= graph.limits.max_same_cause_failures && failures.every(a => a.failure_cause_code === input.cause);
    const target = repeated ? 'stop' : (n.failure_to || 'stop');
    if (target === 'stop') graph.state = 'stopped'; else startAttempt(graph, target, null, input.subject_fingerprint);
    return save(runDir, graph, before, `${n.id}:failed`);
  }
  if (operation !== 'succeed') fail(`unsupported transition ${operation}`);
  for (const condition of n.success_when) {
    if (condition.type === 'event') {
      if (!verifyEvent(condition, input.event, attempt, runDir)) fail(`matching persisted ${condition.event_type} event is required`);
      if (n.authority === 'human' && input.event.actor?.kind !== 'human') fail('event actor does not match human node authority');
      const usedForResume = attempt.resume_event_id === input.event.event_id;
      if (!input.event.event_id || (graph.consumed_event_ids.includes(input.event.event_id) && !usedForResume)) fail('event is missing or already consumed');
      if (!usedForResume) graph.consumed_event_ids.push(input.event.event_id);
    }
    if (condition.type === 'evidence') attempt.evidence_refs.push(evidenceRef(graph, condition, input.evidence, options.subjectFingerprint, runDir));
    if (condition.type === 'task_completion' && (options.completion?.verified !== true || options.completion.exit_code !== 0 || options.completion.fingerprint !== options.subjectFingerprint)) fail('successful task-completion result for the current fingerprint is required');
  }
  if (n.kind === 'review') {
    const makerSessions = new Set(graph.attempts.filter(a => a.input_revision.spec_revision === graph.spec.revision && graph.nodes.some(item => item.id === a.node_id && item.role === 'action')).flatMap(a => a.session_ids));
    if (!makerSessions.size || !attempt.session_ids.length || attempt.session_ids.some(id => makerSessions.has(id))) fail('review must use a separate session from implementation');
  }
  attempt.state = 'succeeded'; attempt.ended_at = now(); graph.current = [];
  const target = n.success_to || 'complete';
  if (target === 'complete') {
    if (options.completion?.verified !== true || options.completion.exit_code !== 0 || options.completion.fingerprint !== options.subjectFingerprint) fail('successful task-completion result for the current fingerprint is required');
    const required = graph.nodes.filter(x => x.required);
    if (required.some(x => [...graph.attempts].reverse().find(a => a.node_id === x.id && a.input_revision.spec_revision === graph.spec.revision)?.state !== 'succeeded')) fail('required nodes are incomplete');
    assertFreshGates(graph, runDir, options.subjectFingerprint);
    graph.state = 'completed';
  } else if (target === 'stop') graph.state = 'stopped';
  else {
    const next = node(graph, target), ceiling = new Set(graph.permission_ceiling || []);
    if (next.permissions.some(permission => !ceiling.has(permission))) fail(`permission ceiling does not allow node ${next.id}`);
    startAttempt(graph, target, null, input.subject_fingerprint);
  }
  return save(runDir, graph, before, `${n.id}:succeeded`);
}
function wait(runDir, value) {
  const graph = recover(runDir);
  const before = graph.revision;
  if (graph.state !== 'active') fail('graph is not active');
  const { attempt } = current(graph);
  if (!value || !value.wait_id || !value.reason?.trim() || !value.question?.trim() || !Array.isArray(value.allowed_actors) || !value.allowed_actors.length || !Array.isArray(value.resume_on) || !value.resume_on.length || !['continue_attempt', 'new_attempt'].includes(value.resume_mode)) fail('invalid wait');
  if (value.allowed_actors.some(actor => !AUTHORITIES.has(actor?.kind) || typeof actor.id !== 'string' || !actor.id.trim())) fail('invalid wait actor');
  for (const rule of value.resume_on) if (!RESUME_EVENTS.has(rule.type) || rule.correlation_id !== value.wait_id || (rule.required_fields && (!Array.isArray(rule.required_fields) || rule.required_fields.some(field => typeof field !== 'string' || !field.trim())))) fail('invalid resume event');
  attempt.state = 'waiting';
  graph.state = 'waiting';
  graph.wait = { ...value, attempt_id: attempt.attempt_id, requested_at: now() };
  return save(runDir, graph, before, `wait:${value.wait_id}`);
}
function resume(runDir, event, options = {}) {
  const graph = recover(runDir), before = graph.revision; if (graph.state !== 'waiting' || !graph.wait) fail('graph is not waiting');
  const w = graph.wait, pair = current(graph); if (!event || graph.consumed_event_ids.includes(event.event_id)) fail('event is missing or already consumed');
  if (pair.node.role === 'gate' && pair.attempt.input_revision.subject_fingerprint && pair.attempt.input_revision.subject_fingerprint !== options.subjectFingerprint) fail('waiting gate subject is stale');
  const rule = w.resume_on.find(r => r.type === event.type && r.correlation_id === event.correlation_id); if (!rule || event.attempt_id !== w.attempt_id) fail('event does not match the current wait');
  const file = paths(runDir).events;
  const persisted = fs.existsSync(file) && fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).some(line => {
    try { const saved = JSON.parse(line); return saved.event_id === event.event_id && saved.type === event.type && saved.correlation_id === event.correlation_id && saved.attempt_id === event.attempt_id && canonical(saved.actor) === canonical(event.actor) && canonical(saved.payload) === canonical(event.payload); } catch { return false; }
  });
  if (!persisted) fail('resume event is not persisted');
  if (!w.allowed_actors.some(a => a.kind === event.actor?.kind && a.id === event.actor?.id)) fail('event actor is not allowed');
  for (const field of rule.required_fields || []) if (event.payload?.[field] === null || event.payload?.[field] === undefined || event.payload[field] === '') fail(`event is missing required field ${field}`);
  graph.consumed_event_ids.push(event.event_id); graph.wait = null;
  if (w.resume_mode === 'continue_attempt') { pair.attempt.state = 'running'; pair.attempt.resume_event_id = event.event_id; if (options.session && !pair.attempt.session_ids.includes(options.session)) pair.attempt.session_ids.push(options.session); graph.state = 'active'; }
  else { pair.attempt.state = 'cancelled'; pair.attempt.ended_at = now(); graph.current = []; startAttempt(graph, pair.node.id, options.session, options.subjectFingerprint); }
  return save(runDir, graph, before, `resume:${event.event_id}`);
}
/**
 * Why an event does not wake a waiting Graph, or null when it is the first complete answer to the
 * wait. Notifications, timeouts and heartbeats have no resume rule, so they land here too.
 */
function holdReason(graph, event, existing) {
  const w = graph.wait;
  const rule = w.resume_on.find(r => r.type === event.type && r.correlation_id === event.correlation_id);
  if (!rule) return `${event.type} does not resume ${w.wait_id}`;
  if (event.attempt_id !== w.attempt_id) return 'event belongs to another attempt';
  if (!w.allowed_actors.some(actor => actor.kind === event.actor.kind && actor.id === event.actor.id)) return 'event actor is not allowed';
  const missing = (rule.required_fields || []).find(field => event.payload[field] === null || event.payload[field] === undefined || event.payload[field] === '');
  if (missing) return `missing required field ${missing}`;
  if (existing.some(row => row.correlation_id === w.wait_id && row.attempt_id === w.attempt_id && !graph.consumed_event_ids.includes(row.event_id))) return 'an answer is already waiting to resume this attempt';
  if (graph.consumed_event_ids.includes(event.event_id) || existing.some(row => row.event_id === event.event_id)) return 'event id was already used';
  return null;
}
function ingest(runDir, event) {
  const graph = recover(runDir);
  if (!event || !event.event_id || !event.type || !event.correlation_id || !event.attempt_id || !event.actor?.kind || !event.actor?.id || !event.occurred_at || !event.payload || typeof event.payload !== 'object') fail('event envelope is incomplete');
  const file = paths(runDir).events;
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean) : [];
  if (graph.state === 'waiting') {
    const reason = holdReason(graph, event, existing);
    if (reason) return { graph, wake: false, reason };
  } else {
    if (graph.consumed_event_ids.includes(event.event_id)) fail('event already consumed');
    if (existing.some(row => row.event_id === event.event_id)) fail('event id already exists');
    const pair = current(graph);
    if (pair.node.authority === 'human' && event.actor.kind !== 'human') fail('event actor does not match human node authority');
    if (event.attempt_id !== pair.attempt.attempt_id || !pair.node.success_when.some(condition => condition.type === 'event' && condition.event_type === event.type && condition.correlation_id === event.correlation_id)) fail('event does not match current node');
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
  return { graph, wake: graph.state === 'waiting' };
}
function revise(runDir, definition, eventId, options = {}) {
  const graph = recover(runDir);
  if (graph.state !== 'waiting' || !graph.wait?.resume_on.some(rule => rule.type === 'spec_change_accepted')) fail('graph is not waiting for a specification change');
  const file = paths(runDir).events;
  const events = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  const accepted = events.find(event => event.event_id === eventId && event.type === 'spec_change_accepted' && event.attempt_id === graph.wait.attempt_id && event.correlation_id === graph.wait.wait_id && event.payload?.revision === definition.spec?.revision && graph.wait.allowed_actors.some(actor => actor.kind === event.actor?.kind && actor.id === event.actor?.id));
  if (!accepted || graph.consumed_event_ids.includes(eventId)) fail('accepted specification event is required');
  validateDefinition(definition);
  if (definition.run_id !== graph.run_id || definition.task_id !== graph.task_id || definition.graph_id !== graph.graph_id || definition.spec.revision === graph.spec.revision) fail('new definition must retain graph identity and change spec revision');
  const ceiling = new Set(graph.permission_ceiling);
  for (const n of definition.nodes) if (n.permissions.some(permission => !ceiling.has(permission))) fail(`permission ceiling does not allow revised node ${n.id}`);
  const before = graph.revision;
  graph.consumed_event_ids.push(eventId);
  graph.spec = definition.spec;
  graph.nodes = definition.nodes;
  graph.limits = definition.limits;
  graph.requirement_ids = definition.requirement_ids;
  graph.definition_revision = definitionRevision(definition);
  const previous = graph.attempts.find(attempt => attempt.attempt_id === graph.wait.attempt_id);
  if (previous) { previous.state = 'cancelled'; previous.ended_at = now(); }
  graph.current = [];
  graph.wait = null;
  const first = graph.nodes.find(node => node.depends_on.length === 0);
  startAttempt(graph, first.id, options.session, options.subjectFingerprint);
  return save(runDir, graph, before, `revise:${eventId}`);
}
function result(graph) { return { state: graph.state, revision: graph.revision, graph_id: graph.graph_id, wait: graph.wait, next: instruction(graph) }; }

const STANDARD_WAIT_ID = 'ask';
/**
 * The Graph an issue asks for with "型: 標準": implement, verify with a repair loop, then review.
 * A question the issue names for "実装の前" becomes a human node in front of implementation.
 */
function standardDefinition({ taskId, runId, source, revision, requirementIds, limits, question }) {
  const node = (id, kind, role, fields) => ({ id, kind, role, required: true, requirement_ids: requirementIds, depends_on: [], authority: 'agent', permissions: ['repo:read'], max_attempts: 1, ...fields });
  const recorded = id => [{ type: 'event', event_type: 'work_recorded', correlation_id: id }];
  const evidence = kind => [{ type: 'evidence', kind, subject: 'task', revision_selector: 'current_subject' }];
  const nodes = [
    node('implement', 'implementation', 'action', { depends_on: question ? [STANDARD_WAIT_ID] : [], permissions: ['repo:write'], success_when: recorded('implement'), success_to: 'verify' }),
    node('verify', 'verification', 'gate', { depends_on: ['implement'], max_attempts: limits.verify, success_when: evidence('verification'), success_to: 'review', failure_to: 'fix' }),
    // Every verification after the first follows a fix, so fixes never outnumber the retries.
    node('fix', 'fix', 'action', { required: false, depends_on: ['implement'], permissions: ['repo:write'], max_attempts: Math.max(1, limits.verify - 1), success_when: recorded('fix'), success_to: 'verify' }),
    node('review', 'review', 'gate', { depends_on: ['verify'], max_attempts: limits.review, success_when: evidence('review'), success_to: 'complete', failure_to: 'fix' }),
  ];
  if (question) nodes.unshift(node(STANDARD_WAIT_ID, 'question', 'action', { authority: 'human', permissions: [], success_when: [{ type: 'event', event_type: 'human_answer', correlation_id: STANDARD_WAIT_ID }], success_to: 'implement' }));
  return {
    schema_version: 1, graph_id: taskId, task_id: taskId, run_id: runId, spec: { source, revision },
    limits: { max_total_attempts: nodes.reduce((sum, item) => sum + item.max_attempts, 0), max_same_cause_failures: 3 },
    requirement_ids: requirementIds, nodes,
  };
}
/** The wait a standard Graph enters at once when the issue named a question for before implementation. */
function standardWait(question) {
  return { wait_id: STANDARD_WAIT_ID, reason: 'human_decision', question, allowed_actors: [{ kind: 'human', id: 'operator' }], resume_on: [{ type: 'human_answer', correlation_id: STANDARD_WAIT_ID, required_fields: ['answer'] }], resume_mode: 'continue_attempt' };
}

module.exports = { createGraph, readGraph, transition, wait, resume, ingest, revise, revalidate, result, validateDefinition, definitionRevision, assertCurrentCompletion, assertReadyGatesFresh, standardDefinition, standardWait };
