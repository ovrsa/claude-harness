---
name: skill-create
description: 明示的な依頼でlocal repositoryの反復patternからproject-owned SKILL.md候補を作る。
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# Skill Create

このcommandはmanaged pluginのskillを複製・編集するものではない。対象repository固有で、複数回観測されたpatternだけをproject-owned skill候補にする。

1. 対象範囲と出力directoryをユーザーと確認する。
2. Git history、current conventions、test layoutからevidenceを集める。
3. 一回限りの例とdurable patternを分ける。
4. trigger、action、completion criterionを持つ最小の `SKILL.md` を提案する。
5. user approval後だけfileを作り、validatorまたはrepresentative promptで確認する。

commit、push、PR、global installは別の明示的な依頼があるまで行わない。
