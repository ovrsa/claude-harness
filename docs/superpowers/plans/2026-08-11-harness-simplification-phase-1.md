# Harness Simplification Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code hooksがraw stdinをstdoutへ再出力する誤契約を除き、no-op時はsilent、tool input変更時だけcurrent structured protocolを返す状態にする。

**Architecture:** Phase 1Aでwrapper、高負荷PostToolUse hooks、`auto-tmux-dev.js`をcontract-firstで修正する。Phase 1Bで残存active passthrough hooksからraw echoだけを除き、既存side effectとbounded stderr diagnosticsを維持する。`settings.json` registrationは変更せず、focused contract testsと既存hook suiteの両方で検証する。

**Tech Stack:** Node.js >=18 CommonJS、Bash、Node built-in `assert` / `child_process`、既存custom test runner。

---

## Plan Status And References

- status: approved
- independent plan review: approved
- user approval: approved
- execution mode: subagent-driven
- active runtime promotion: pending separate approval
- task type: heavy-risky
- design: `docs/superpowers/specs/2026-08-11-harness-simplification-design.md`
- research: `plan/harness-simplification/research.md`
- master plan: `plan/harness-simplification/plan.md`
- external contract: `https://code.claude.com/docs/en/hooks`

公式contractのうち本planが固定する点:

- exit 0 + no output はno decision。
- stdoutにJSONを出す場合、stdoutはJSON objectだけにする。
- `PreToolUse` input変更は `hookSpecificOutput.updatedInput`。
- `PostToolUse`でinputを返さない。tool result変更が必要なら `updatedToolOutput` を使うが、今回の3 hooksはresultを変更しない。

## File Map

**Create:**

- `tests/hooks/hook-output-contract.test.js`
  - active hook output contractのfocused executable specification。

**Modify — Phase 1A:**

- `scripts/hooks/run-with-flags.js`
  - disabled / missing / invalid invocationをsilent no-opにする。childのmeaningful outputだけをforwardする。
- `scripts/hooks/run-with-flags-shell.sh`
  - `CLAUDE_PLUGIN_ROOT` fallbackを安全に解決し、no-op raw echoを除く。
- `scripts/hooks/post-edit-format.js`
- `scripts/hooks/post-edit-typecheck.js`
- `scripts/hooks/post-edit-console-warn.js`
  - side effectとbounded diagnosticsを維持し、stdoutを空にする。
- `scripts/hooks/auto-tmux-dev.js`
  - dev command変更時だけvalid `PreToolUse` structured outputを返す。

**Modify — Phase 1B:**

- `scripts/hooks/pre-bash-tmux-reminder.js`
- `scripts/hooks/pre-bash-git-push-reminder.js`
- `scripts/hooks/quality-gate.js`
- `scripts/hooks/post-bash-build-complete.js`
- `scripts/hooks/cost-tracker.js`
- `scripts/hooks/doc-file-warning.js`
- `scripts/hooks/session-end-marker.js`
- `scripts/hooks/post-bash-pr-created.js`
- `scripts/hooks/check-console-log.js`
  - raw echoだけを除く。

**Modify — Tests And Docs:**

- `.gitignore`
  - root/local `plans/` ignoreを維持し、`docs/superpowers/plans/` だけをtracking対象へ戻す。
- `tests/hooks/hooks.test.js`
  - passthroughを正しいcontractとして固定するlegacy assertionsを削除またはsilent assertionsへ変更する。
- `tests/run-all.js`
  - focused contract testを`core`, `hooks`, `full`へ登録する。
- `hooks/README.md`
  - no-op / structured output contractを記載し、raw input echo exampleを除く。

**Protected / Not Modified:**

- `settings.json`
- `hooks/hooks.json`
- `docs/superpowers/specs/2026-08-11-test-suite-pruning-design.md`

## Task 0: Establish Isolation And Baseline

**Files:**

- Read: `settings.json`
- Read: `hooks/hooks.json`
- Read: `tests/hooks/hooks.test.js`
- Read: `docs/superpowers/specs/2026-08-11-test-suite-pruning-design.md`
- Record later: `plan/harness-simplification/progress.md`

- [ ] **Step 1: Confirm explicit execution authority**

実装開始前に、approved planning artifactsのcommit、dedicated worktree作成、verified implementation candidate commitが許可されていることを確認する。承認がなければここで停止する。

- [ ] **Step 2: Capture protected workspace state**

Run:

```bash
git status --short --branch
git diff -- settings.json hooks/hooks.json
git diff -- tests/hooks/hooks.test.js tests/run-all.js
```

Expected:

- `settings.json` の既存user diffを記録できる。
- `hooks/hooks.json` に今回の未承認変更がない。
- target testsに別実装のconcurrent diffがある場合は停止する。

- [ ] **Step 3: Verify and commit the approved planning artifacts**

main workspaceでplan review結果、user approval、`git diff --check`、artifact template validationを `plan/harness-simplification/review-summary.md` と `verification-summary.md` に記録する。`Findings: none` とverification passを確認後、明示承認がある場合だけ次をcommitする。

```bash
git check-ignore -v docs/superpowers/plans/2026-08-11-harness-simplification-phase-1.md
git status --short --untracked-files=all -- docs/superpowers/plans/2026-08-11-harness-simplification-phase-1.md
git add .gitignore plan/harness-simplification/research.md plan/harness-simplification/plan.md plan/harness-simplification/review-summary.md plan/harness-simplification/verification-summary.md docs/superpowers/specs/2026-08-11-harness-simplification-design.md docs/superpowers/plans/2026-08-11-harness-simplification-phase-1.md
git diff --cached --name-only
git commit -m "docs: plan staged harness simplification"
```

Expected: `git check-ignore -v` は `!docs/superpowers/plans/**` のnegation ruleを示し、`git status` はplan fileを `??` として表示する。staged namesは上記planning artifactsと`.gitignore`だけで、unrelated `settings.json` とlocal runtime filesはcommitに含まれない。

- [ ] **Step 4: Create a dedicated worktree**

Use `superpowers:using-git-worktrees` and create branch `codex/harness-simplification-phase-1` from the approved planning commit. Worktree path must be explicit and outside the active runtime directory.

Expected: implementation worktreeの`git status --porcelain`が空で、approved research / design / master plan / Phase 1 planを読める。

- [ ] **Step 5: Run baseline verification**

Run:

```bash
npm test
npm run test:hooks
```

Expected: current approved baseline resultを保存する。failureがある場合、Phase 1由来か既存baselineか分類するまで編集しない。

- [ ] **Step 6: Reproduce the output defect**

Run:

```bash
payload='{"tool_name":"Edit","tool_input":{"file_path":"/tmp/example.ts"}}'
printf '%s' "$payload" | node scripts/hooks/post-edit-format.js | wc -c
printf '%s' "$payload" | ECC_DISABLED_HOOKS='post:edit:format' node scripts/hooks/run-with-flags.js 'post:edit:format' 'scripts/hooks/post-edit-format.js' 'standard,strict' | wc -c
```

Expected before fix: both counts are greater than 0。

## Task 1: Add Focused Hook Output Contract Tests

**Files:**

- Create: `tests/hooks/hook-output-contract.test.js`
- Modify: `tests/run-all.js`

- [ ] **Step 1: Write the shared process harness**

`tests/hooks/hook-output-contract.test.js` は次のobservable fieldsだけを検証する。

```js
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS = path.join(REPO_ROOT, 'scripts', 'hooks');
const selectedGroup = (process.argv.find(arg => arg.startsWith('--group=')) || '')
  .slice('--group='.length);

function run(command, args, { input = '', env = {}, cwd = REPO_ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

function runNode(script, options = {}) {
  return run(process.execPath, [path.join(SCRIPTS, script), ...(options.args || [])], options);
}

function assertSilentSuccess(result) {
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.stdout, '');
  assert.ok(result.stderr.length <= 8192, `stderr too large: ${result.stderr.length}`);
}
```

- [ ] **Step 2: Add grouped RED cases**

Groups and required cases:

- `wrappers`
  - `run-with-flags.js` disabled via `ECC_DISABLED_HOOKS` returns empty stdout。
  - missing child script returns exit 0, empty stdout, bounded stderr。
  - `run-with-flags-shell.sh` works without `CLAUDE_PLUGIN_ROOT` and returns empty stdout when disabled / missing。
  - enabled `run-with-flags.js` wrapping `permission-request.js` forwards the child's structured JSON byte-for-byte and does not prepend the original input。
- `post-edit`
  - format / typecheck / console-warn no-op inputs return empty stdout。
  - malformed JSON returns exit 0 and empty stdout。
  - one oversized payload returns exit 0, empty stdout, bounded stderr。
- `auto-tmux`
  - non-dev command returns empty stdout。
  - malformed JSON returns empty stdout。
  - injected pure transform case returns only `hookSpecificOutput.hookEventName = PreToolUse` and full `updatedInput`。
- `passive`
  - Phase 1Bの9 scriptsをsafe no-op input、temporary `HOME`、temporary non-git `cwd`で実行し、empty stdoutとbounded stderrを確認する。
  - diagnosticを持つhookは代表的なtrigger inputでも実行する。raw inputに `RAW_INPUT_SENTINEL_DO_NOT_ECHO` とsecret-like sentinelをunrelated metadataとして含め、stdout empty、stderr 8 KiB以下、両sentinel不在を検証する。
  - trigger casesは少なくともtmux reminder、git push reminder、build-complete、doc warning、PR-created、check-console-logを含む。filesystem / Git side effectが必要なcaseはtemporary directory内だけで構築する。

テストrunnerは最後に次を出力する。

```js
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 3: Register the focused test**

`tests/run-all.js` の `core`, `hooks`, `full` に次を1回ずつ追加する。

```js
{ file: 'hooks/hook-output-contract.test.js' }
```

- [ ] **Step 4: Run the RED test**

Run:

```bash
node tests/hooks/hook-output-contract.test.js
```

Expected: FAIL。少なくともwrapper、PostToolUse、auto-tmux、passive raw echo casesが失敗する。

## Task 2: Make Hook Wrappers Silent On No-Op Paths

**Files:**

- Modify: `scripts/hooks/run-with-flags.js`
- Modify: `scripts/hooks/run-with-flags-shell.sh`
- Test: `tests/hooks/hook-output-contract.test.js`

- [ ] **Step 1: Remove JavaScript wrapper passthrough**

`run-with-flags.js` のmissing args、disabled、missing script branchesから `process.stdout.write(raw)` を除く。child scriptを実行したbranchだけは、childが返したmeaningful stdoutをそのままforwardする。

```js
if (!hookId || !relScriptPath) return;
if (!isHookEnabled(hookId, { profiles: profilesCsv })) return;

if (!fs.existsSync(scriptPath)) {
  process.stderr.write(`[Hook] Script not found for ${hookId}: ${scriptPath}\n`);
  return;
}
```

child stderr forwardingは最大8 KiBに制限し、超過時はtruncation markerを付ける。raw stdinをdiagnosticへ含めない。

- [ ] **Step 2: Fix shell root resolution and no-op output**

`run-with-flags-shell.sh` のroot resolutionを次の形にする。

```bash
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd -- "$SCRIPT_DIR/../.." && pwd)}"
```

- missing args / disabled / missing scriptで `INPUT` をstdoutへ書かない。
- enabled childへだけ `printf '%s' "$INPUT" | "$SCRIPT_PATH"` でstdinを渡す。
- enable-check failureはhookを実行せず、短いstderr diagnosticを出してexit 0にする。

- [ ] **Step 3: Run wrapper tests**

Run:

```bash
node tests/hooks/hook-output-contract.test.js --group=wrappers
```

Expected: `Failed: 0`。

- [ ] **Step 4: Keep the green wrapper slice uncommitted**

Run `git diff --check` and record the focused GREEN result in `progress.md`。heavy-risky commit gateのため、この時点ではcommitしない。

## Task 3: Make Post-Edit Side-Effect Hooks Silent

**Files:**

- Modify: `scripts/hooks/post-edit-format.js`
- Modify: `scripts/hooks/post-edit-typecheck.js`
- Modify: `scripts/hooks/post-edit-console-warn.js`
- Test: `tests/hooks/hook-output-contract.test.js`

- [ ] **Step 1: Remove stdout from format hook**

Keep formatter detection and execution unchanged。JSON parse failure、non-target extension、missing formatter、formatter failureはexit 0 + empty stdoutにする。final `process.stdout.write(data)` を削除する。

- [ ] **Step 2: Remove stdout from typecheck hook**

missing file branchとfinal branchの `process.stdout.write(data)` を削除する。edited-file error filtering、10-line limit、stderr messageは維持する。

```js
if (!fs.existsSync(resolvedPath)) {
  process.exitCode = 0;
  return;
}
```

- [ ] **Step 3: Remove stdout from console warning hook**

missing content branchとfinal branchのstdout writeを削除する。最大5 matchesとexisting warning textは維持する。

- [ ] **Step 4: Run PostToolUse contract tests**

Run:

```bash
node tests/hooks/hook-output-contract.test.js --group=post-edit
```

Expected: `Failed: 0`、raw markerがstdout / stderrにない。

- [ ] **Step 5: Keep the green PostToolUse slice uncommitted**

Run `git diff --check` and record the focused GREEN result in `progress.md`。commitはTask 8のverification / review後に行う。

## Task 4: Return Valid Structured Output From Auto-Tmux

**Files:**

- Modify: `scripts/hooks/auto-tmux-dev.js`
- Test: `tests/hooks/hook-output-contract.test.js`

- [ ] **Step 1: Extract a pure transform boundary**

`auto-tmux-dev.js` を `require.main === module` guard付きにし、I/Oとcommand transformationを分離する。

```js
function buildUpdatedInput(input, options = {}) {
  const toolInput = input && typeof input.tool_input === 'object'
    ? input.tool_input
    : null;
  if (!toolInput) return null;

  const command = String(toolInput.command || '');
  if (!DEV_SERVER_PATTERN.test(command)) return null;

  const transformedCommand = transformCommand(command, options);
  if (!transformedCommand || transformedCommand === command) return null;

  return { ...toolInput, command: transformedCommand };
}
```

`options` はtestで `platform`, `cwd`, `hasTmux` を注入でき、production defaultは `process.platform`, `process.cwd()`, existing `which tmux` checkを使う。

- [ ] **Step 2: Emit only the current PreToolUse schema**

```js
const updatedInput = buildUpdatedInput(input);
if (!updatedInput) return;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    updatedInput,
  },
}));
```

malformed input、non-dev command、tmux unavailableはexit 0 + empty stdout。元のtop-level inputやraw JSONをstdoutへ返さない。

- [ ] **Step 3: Test transformed and no-op paths**

Run:

```bash
node tests/hooks/hook-output-contract.test.js --group=auto-tmux
```

Expected: `Failed: 0`。structured JSONに `tool_name`, `session_id`, raw top-level inputが混入しない。`updatedInput` はcommand以外の元tool fieldsを保持する。

- [ ] **Step 4: Keep the green auto-tmux slice uncommitted**

Run `git diff --check` and record the focused GREEN result in `progress.md`。commitはTask 8のverification / review後に行う。

## Task 5: Remove Raw Echo From Remaining Active Passive Hooks

**Files:**

- Modify: `scripts/hooks/pre-bash-tmux-reminder.js`
- Modify: `scripts/hooks/pre-bash-git-push-reminder.js`
- Modify: `scripts/hooks/quality-gate.js`
- Modify: `scripts/hooks/post-bash-build-complete.js`
- Modify: `scripts/hooks/cost-tracker.js`
- Modify: `scripts/hooks/doc-file-warning.js`
- Modify: `scripts/hooks/session-end-marker.js`
- Modify: `scripts/hooks/post-bash-pr-created.js`
- Modify: `scripts/hooks/check-console-log.js`
- Test: `tests/hooks/hook-output-contract.test.js`

- [ ] **Step 1: Delete raw stdout writes only**

各fileのfinal `process.stdout.write(raw)` / `process.stdout.write(data)` を削除する。`check-console-log.js` のnon-git early branchもsilent exitにする。

変更しないもの:

- warning条件とmessage
- quality gate / metrics / SQLite side effects
- maximum stdin read size
- exit code 0 fail-open behavior
- permission / block decisions（このbatchにdecision hookは含まれない）

- [ ] **Step 2: Keep diagnostics bounded**

現在すでに固定行数のreminderは維持する。variable error messageは8 KiBを超えないようtruncateし、raw stdin、tool output、secret-like payloadをdiagnosticへ追加しない。

- [ ] **Step 3: Run passive contract tests in isolated runtime dirs**

Run:

```bash
node tests/hooks/hook-output-contract.test.js --group=passive
```

Expected: `Failed: 0`。temporary `HOME` 外にmetrics / telemetry / observationsを書かない。

- [ ] **Step 4: Keep the green passive slice uncommitted**

Run `git diff --check` and record the focused GREEN result in `progress.md`。commitはTask 8のverification / review後に行う。

## Task 6: Migrate Legacy Hook Tests To The Correct Contract

**Files:**

- Modify: `tests/hooks/hooks.test.js`
- Test: `tests/hooks/hook-output-contract.test.js`

- [ ] **Step 1: Find stale passthrough expectations for target hooks**

Run:

```bash
rg -n -C 3 "post-edit-format|post-edit-typecheck|post-edit-console-warn|auto-tmux-dev|pre-bash-tmux-reminder|pre-bash-git-push-reminder|quality-gate|post-bash-build-complete|cost-tracker|doc-file-warning|session-end-marker|post-bash-pr-created|check-console-log" tests/hooks/hooks.test.js
```

Within those blocks, classify each case:

- passthrough-only: delete because focused contract test replaces it。
- side-effect / warning / security behavior: keep, change stdout expectation to exact empty string。
- source-shape assertion requiring `process.stdout.write(data)`: delete as obsolete implementation coupling。
- parsed `result.stdout` used only to prove passthrough: replace with side-effect assertion or delete。

- [ ] **Step 2: Enforce the test-pruning ownership boundary**

このtaskで変更するのは、Phase 1 production changeによって誤りになるstdout passthrough assertionsだけとする。

- passthrough-only caseはfocused contract testへ1対1で置換できる場合だけ削除する。
- side-effect / warning / security caseはtest自体を残し、stdout expectationだけをemptyへ直す。
- unrelated duplicate、Round-based edge case、known baseline、suite structureは変更しない。
- test数や代表case数を減らす一般的な整理は、別のtest-suite pruning taskへ残す。

- [ ] **Step 3: Run the legacy hook suite**

Run:

```bash
node tests/hooks/hooks.test.js --allow-known-baseline
```

Expected: `Unexpected failures: 0`。target hooksのpass-through assertionが残らない。

- [ ] **Step 4: Run a stale-contract audit**

Run:

```bash
rg -n "pass(es)? through|pass-through|stdout should exactly match stdin|process\.stdout\.write\((data|raw)\)|JSON\.parse\(result\.stdout\)" tests/hooks/hooks.test.js
```

Expected: target hook blocksについて0件。unrelated hookのmatchはfile/contract別に分類してprogressへ記録し、勝手に変更しない。

- [ ] **Step 5: Keep the test migration uncommitted**

Run `git diff --check` and record `Unexpected failures: 0` in `progress.md`。commitはTask 8のverification / review後に行う。

## Task 7: Document The Hook Output Policy

**Files:**

- Modify: `hooks/README.md`

- [ ] **Step 1: Replace passthrough guidance**

Document:

- no decision / no context: exit 0 with empty stdout。
- structured control: stdout contains one JSON object only。
- diagnostic: bounded stderr、no raw tool input。
- PreToolUse rewrite: `hookSpecificOutput.updatedInput`。
- PostToolUse side-effect-only hook: empty stdout。

- [ ] **Step 2: Link the primary contract**

Add `https://code.claude.com/docs/en/hooks` as the external source. Do not copy a large version-specific schema into the harness。

- [ ] **Step 3: Keep docs uncommitted**

Run `git diff --check`。commitはTask 8のverification / review後に行う。

## Task 8: Verify, Review, And Prepare Active Runtime Promotion

**Files:**

- Create/Update: `plan/harness-simplification/progress.md`
- Create/Update: `plan/harness-simplification/review-summary.md`
- Create/Update: `plan/harness-simplification/verification-summary.md`
- Create/Update after promotion: `plan/harness-simplification/observation-summary.md`

- [ ] **Step 1: Run focused and required suites**

Run:

```bash
node tests/hooks/hook-output-contract.test.js
npm test
npm run test:hooks
npm run test:regression
npm run test:full
git diff --check
```

Expected: all commands exit 0。known baseline mechanismが残る間は `Unexpected failures: 0` を必須とし、known baseline countは別記録する。

- [ ] **Step 2: Replay the registered high-volume path**

Run:

```bash
payload='{"tool_name":"Edit","tool_input":{"file_path":"/tmp/example.ts"}}'
printf '%s' "$payload" | node scripts/hooks/run-with-flags.js 'post:edit:format' 'scripts/hooks/post-edit-format.js' 'standard,strict' | wc -c
printf '%s' "$payload" | node scripts/hooks/run-with-flags.js 'post:edit:typecheck' 'scripts/hooks/post-edit-typecheck.js' 'standard,strict' | wc -c
printf '%s' "$payload" | node scripts/hooks/run-with-flags.js 'post:edit:console-warn' 'scripts/hooks/post-edit-console-warn.js' 'standard,strict' | wc -c
```

Expected after fix: all three stdout byte counts are `0`。

- [ ] **Step 3: Audit protected files and scope**

Run:

```bash
git diff -- settings.json hooks/hooks.json docs/superpowers/specs/2026-08-11-test-suite-pruning-design.md
git status --short --branch
```

Expected: protected filesにPhase 1 implementation diffがない。planned files以外の変更がない。

- [ ] **Step 4: Run an executable code-review loop**

Use `superpowers:requesting-code-review` or an independent reviewer with only these inputs:

- approved Phase 1 plan
- approved design spec
- complete worktree diff
- verification command output

Reviewer must check hook protocol、silent no-op paths、structured auto-tmux output、diagnostic leakage、test ownership boundary、protected files。findingsはseverity付きで `review-summary.md` に記録する。`Findings` がある場合は修正し、focused testsと影響suiteを再実行してreviewを再依頼する。

- [ ] **Step 5: Record verification and accepted review**

`verification-summary.md` にcommand、exit code、test counts、stdout byte evidenceを記録する。`review-summary.md` は実際のreview結果を反映し、unresolved issuesがなくなった場合だけ `Findings: none` とする。両artifactがcompleteになるまでcommitしない。

- [ ] **Step 6: Create one verified candidate commit if explicitly authorized**

```bash
git add scripts/hooks/run-with-flags.js scripts/hooks/run-with-flags-shell.sh scripts/hooks/post-edit-format.js scripts/hooks/post-edit-typecheck.js scripts/hooks/post-edit-console-warn.js scripts/hooks/auto-tmux-dev.js scripts/hooks/pre-bash-tmux-reminder.js scripts/hooks/pre-bash-git-push-reminder.js scripts/hooks/quality-gate.js scripts/hooks/post-bash-build-complete.js scripts/hooks/cost-tracker.js scripts/hooks/doc-file-warning.js scripts/hooks/session-end-marker.js scripts/hooks/post-bash-pr-created.js scripts/hooks/check-console-log.js tests/hooks/hook-output-contract.test.js tests/hooks/hooks.test.js tests/run-all.js hooks/README.md plan/harness-simplification/progress.md plan/harness-simplification/review-summary.md plan/harness-simplification/verification-summary.md
git diff --cached --name-only
git commit -m "fix: enforce silent hook output contracts"
```

Expected: staged namesはapproved Phase 1 inventoryだけ。commitはverification / review artifactsを含み、protected filesを含まない。commit authorizationがなければ停止する。

- [ ] **Step 7: Present promotion checkpoint**

Userへ次を提示する。

- worktree commits / diff
- protected-file comparison
- focused/full verification
- rollback commands
- active runtimeへ反映後に実行するobservation replay

明示承認を得るまでactive `~/.claude` runtimeへmerge / cherry-pickしない。

- [ ] **Step 8: Observe after approved promotion**

active runtimeで1回以上のactual Edit hook eventを実行し、transcript / hook traceのstdout bytesとduplicate raw payload absenceを `observation-summary.md` に記録する。Phase 1 accepted後にPhase 2 plan作成へ進む。

## Final Stop Conditions

- any target hook requires raw stdout as intentional context or decision。
- structured `auto-tmux` output is rejected by current Claude Code runtime。
- safety hook behavior changes。
- target test files changed concurrently after baseline snapshot。
- protected settings diff changes。
- full suite has unexpected failures。
- active runtime promotion includes files outside the approved inventory。
