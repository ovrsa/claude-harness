#!/usr/bin/env node
/**
 * Run all tests
 *
 * Usage: node tests/run-all.js
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// runs/ は git 追跡なので、テストが実リポジトリの run 記録に
// フィクスチャを混ぜないようにする（scripts/lib/run-record.js）。
process.env.CLAUDE_DISABLE_RUN_RECORD = '1';

const testsDir = __dirname;
const testFiles = [
  { file: 'lib/utils.test.js' },
  { file: 'lib/package-manager.test.js' },
  { file: 'lib/session-manager.test.js' },
  { file: 'lib/session-aliases.test.js' },
  { file: 'lib/project-detect.test.js' },
  { file: 'lib/task-artifacts.test.js' },
  { file: 'lib/transcript-log.test.js' },
  { file: 'lib/run-record.test.js' },
  { file: 'lib/run-log.test.js' },
  { file: 'lib/lifecycle-record.test.js' },
  { file: 'scripts/export-telemetry-archive.test.js' },
  { file: 'lib/trace-status.test.js' },
  { file: 'lib/permission-resolver.test.js' },
  { file: 'lib/permission-segments.test.js' },
  { file: 'lib/pipeline-evidence.test.js' },
  { file: 'lib/harness-status.test.js' },
  { file: 'lib/telemetry-health.test.js' },
  { file: 'lib/triage-loop.test.js' },
  { file: 'hooks/hooks.test.js' },
  { file: 'hooks/suggest-compact.test.js' },
  { file: 'hooks/git-push-guard.test.js' },
  { file: 'hooks/draft-issue-advisory.test.js' },
  { file: 'integration/hooks.test.js' },
  { file: 'ci/validators.test.js' },
  { file: 'scripts/claw.test.js' },
  { file: 'scripts/pipeline-runner.test.js' },
  { file: 'scripts/task-completion.test.js' },
  { file: 'scripts/resolve-tracker.test.js' },
  { file: 'scripts/task-goal.test.js' },
  { file: 'scripts/execution-graph.test.js' },
  { file: 'scripts/graph-human-wait.test.js' },
  { file: 'scripts/graph-standard.test.js' },
  { file: 'scripts/provider-adapters.test.js' },
  { file: 'scripts/prompt-assemble.test.js' },
  { file: 'scripts/task-queue.test.js' },
  { file: 'scripts/workflow-doctor.test.js' },
  { file: 'scripts/harness-status.test.js' },
  { file: 'scripts/setup-package-manager.test.js' },
  { file: 'scripts/skill-create-output.test.js' },
  { file: 'scripts/eval-batch.test.js' },
  { file: 'scripts/runs-cli.test.js' },
  { file: 'scripts/runtime-session.test.js' },
  { file: 'scripts/sync-codex-bridge.test.js' },
  { file: 'scripts/statusline.test.js' },
  { file: 'lib/health-loop.test.js' },
  { file: 'lib/guardrail-candidates.test.js' },
  // 走らせない場合は必ず理由を書く。黙って一覧から外すと「全部通っている」に見えてしまう。
  // 2026-08-18 時点でスキップはゼロ。engine-adapter は provider-adapters に役割を譲って
  // いたので撤去した（docs/design/2026-08-18-retire-dormant-subsystems.md）。
];

const BOX_W = 58; // inner width between ║ delimiters
const boxLine = (s) => `║${s.padEnd(BOX_W)}║`;

console.log('╔' + '═'.repeat(BOX_W) + '╗');
console.log(boxLine('           Everything Claude Code - Test Suite'));
console.log('╚' + '═'.repeat(BOX_W) + '╝');
console.log();

let totalPassed = 0;
let totalFailed = 0;
let totalTests = 0;
const skipped = [];
const unparsed = [];

for (const testEntry of testFiles) {
  const testFile = typeof testEntry === 'string' ? testEntry : testEntry.file;
  const testArgs = typeof testEntry === 'string' ? [] : (testEntry.args || []);
  const testPath = path.join(testsDir, testFile);

  if (typeof testEntry !== 'string' && testEntry.skip) {
    console.log(`\n⚠ Skipping ${testFile}: ${testEntry.skip}`);
    skipped.push({ file: testFile, reason: testEntry.skip });
    continue;
  }

  if (!fs.existsSync(testPath)) {
    console.log(`⚠ Skipping ${testFile} (file not found)`);
    skipped.push({ file: testFile, reason: 'file not found' });
    continue;
  }

  console.log(`\n━━━ Running ${testFile} ━━━`);

  const result = spawnSync(process.execPath, [testPath, ...testArgs], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';

  // Show both stdout and stderr so hook warnings are visible
  if (stdout) console.log(stdout);
  if (stderr) console.log(stderr);

  // Parse results from combined output
  const combined = stdout + stderr;
  // 必ず「最後の」一致を採る。途中経過として `Passed: N` を出すファイルがあり、
  // 最初の一致を採ると総数が実態より小さくなる。実際、この修正前の総計は
  // 個別実行の合計より28件少なかった。
  const lastMatch = (re) => {
    const all = [...combined.matchAll(re)];
    return all.length > 0 ? all[all.length - 1] : null;
  };
  const passedMatch = lastMatch(/Passed:\s*(\d+)/g);
  const failedMatch = lastMatch(/Failed:\s*(\d+)/g);
  // `=== Results: 28 passed, 0 failed ===` は上の2本のどちらにも当たらない。
  // 当たらないまま加算をスキップすると、そのファイルは通っているのに総数から消える。
  const lowercaseMatch = lastMatch(/Results:\s*(\d+)\s+passed,\s*(\d+)\s+failed/g);

  let parsedPassed = null;
  let parsedFailed = null;
  if (passedMatch || failedMatch) {
    parsedPassed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    parsedFailed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
  } else if (lowercaseMatch) {
    parsedPassed = parseInt(lowercaseMatch[1], 10);
    parsedFailed = parseInt(lowercaseMatch[2], 10);
  }

  if (parsedPassed === null) {
    // 総数が実態より小さくなる。件数を根拠に使う場面があるので黙って進めない。
    console.log(`⚠ ${testFile}: 件数を読み取れなかったため総数に含まれていない`);
    unparsed.push(testFile);
  } else {
    totalPassed += parsedPassed;
    totalFailed += parsedFailed;
  }

  // 子プロセスの終了コードは常に総計へ反映する。出力の取りこぼしで
  // "Failed: 0" と読めてしまっても、落ちたスイートは落ちたままにする。
  if (result.status !== 0 && !(parsedFailed !== null && parsedFailed > 0)) {
    console.log(`⚠ ${testFile} exited with code ${result.status} but reported no failures`);
    totalFailed += 1;
  }
}

totalTests = totalPassed + totalFailed;

console.log('\n╔' + '═'.repeat(BOX_W) + '╗');
console.log(boxLine('                     Final Results'));
console.log('╠' + '═'.repeat(BOX_W) + '╣');
console.log(boxLine(`  Total Tests: ${String(totalTests).padStart(4)}`));
console.log(boxLine(`  Passed:      ${String(totalPassed).padStart(4)}  ✓`));
console.log(boxLine(`  Failed:      ${String(totalFailed).padStart(4)}  ${totalFailed > 0 ? '✗' : ' '}`));
console.log(boxLine(`  Skipped files: ${String(skipped.length).padStart(2)}`));
console.log(boxLine(`  Uncounted files: ${String(unparsed.length).padStart(2)}`));
console.log('╚' + '═'.repeat(BOX_W) + '╝');

// スキップは常に出力する。件数だけを見て「全部覆えている」と読まれるのを防ぐ。
if (skipped.length > 0) {
  console.log('\nSkipped test files:');
  for (const s of skipped) {
    console.log(`  - ${s.file}: ${s.reason}`);
  }
}

// Total Tests を根拠として引用する前に、取りこぼしの有無が見えている必要がある。
if (unparsed.length > 0) {
  console.log('\nUncounted test files (passed/failed 行を読み取れず総数に含まれていない):');
  for (const file of unparsed) {
    console.log(`  - ${file}`);
  }
}

process.exit(totalFailed > 0 ? 1 : 0);
