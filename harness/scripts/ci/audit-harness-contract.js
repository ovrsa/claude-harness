#!/usr/bin/env node
'use strict';

/**
 * ハーネス整合監査。
 *
 * 文字列の存在は検査しない。存在は「テキストが動いていないこと」しか示さず、
 * 文書同士の一致を保証しないため。検査するのは「同じ契約が2箇所にないか」
 * 「宣言と実態が一致するか」。fail-fast にせず全件集めて出す。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '../../..');
const SKILL_LOCK = path.join(os.homedir(), '.agents', '.skill-lock.json');

const failures = [];
const skipped = [];

function fail(check, message) {
  failures.push(`[${check}] ${message}`);
}

function skip(check, reason) {
  skipped.push(`[${check}] ${reason}`);
}

function readIfPresent(relativePath) {
  const full = path.join(ROOT, relativePath);
  try {
    return fs.readFileSync(full, 'utf8');
  } catch {
    return null;
  }
}

function listSkillDirs() {
  const dir = path.join(ROOT, 'skills');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() || e.isSymbolicLink())
    .map(e => e.name)
    .sort();
}

function lockedSkills() {
  try {
    const raw = JSON.parse(fs.readFileSync(SKILL_LOCK, 'utf8'));
    const entries = raw.skills || raw;
    return Object.keys(entries).sort();
  } catch {
    return null;
  }
}

// --- 1. インストーラ管理下の SKILL.md を直接編集していないか -----------------
// 編集は upstream 更新で失われる。自動選択から外すなら settings.json の
// skillOverrides を使う（AGENTS.md の Mistakes To Avoid に記録済み）。
function checkLockedSkillsNotEdited() {
  const locked = lockedSkills();
  if (!locked) {
    skip('locked-skill-edit', `${SKILL_LOCK} が読めないので検査を飛ばした`);
    return;
  }
  for (const name of locked) {
    const body = readIfPresent(path.join('skills', name, 'SKILL.md'));
    if (body === null) continue; // worktree でダングリングするリンクがある
    if (/disable-model-invocation:\s*true/.test(body)) {
      fail('locked-skill-edit',
        `skills/${name}/SKILL.md は .skill-lock.json 管理下なのに disable-model-invocation を持つ。` +
        `settings.json の skillOverrides へ移すこと（更新で失われる）`);
    }
  }
}

// --- 2. AGENTS.md が主張する件数が実態と一致するか ---------------------------
function checkRepoMapCounts() {
  const repoMap = readIfPresent('AGENTS.md');
  if (repoMap === null) {
    fail('repo-map-counts', 'AGENTS.md が無い');
    return;
  }
  const locked = lockedSkills();

  // 主張と数字は行またぎで折り返されるので、行や段落ではなく主張のパターンで拾う
  const lockClaim = repoMap.match(/\.skill-lock\.json[\s\S]{0,80}?(\d+)\s*件/);
  const lockClaimPrefix = lockClaim
    ? repoMap.slice(Math.max(0, lockClaim.index - 80), lockClaim.index)
    : '';
  const historicalLockClaim = /元の環境では/.test(lockClaimPrefix);
  if (lockClaim && !historicalLockClaim && locked && Number(lockClaim[1]) !== locked.length) {
    fail('repo-map-counts',
      `AGENTS.md が .skill-lock.json の追跡数を ${lockClaim[1]}件 と書いているが実際は ${locked.length}件`);
  }

  const reverseClaim = repoMap.match(/(\d+)\s*件は逆で実体が/);
  if (reverseClaim) {
    const outward = listSkillDirs().filter(name => {
      try {
        return fs.readlinkSync(path.join(ROOT, 'skills', name)).includes('.agents');
      } catch { return false; }
    }).length;
    if (Number(reverseClaim[1]) !== outward) {
      fail('repo-map-counts',
        `AGENTS.md が「実体が ~/.agents 側」を ${reverseClaim[1]}件 と書いているが実際は ${outward}件`);
    }
  }
}

// --- 3. docs/ 直下の構成 ------------------------------------------------------
// rules/common/documentation.md が許すのは architecture.md / design/ / how-to/ だけ。
function checkDocsLayout() {
  const dir = path.join(ROOT, 'docs');
  if (!fs.existsSync(dir)) {
    fail('docs-layout', 'docs/ が無い');
    return;
  }
  const allowed = new Set(['architecture.md', 'design', 'how-to']);
  for (const entry of fs.readdirSync(dir)) {
    if (!allowed.has(entry)) {
      fail('docs-layout',
        `docs/${entry} は規約外。docs/ 直下は architecture.md / design/ / how-to/ のみ`);
    }
  }
  if (!fs.existsSync(path.join(dir, 'architecture.md'))) {
    fail('docs-layout', 'docs/architecture.md が無い（唯一の維持義務 doc）');
  }
}

// --- 4. Ordered Path の段数と、それを参照する箇所の番号が一致するか -----------
function checkOrderedPathReferences() {
  const commands = readIfPresent('commands/COMMANDS.md');
  if (commands === null) {
    fail('ordered-path', 'commands/COMMANDS.md が無い');
    return;
  }
  // 段番号は Ordered Path のコードブロック内だけを見る。本文まで拾うと
  // 「13 を飛ばすと…」のような散文が段として数えられ、番号ズレを検出できなくなる
  const block = commands.match(/###\s*Ordered Path[\s\S]*?```\n([\s\S]*?)```/);
  if (!block) {
    fail('ordered-path', 'COMMANDS.md の Ordered Path のコードブロックが見つからない');
    return;
  }
  // 段番号の書式は揃っていない（1〜9 は2スペース、10以降は1スペース）ので幅で決め打ちしない
  const steps = [...block[1].matchAll(/^(\d{1,2}) +\S/gm)].map(m => Number(m[1]));
  if (steps.length === 0) {
    fail('ordered-path', 'COMMANDS.md の Ordered Path から段番号を読み取れない');
    return;
  }
  const maxStep = Math.max(...steps);

  const referrers = ['commands/COMMANDS.md', 'rules/common/documentation.md', 'commands/docs-build.md'];
  for (const rel of referrers) {
    const body = readIfPresent(rel);
    if (body === null) continue;
    for (const m of body.matchAll(/手順\s*([\d〜~・\-, ]+)/g)) {
      for (const numText of m[1].split(/[〜~・,\-\s]+/)) {
        const n = Number(numText);
        if (!Number.isFinite(n) || n === 0) continue;
        if (n > maxStep) {
          fail('ordered-path',
            `${rel} が手順${n}を参照しているが Ordered Path は${maxStep}までしかない`);
        }
      }
    }
  }
}

// --- 5. ライフサイクルの段を COMMANDS.md 以外が再定義していないか -------------
// AGENTS.md は repo-local map なので、流れを複製せず truth source を指すこと
// （rules/common/documentation.md の Repo-Local Maps 規則）。
function checkNoDuplicateLifecycle() {
  // 見出し名で判定すると改名だけで通ってしまうので、番号付きの手順列そのものを見る。
  // 3段以上連続していたら「流れの再定義」とみなす。
  const repoMap = readIfPresent('AGENTS.md');
  if (repoMap) {
    const numbered = [...repoMap.matchAll(/^\s*(\d+)\.\s+\S/gm)].map(m => Number(m[1]));
    let run = 0;
    for (let i = 0; i < numbered.length; i++) {
      run = (i > 0 && numbered[i] === numbered[i - 1] + 1) ? run + 1 : 1;
      if (run >= 3) {
        fail('duplicate-lifecycle',
          'AGENTS.md が番号付きの手順列で流れを再定義している。' +
          'commands/COMMANDS.md の Ordered Path を指すだけにすること');
        break;
      }
    }
  }
  // ライフサイクル成果物は永続 doc ではないので対象外（.gitignore 済み）
  const lifecycleArtifacts = new Set([
    'plan.md', 'progress.md', 'research.md', 'review-summary.md',
    'verification-summary.md', 'observation-summary.md', 'TODO.md',
    'health-summary.md', 'triage-summary.md',
  ]);
  const rootDocs = fs.readdirSync(ROOT)
    .filter(f => f.endsWith('.md'))
    .filter(f => !lifecycleArtifacts.has(f));
  const allowedRoot = new Set(['CLAUDE.md', 'README.md', 'AGENTS.md']);
  for (const f of rootDocs) {
    if (!allowedRoot.has(f)) {
      fail('duplicate-lifecycle',
        `ルート直下の ${f} は統合対象。ルートに残すのは CLAUDE.md / README.md / AGENTS.md のみ`);
    }
  }
}

// --- 6. harness/hooks/hooks.json と settings.json の二重配線 --------------------------
function checkNoDualHookWiring() {
  const wired = rel => {
    const body = readIfPresent(rel);
    if (body === null) return null;
    const scripts = new Set();
    for (const m of body.matchAll(/([a-z0-9-]+\.js)/g)) scripts.add(m[1]);
    return scripts;
  };
  const fromSettings = wired('settings.json');
  const fromHooksJson = wired('harness/hooks/hooks.json');
  if (!fromSettings || !fromHooksJson) return;

  const shared = [...fromHooksJson].filter(s => fromSettings.has(s));
  if (shared.length > 0) {
    fail('dual-hook-wiring',
      `harness/hooks/hooks.json と settings.json が同じフックスクリプトを${shared.length}件配線している。` +
      `動いているのは settings.json 側だけで、二重維持は乖離の温床（CLAUDE.md の Core Rule 違反）`);
  }
}

// --- 7. documentation.md の図スキル列挙が実在スキルと一致するか ---------------
function checkDiagramSkillDelegation() {
  const rules = readIfPresent('rules/common/documentation.md');
  if (rules === null) {
    fail('diagram-delegation', 'rules/common/documentation.md が無い');
    return;
  }
  for (const name of listSkillDirs()) {
    const body = readIfPresent(path.join('skills', name, 'SKILL.md'));
    if (body === null) continue; // ダングリングリンクは検査不能
    if (/disable-model-invocation:\s*true/.test(body)) continue; // 自動選択されない
    const desc = (body.match(/^description:\s*(.*)$/m) || [])[1] || '';
    if (!/mermaid|diagram|図/i.test(desc)) continue;
    if (!rules.includes(name)) {
      fail('diagram-delegation',
        `skills/${name} はモデルから見える図スキルなのに documentation.md が委譲先として挙げていない`);
    }
  }
}

// --- 8. 古いモデルIDが残っていないか -----------------------------------------
// rules/common/performance.md が現行モデルを列挙している。そこに無い世代の ID は
// 書いた時点で古くなるので置かない。
const STALE_MODEL_ID = /claude-(?:sonnet|opus|haiku)-[34](?:[-.]\d)?/i;

function checkNoStaleModelIds() {
  for (const name of listSkillDirs()) {
    const body = readIfPresent(path.join('skills', name, 'SKILL.md'));
    if (body === null) continue;
    const hit = body.match(STALE_MODEL_ID);
    if (hit && !/haiku-4-5/i.test(hit[0])) {
      fail('stale-model-id',
        `skills/${name}/SKILL.md が古いモデルID "${hit[0]}" を持つ。` +
        `rules/common/performance.md の現行一覧に合わせること`);
    }
  }
}

// --- 9. 契約が2箇所に置かれていないか ----------------------------------------
// rules/common/documentation.md:「契約は1箇所にしか置かない」
function checkNoDuplicatedContracts() {
  const rules = readIfPresent('rules/common/documentation.md');
  const skill = readIfPresent('skills/writing-reference-docs/SKILL.md');
  if (rules === null || skill === null) return;

  const concepts = ['追加only', 'Lynch', 'Diátaxis', '索引', 'architecture.md', 'how-to'];
  const shared = concepts.filter(c => rules.includes(c) && skill.includes(c));
  if (shared.length > 2) {
    fail('duplicated-contract',
      `skills/writing-reference-docs が documentation.md と${shared.length}概念を重複保持している ` +
      `(${shared.join(', ')})。スキルは判定手順だけを持ち、契約は規則側に一本化すること`);
  }
}

// --- 既存の回帰ガード（文字列検査ではなく実害のある挙動を守るもの） -----------
function checkRegressionGuards() {
  const hookSuite = readIfPresent('harness/tests/hooks/hooks.test.js');
  if (hookSuite) {
    // pre-compact.js は cwd のリポジトリを読み、その成果物スナップショットを
    // $HOME/.claude/sessions の活動中セッションファイルへ追記する。subagent-stop.js も
    // 同じセッションファイルへ追記する。cwd を渡さないとテストプロセスの cwd、つまり
    // 本物のリポジトリを読むので、断言が実リポジトリの成果物の有無に左右される。
    // 2026-08-21 に確認: どちらも cwd 側へは書き込まない（progress.md への書き込みは
    // 2026-08-17 に撤去済み）。壊すのではなく、当てにならなくなるのが今の実害。
    for (const script of ['pre-compact.js', 'subagent-stop.js']) {
      if (hookSuite.includes(`runScript(path.join(scriptsDir, '${script}')`)) {
        fail('regression-guard',
          `hooks.test.js が ${script} を runScript で起動している。` +
          `runScriptInDir で使い捨てリポジトリを渡すこと（cwd のリポジトリを読むため）`);
      }
    }
  }

  const requiredTemplates = [
    'harness/templates/health-summary-template.md',
    'harness/templates/review-summary-template.md',
    'harness/templates/repo-map-template.md',
    'harness/templates/triage-summary-template.md',
    'harness/templates/observation-summary-template.md',
    'harness/templates/verification-summary-template.md',
  ];
  for (const rel of requiredTemplates) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      fail('regression-guard', `${rel} が無い`);
    }
  }
}

// --- 11. 文書が主張するブロックは実装を名指ししていること ----------------------
// 名指しが無いと「ブロックする」という主張をコードまで辿れない。名前の一致ではなく、
// そのファイルが存在し settings.json に配線されているかを見る（配線の無いフックは
// ブロックしない）。
function checkBlockingGatesNameTheirHook() {
  const wiring = readIfPresent('settings.json') || '';
  for (const rel of ['CLAUDE.md', 'docs/architecture.md', 'docs/how-to/run-a-task.md']) {
    const body = readIfPresent(rel);
    if (body === null) continue;
    for (const line of body.split('\n')) {
      // 表の行だけを見る。散文の「ブロックされる」は主張の枠ではない
      if (!line.trimStart().startsWith('|')) continue;
      // 太字の blocked / ブロックだけを「主張」とみなす。地の文の言及は数えない
      if (!/\*\*[^*]*(?:blocked|ブロック)[^*]*\*\*/.test(line)) continue;

      const named = line.match(/(?:harness\/)?hooks\/([a-z0-9-]+\.js)/);
      if (!named) {
        fail('blocking-gate-unnamed',
          `${rel} がブロックを主張しているが実装を名指ししていない: ${line.trim().slice(0, 70)}`);
        continue;
      }
      if (!fs.existsSync(path.join(ROOT, 'harness/hooks', named[1]))) {
        fail('blocking-gate-unnamed', `${rel} が名指しする harness/hooks/${named[1]} が存在しない`);
      } else if (!wiring.includes(named[1])) {
        fail('blocking-gate-unnamed',
          `harness/hooks/${named[1]} が settings.json に配線されていない。配線の無いフックはブロックしない`);
      }
    }
  }
}

// --- 12. 撤去した成果物が復活していないこと ------------------------------------
// 雛形が残ると、見た側が「使う成果物だ」と解釈して復活する。
function checkRetiredArtifactsStayRetired() {
  for (const rel of ['harness/templates/plan-template.md', 'harness/templates/progress-template.md']) {
    if (fs.existsSync(path.join(ROOT, rel))) {
      fail('retired-artifact', `${rel} は撤去済みの成果物の雛形。残っていると復活する`);
    }
  }
}

function main() {
  checkLockedSkillsNotEdited();
  checkRepoMapCounts();
  checkDocsLayout();
  checkOrderedPathReferences();
  checkNoDuplicateLifecycle();
  checkNoDualHookWiring();
  checkDiagramSkillDelegation();
  checkNoStaleModelIds();
  checkNoDuplicatedContracts();
  checkBlockingGatesNameTheirHook();
  checkRetiredArtifactsStayRetired();
  checkRegressionGuards();

  for (const s of skipped) console.warn(`SKIP: ${s}`);

  if (failures.length === 0) {
    console.log('PASS: harness contract audit');
    return;
  }

  const byCheck = new Map();
  for (const f of failures) {
    const key = f.slice(1, f.indexOf(']'));
    byCheck.set(key, (byCheck.get(key) || 0) + 1);
  }
  for (const f of failures) console.error(`FAIL: ${f}`);
  console.error(`\n${failures.length} 件の不整合（${[...byCheck.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}）`);
  process.exit(1);
}

main();
