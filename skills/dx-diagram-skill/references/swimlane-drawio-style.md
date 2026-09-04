# draw.io（diagrams.net）スイムレーン スタイル参考

エージェントが `.drawio` を直接編集するときの慣例。必須ではない。開いて手で調整してもよい。

## 軸方向の前提

- 列（横方向）= 担当・システム
- 行（縦方向）= 業務フェーズ
- 時系列は原則として上から下に流す
- フェーズ間の遷移は行ヘッダ間を縦に進む

## グリッド構成の標準（3層分離方式）

マトリクスを「マス＝大きなボックス」で作ると、内部のタスクボックス・矢印・ラベルが衝突する。次の3層を分離して描く。

### 層1: 背景

塗りつぶし矩形を `fillColor` 付き `strokeColor=none` の vertex で描く。

- 全体枠: `fillColor=none;strokeColor=#333333;strokeWidth=2;`
- 列ヘッダ行の背景: `fillColor=#dae8fc;strokeColor=none;`（高さ 40）
- 行ヘッダ列の背景: `fillColor=#fff2cc;strokeColor=none;`（幅 110 前後）
- フェーズ行の背景: 交互に薄黄 `#fffde7` と白 `#ffffff` を敷くと行が視認しやすい

### 層2: 区切り線

1 px の細長い矩形を `fillColor=#aaaaaa;strokeColor=none;` で描く（`edge` ではなく `vertex`）。

- 縦区切り: `width=1`、`height` は枠の全高
- 横区切り: `height=1`、`width` は枠の全幅

### 層3: タスクボックス・判断ノード

各マスの中央に小さく配置する。マス全体を埋めない。

- **1 タスク = 1 ボックス**。1 ボックスに `① ② ③` と複数手順を詰めず、各手順を独立ボックスにして矢印で接続する
- 業務タスク（矩形）: 緑系 `fillColor=#d5e8d4;strokeColor=#82b366;`
- システムタスク（矩形）: 青系 `fillColor=#dae8fc;strokeColor=#6c8ebf;`
- 判断ノード（独立ひし形）: 橙系 `rhombus;fillColor=#ffe6cc;strokeColor=#d79b00;fontSize=11;align=center;verticalAlign=middle;`
  - 推奨サイズ: 幅 120 / 高さ 60〜70
  - タスクボックス内に `◇` 文字を埋め込まず、独立ノードとして配置する
  - OK / NG（Yes / No）の分岐は矢印ラベルで識別する
- 空きマス: タスクボックスを置かず空白のままにする（`未関与` `結果待ち` `参照のみ` などのプレースホルダラベルを置かない）
- 例外的にボトルネック表現が必要な空白のみ灰小ラベル `fillColor=#f0f0f0;strokeColor=#bbbbbb;fontColor=#777777;fontSize=10;`（例: `48h 待機` `承認停滞`）
- タスクボックス推奨サイズ: 幅 140〜180 / 高さ 36〜44（1 タスク 1 行）
- マス内の余白: 上下左右に 15〜25 px。矢印・ラベルが通る空きを確保する
- レーン内のタスク間隔: 縦に 20〜30 px の溝（接続矢印が通るスペース）

### ヘッダラベル

ヘッダのテキストは `text;html=1;align=center;verticalAlign=middle;fontStyle=1;fontSize=11;` で `fillColor` を指定しない。背景は層1の塗りつぶしで担う。

## エッジの parent と順序

- すべての `mxCell` は `<root>` 直下の同一 `parent="1"` が一般的。
- セルの下に線を通したい: `edge="1"` の `mxCell` を、接続先の vertex より前に並べる（先に定義＝下層に描画されやすい。環境によっては要確認）。

## 接続点（orthogonal）

- セルからセルへ: `source="c00" target="c20"` と `edge="1"`。
- 上から下（同レーン内の主経路）: `exitX=0.5;exitY=1;entryX=0.5;entryY=0;`
- 下から上（戻り・例外復帰）: `exitX=0.5;exitY=0;entryX=0.5;entryY=1;`
- 側面から側面（レーン跨ぎの handoff）: `exitX=1;exitY=0.5;entryX=0;entryY=0.5;` など（0〜1 の相対座標）

## スタイル例（文字列はセミコロン区切り）

**フェーズ境界（灰・点線・行ヘッダ間）**

```
edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=classic;strokeColor=#888888;dashed=1;dashPattern=8 6;strokeWidth=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;
```

**主経路（青・太・塗り矢じり・上→下）レーンをまたぐ handoff 用**

```
edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=blockThin;endFill=1;strokeWidth=3;strokeColor=#1a73e8;fontSize=10;fontColor=#1565c0;labelBackgroundColor=#ffffff;exitX=0.5;exitY=1;entryX=0.5;entryY=0;
```

**レーン内のタスク間接続（青・細・ラベルなし）**

```
edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=blockThin;endFill=1;strokeWidth=2;strokeColor=#1a73e8;exitX=0.5;exitY=1;entryX=0.5;entryY=0;
```

**前提（紫・破線・開矢じり・レーン跨ぎ）**

```
edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=open;endFill=0;strokeWidth=2;strokeColor=#5c6bc0;dashed=1;dashPattern=4 4;fontSize=9;fontColor=#3949ab;labelBackgroundColor=#ffffff;exitX=1;exitY=0.5;entryX=0;entryY=0.5;
```

**停止・例外経路（赤・破線・上→下）**

```
edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=classic;strokeWidth=2;strokeColor=#b85450;dashed=1;dashPattern=6 4;fontSize=9;fontColor=#b85450;labelBackgroundColor=#ffffff;exitX=0.5;exitY=1;entryX=0.5;entryY=0;
```

**判断ノード（独立ひし形）**

```
rhombus;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;fontSize=11;align=center;verticalAlign=middle;
```

**判断ノードからの NG / 差戻し矢印（赤・破線・開矢じり）**

```
edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=open;endFill=0;strokeWidth=2;strokeColor=#d32f2f;dashed=1;dashPattern=4 4;fontSize=10;fontColor=#c62828;labelBackgroundColor=#ffffff;
```

## ラベル

- エッジの `value="..."` に日本語ラベル。長い場合は `fontSize=9` に下げる。
- 矢印ラベルには `labelBackgroundColor=#ffffff;` を必ず付ける。タスクボックスや背景塗りの上を通ってもラベル文字が埋もれない。
- 矢印はタスクボックス間（vertex 間）でのみ接続する。背景セル・グリッド線を `source` / `target` にしない。
- 本文に Markdown の `**` は使わない（HTML モードでそのまま出る）。強調は「」や改行で足す。

## 改行

- `value` 属性内の改行は `&#xa;`（XML エンティティ）。
