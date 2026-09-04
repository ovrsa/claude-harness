#!/usr/bin/env bash
# Scheduled entrypoint for llm-daily-digest.
# Fetches all sources via fetch.py, then invokes `claude -p` in bare mode
# with the editorial system prompt to produce the final Markdown.
#
# Run manually:
#   ~/.claude/skills/llm-daily-digest/run.sh
# Or via launchd (see com.kyo.llm-daily-digest.plist).

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$SKILL_DIR/config.json"
SYSTEM_PROMPT="$SKILL_DIR/system-prompt.md"
LOG_DIR="$HOME/Library/Logs/llm-daily-digest"
TMP_DIR="${TMPDIR:-/tmp}"

mkdir -p "$LOG_DIR"

DATE="$(date +%Y-%m-%d)"
RAW_FILE="$TMP_DIR/llm-digest-raw-$DATE.json"
LOG_FILE="$LOG_DIR/run-$DATE.log"

# Resolve config values via python (stdlib only)
OUTPUT_DIR="$(python3 -c "import json,os,sys; c=json.load(open('$CONFIG')); print(os.path.expanduser(c['output_dir']))")"
MODEL="$(python3 -c "import json,sys; c=json.load(open('$CONFIG')); print(c.get('summary_model','claude-sonnet-4-6'))")"

if [[ "$OUTPUT_DIR" == "PLEASE_SET_OUTPUT_DIR" || -z "$OUTPUT_DIR" ]]; then
  echo "[run] ERROR: output_dir not set in $CONFIG" | tee -a "$LOG_FILE" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
OUT_FILE="$OUTPUT_DIR/$DATE.md"

{
  echo "==== llm-daily-digest run: $(date -Iseconds) ===="
  echo "[run] config:        $CONFIG"
  echo "[run] output:        $OUT_FILE"
  echo "[run] raw:           $RAW_FILE"
  echo "[run] model:         $MODEL"
} | tee -a "$LOG_FILE"

# Step 1: fetch
echo "[run] fetching sources..." | tee -a "$LOG_FILE"
python3 "$SKILL_DIR/fetch.py" --config "$CONFIG" --out "$RAW_FILE" \
  2>>"$LOG_FILE"

if [[ ! -s "$RAW_FILE" ]]; then
  echo "[run] ERROR: fetch produced empty output" | tee -a "$LOG_FILE" >&2
  exit 2
fi

# Step 2: summarize via claude -p (no API key needed - uses logged-in session)
echo "[run] invoking claude -p..." | tee -a "$LOG_FILE"

PROMPT="今日の LLM/Coding Agent ダイジェストを生成してください。

入力 (RAW_FILE): $RAW_FILE
出力 (OUT_FILE): $OUT_FILE

system-prompt に従い、Read で入力を読み、Write で出力ファイルを生成して終了してください。"

# --permission-mode acceptEdits: auto-accept Read/Write within --allowedTools
# --allowedTools: minimum surface for this job
# --append-system-prompt-file: prepends editorial role definition
# --add-dir: grant access to input JSON dir and output dir
# (no --bare: bare requires ANTHROPIC_API_KEY; we rely on the logged-in
#  Claude Code session auth via keychain/OAuth)
claude -p \
  --model "$MODEL" \
  --permission-mode acceptEdits \
  --allowedTools "Read,Write" \
  --append-system-prompt-file "$SYSTEM_PROMPT" \
  --add-dir "$TMP_DIR" \
  --add-dir "$OUTPUT_DIR" \
  --no-session-persistence \
  --output-format text \
  "$PROMPT" \
  2>>"$LOG_FILE" | tee -a "$LOG_FILE" >/dev/null

if [[ ! -s "$OUT_FILE" ]]; then
  echo "[run] ERROR: claude did not produce $OUT_FILE" | tee -a "$LOG_FILE" >&2
  exit 3
fi

echo "[run] SUCCESS: $OUT_FILE ($(wc -l <"$OUT_FILE") lines)" | tee -a "$LOG_FILE"

# Step 3: cleanup raw file (keep logs for debugging)
rm -f "$RAW_FILE"
