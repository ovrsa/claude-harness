'use strict';

const { createHash } = require('crypto');

// Claude Code's /goal condition and Codex's goal objective are both capped at 4,000 characters.
const MAX_GOAL_CHARS = 4000;
const TURN_LIMIT = 30;

// Level-2 headings the goal reads. A heading matches when it starts with an alias, so
// "目的と今回の範囲" is an objective. templates/task-issue-template.md uses the first alias.
const SECTION_ALIASES = {
  parent: ['親Issue', 'Parent'],
  behavior: ['実現する動作', 'What to build'],
  objective: ['目的', 'Objective'],
  acceptance: ['受け入れ条件', '成功条件', 'Acceptance criteria'],
  verification: ['検証方法', '検証', 'Verification'],
  blockedBy: ['先行Issue', 'Blocked by'],
  constraints: ['制約', 'Constraints'],
  nonGoals: ['対象外', 'Non-goals', 'Out of scope'],
};

const normalizeHeading = text => text.replace(/\s+/g, ' ').replace(/[:：]\s*$/, '').trim();
const flatten = text => text.replace(/\s+/g, ' ').trim();

/** Split a markdown body into headings of one level, ignoring headings inside code fences. */
function sections(lines, level) {
  const found = [];
  let fence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const match = !fence && line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (match && match[1].length <= level) {
      found.push({ heading: match[1].length === level ? normalizeHeading(match[2]) : null, lines: [] });
      continue;
    }
    if (found.length > 0) found[found.length - 1].lines.push(line);
  }
  return found.filter(section => section.heading !== null);
}

/** List items become items (checkbox state dropped: ticking a box is progress, not a spec change). */
function parseBlock(lines) {
  const items = [];
  const notes = [];
  let open = false;
  for (const raw of lines) {
    if (!raw.trim()) { open = false; continue; }
    const item = raw.match(/^\s{0,3}(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/);
    if (item) { items.push(flatten(item[1])); open = true; }
    else if (open && /^\s+\S/.test(raw)) items[items.length - 1] += ` ${flatten(raw)}`;
    else { notes.push(flatten(raw)); open = false; }
  }
  return { items: items.filter(Boolean), notes };
}

function parseIssue(body) {
  const lines = String(body).replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const all = sections(lines, 2);
  const doc = {};
  for (const [key, aliases] of Object.entries(SECTION_ALIASES)) {
    const section = all.find(({ heading }) => aliases.some(alias => heading.toLowerCase().startsWith(alias.toLowerCase())));
    doc[key] = section ? parseBlock(section.lines) : { items: [], notes: [] };
  }
  return doc;
}

const blockText = block => [...block.items, ...block.notes].join(' ');

/** "参照: 設計判断 > ゴールと停止条件、受け入れ条件" in the parent section names parent headings. */
function referencedPaths(doc) {
  const line = [...doc.parent.items, ...doc.parent.notes].find(text => /^(?:参照|Refs?)\s*[:：]/i.test(text));
  if (!line) return [];
  return line.replace(/^(?:参照|Refs?)\s*[:：]\s*/i, '').split(/[、,，]/).map(part => part.split('>').map(normalizeHeading)).filter(path => path.every(Boolean));
}

function findReference(parentBody, [h2, h3]) {
  const lines = String(parentBody).replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const outer = sections(lines, 2).find(section => section.heading === h2);
  if (!outer || !h3) return outer ? outer.lines : null;
  const inner = sections(outer.lines, 3).find(section => section.heading === h3);
  return inner ? inner.lines : null;
}

function renderBlock(title, block) {
  if (!block.items.length && !block.notes.length) return [];
  return [`## ${title}`, ...block.notes, ...block.items.map(item => `- ${item}`)];
}

/** The text that identifies a spec: what the goal was built from, in a stable, diffable form. */
function renderSpec(task, doc, parent) {
  const lines = [`# ${task.ref} ${task.title || ''}`.trim(),
    ...renderBlock('目的', doc.objective), ...renderBlock('実現する動作', doc.behavior),
    ...renderBlock('受け入れ条件', doc.acceptance), ...renderBlock('検証方法', doc.verification),
    ...renderBlock('対象外', doc.nonGoals), ...renderBlock('制約', doc.constraints)];
  if (parent) {
    lines.push(`# 親 ${parent.ref}`, ...renderBlock('目的', parent.doc.objective),
      ...renderBlock('受け入れ条件', parent.doc.acceptance), ...renderBlock('対象外', parent.doc.nonGoals));
    for (const reference of parent.references) {
      lines.push(`## 参照: ${reference.path.join(' > ')}`, ...reference.lines.map(flatten).filter(Boolean));
    }
  }
  return `${lines.join('\n')}\n`;
}

function buildGoal({ task, doc, parent, repo, branch, revision }) {
  const criteria = doc.acceptance.items.map((item, i) => `${i + 1}) ${item}`).join(' ');
  const premise = doc.acceptance.notes.length ? `（前提: ${doc.acceptance.notes.join(' ')}）` : '';
  const nonGoals = [...(parent ? parent.doc.nonGoals.items : []), ...doc.nonGoals.items];
  return [
    `${task.ref}${task.title ? `「${task.title}」` : ' '}を【完了】か【停止】の状態にしたら終了する（仕様 ${revision}）。`,
    `【完了】次をすべて会話に示す。(1) 受け入れ条件をすべて満たす: ${criteria}${premise}`,
    `(2) 検証方法を実行した結果: ${[...doc.verification.notes, ...doc.verification.items].join(' / ')}`,
    '(3) レビューと仕上げを終え、未解決の CRITICAL/HIGH が無い。挙動が変わったなら観測の証拠がある',
    `(4) node ~/.claude/scripts/task-completion.js --repo ${repo} が終了コード 0`,
    `(5) ${branch ? `${branch} の PR` : '作業ブランチの PR'} が Ready for review で、本文は変更理由・変わる動作・検証結果・残る懸念・リンクだけ。`,
    '【停止】次のどれかに当たったら作業をやめ、PR を Draft のまま（PR が無ければ Issue に）試したことと必要な判断をコメントし、会話で未完了と伝える:',
    `同じ原因で3回連続して失敗 / このゴールで${TURN_LIMIT}ターンに到達 / 受け入れ条件や範囲の変更が必要 / 権限や外部依存で進めない。`,
    '【制約】マージしない。次のタスクに着手しない。人の確認なしにこの条件を変えない。',
    nonGoals.length ? `対象外: ${nonGoals.join('; ')}。` : '',
    doc.constraints.items.length ? `制約: ${doc.constraints.items.join('; ')}。` : '',
  ].filter(Boolean).join(' ');
}

/**
 * Build the goal shared by both runtimes. Nothing here depends on the runtime or the tracker,
 * which is what keeps the goal text identical in Claude Code and Codex.
 */
function prepareGoal({ task, parent, repo, branch }) {
  const doc = parseIssue(task.body);
  const parentDoc = parent ? parseIssue(parent.body) : null;
  const references = referencedPaths(doc).map(path => ({ path, lines: parent ? findReference(parent.body, path) : null }));
  const issues = [];
  // A person has to fix these in the issue; guessing a criterion or a check would change the spec.
  if (doc.acceptance.items.length === 0) issues.push('受け入れ条件の節にリスト項目が無い');
  if (!blockText(doc.verification)) issues.push('検証方法の節が無いか空');
  if (!parent && (doc.parent.items.length || doc.parent.notes.length)) issues.push('親Issueの節があるのに、親の本文が入力に無い');
  for (const reference of references) {
    if (parent && !reference.lines) issues.push(`親Issueに参照先の見出しが無い: ${reference.path.join(' > ')}`);
  }
  if (issues.length) return { issues };

  const parentView = parent ? { ref: parent.ref, doc: parentDoc, references } : null;
  const spec = renderSpec(task, doc, parentView);
  const revision = createHash('sha256').update(spec).digest('hex').slice(0, 12);
  const goal = buildGoal({ task, doc, parent: parentView, repo, branch, revision });
  const chars = Array.from(goal).length;
  if (chars > MAX_GOAL_CHARS) {
    return { issues: [`ゴール文面が ${chars} 字で、上限の 4,000 字を超える。受け入れ条件・検証方法・対象外を短くするか、Issue を分ける`] };
  }
  return { issues, goal, revision, spec };
}

/** Line diff of two spec renderings: "  " kept, "- " removed, "+ " added. */
function lineDiff(before, after) {
  const a = before.replace(/\n$/, '').split('\n');
  const b = after.replace(/\n$/, '').split('\n');
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push(`  ${a[i]}`); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push(`- ${a[i++]}`);
    else out.push(`+ ${b[j++]}`);
  }
  while (i < a.length) out.push(`- ${a[i++]}`);
  while (j < b.length) out.push(`+ ${b[j++]}`);
  return out.join('\n');
}

module.exports = { prepareGoal, lineDiff, MAX_GOAL_CHARS };
