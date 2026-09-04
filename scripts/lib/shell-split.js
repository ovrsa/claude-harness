'use strict';

// シェルコマンドを「判定可能な単位」に割るための最小限の分割器。
//
// 目的はシェルの意味論の再現ではなく、許可判定が先頭トークンだけを見て
// 後続を素通りさせるのを防ぐこと。正確に読めない構文は analyzable=false を返し、
// 呼び出し側が閉じる方（ask）に倒せるようにする。

// これらを含む場合、分割結果は当てにならない。展開後に何が動くかは静的に読めない。
//
// 部分文字列で判定してよいのは、シェルの構文そのものである3つだけ。
// eval / exec / source / `.` はコマンド名なので、ここではなく呼び出し側が
// コマンド名として扱う（`find . -exec` の `-exec` や `cat source.txt` を
// 誤検出しないため。2026-08-18 に実際に踏んだ）。
const OPAQUE_CONSTRUCTS = [
  /\$\(/,  // command substitution
  /`/,      // backtick substitution
  /<\(/,    // process substitution
];

// 引数の中身が実行されるコマンド。静的には何が動くか読めないので閉じる側に倒す。
const OPAQUE_COMMANDS = new Set(['eval', 'exec', 'source', '.']);

const SEPARATORS = [';', '&&', '||', '|', '\n', '&'];

function hasOpaqueConstruct(command) {
  return OPAQUE_CONSTRUCTS.some(pattern => pattern.test(command));
}

// 引用符の内側を除いて区切り文字で割る。引用符が閉じていなければ analyzable=false。
function splitShellSegments(command) {
  const value = String(command || '');
  const segments = [];
  let current = '';
  let quote = null;
  let i = 0;

  while (i < value.length) {
    const ch = value[i];

    if (quote) {
      current += ch;
      // シングルクォート内ではバックスラッシュはリテラル
      if (ch === '\\' && quote === '"' && i + 1 < value.length) {
        current += value[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      i += 1;
      continue;
    }

    if (ch === '\\' && i + 1 < value.length) {
      current += ch + value[i + 1];
      i += 2;
      continue;
    }

    const separator = SEPARATORS.find(sep => value.startsWith(sep, i));
    if (separator) {
      segments.push(current);
      current = '';
      i += separator.length;
      continue;
    }

    current += ch;
    i += 1;
  }
  segments.push(current);

  const trimmed = segments.map(segment => segment.trim()).filter(Boolean);

  return {
    segments: trimmed,
    // 引用符が閉じていない場合も読めていないので閉じる側に倒す
    analyzable: quote === null && !hasOpaqueConstruct(value),
  };
}

// argv 相当への分解。引用符は外すが、判定に使うのはコマンド名とフラグだけなので
// 変数展開やグロブは解決しない。
function tokenize(segment) {
  const tokens = [];
  let current = '';
  let quote = null;
  let started = false;

  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started || current) tokens.push(current);
      current = '';
      started = false;
      continue;
    }
    current += ch;
  }
  if (started || current) tokens.push(current);
  return tokens.filter(token => token.length > 0 || false);
}

// 環境変数の前置き（FOO=bar cmd）と絶対パスを剥がしたコマンド名。
function commandNameOf(tokens) {
  for (const token of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
    return token.split('/').pop().toLowerCase();
  }
  return '';
}

module.exports = {
  OPAQUE_COMMANDS,
  splitShellSegments,
  tokenize,
  commandNameOf,
};
