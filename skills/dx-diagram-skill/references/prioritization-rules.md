# Prioritization Rules

## 目的

改善案や実装スライスを、図の見映えではなく価値とリスクで並べる。

## いつ使うか

- 改善案が複数ある
- 全部は一度にやれない
- 改善後図のどこから着手するか決めたい

## 基本観点

- business value
- effort
- risk
- dependency
- coordination cost
- data readiness

## 使い分け

- hard deadline や外部制約が強い: `WSJF`
- 比較対象が多く、データもある: `RICE`
- ざっくり優先順位だけ付けたい: `ICE`
- スコープ交渉が主目的: `MoSCoW`

## ルール

- 図の主経路に載せる改善は、優先順位の理由を言えるものだけにする
- 「よさそう」だけで改善後図を固定しない
- KPI が定義できない改善は優先度を下げてよい
- 着手順と最終理想像を混同しない
