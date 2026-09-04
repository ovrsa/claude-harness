#!/usr/bin/env bash
# Local replacement for `npx ccstatusline`. Reads the Claude Code status JSON from
# stdin and reproduces the current 4-line layout without a network fetch.
# Segment -> source mapping (reverse-engineered from ccstatusline 2.2.27 dist bundle):
#   model / tokens / context %   -> context_window.*
#   git branch / changes         -> local git commands (not in stdin JSON)
#   worktree name                -> worktree.name (stdin JSON)
#   session clock                -> cost.total_duration_ms
#   reset timers / usage %       -> rate_limits.five_hour / seven_day

set -u

input=$(cat)

eval "$(jq -r '
  . as $j
  | ($j.context_window.current_usage) as $cu
  | {
      cwd: ($j.cwd // $j.workspace.current_dir // ""),
      model_raw: (if ($j.model|type)=="object" then ($j.model.display_name // $j.model.id // "") else ($j.model // "") end),
      win_size: ($j.context_window.context_window_size // 200000),
      cur_in: (if ($cu|type)=="object" then ($cu.input_tokens // 0) else 0 end),
      cur_creation: (if ($cu|type)=="object" then ($cu.cache_creation_input_tokens // 0) else 0 end),
      cur_read: (if ($cu|type)=="object" then ($cu.cache_read_input_tokens // 0) else 0 end),
      tot_in: ($j.context_window.total_input_tokens // 0),
      tot_out: ($j.context_window.total_output_tokens // 0),
      dur_ms: ($j.cost.total_duration_ms // 0),
      five_pct: ($j.rate_limits.five_hour.used_percentage // ""),
      five_reset: ($j.rate_limits.five_hour.resets_at // ""),
      seven_pct: ($j.rate_limits.seven_day.used_percentage // ""),
      seven_reset: ($j.rate_limits.seven_day.resets_at // ""),
      worktree_name: ($j.worktree.name // "")
    }
  | to_entries[]
  | "\(.key)=" + (.value | tostring | @sh)
' <<< "$input")"

cd "$cwd" 2>/dev/null || true

branch=$(git symbolic-ref --short HEAD 2>/dev/null)
read -r ins del < <(git diff HEAD --numstat 2>/dev/null | awk '{ins+=$1; del+=$2} END{print ins+0, del+0}')

c() {
  local code
  case "$1" in
    cyan) code=36 ;;
    white) code=37 ;;
    yellow) code=33 ;;
    green) code=32 ;;
    brightBlue) code=94 ;;
    brightCyan) code=96 ;;
    brightGreen) code=92 ;;
    *) code=0 ;;
  esac
  printf '\033[%sm%s\033[0m' "$code" "$2"
}

fmt_tokens() {
  awk -v n="$1" 'BEGIN{
    if (n >= 999500) printf "%.1fM", n/1000000;
    else if (n >= 1000) printf "%.1fk", n/1000;
    else printf "%d", n;
  }'
}

fmt_pct() {
  awk -v n="$1" 'BEGIN{printf "%.1f", n}'
}

# $1=seconds remaining/elapsed, $2="days"|"nodays"
fmt_duration() {
  awk -v s="$1" -v mode="$2" 'BEGIN{
    if (s < 0) s = 0;
    tm = int(s/60);
    if (tm < 1) { print "<1m"; exit }
    h = int(tm/60); m = tm%60; d = 0;
    if (mode == "days") { d = int(h/24); h = h%24 }
    out = "";
    if (d > 0) out = out d "d ";
    if (h > 0) out = out h "hr ";
    if (m > 0) out = out m "m ";
    gsub(/ +$/, "", out);
    if (out == "") out = "0m";
    print out;
  }'
}

now=$(date +%s)
model=$(printf '%s' "$model_raw" | sed -E 's/ *\([^)]*\)$//')
ctx_tokens=$(( cur_in + cur_creation + cur_read ))
usable=$(awk -v w="$win_size" 'BEGIN{printf "%d", w*0.8}')
ctx_pct=$(awk -v c="$ctx_tokens" -v u="$usable" 'BEGIN{
  if (u <= 0) { print 0; exit }
  p = c/u*100; if (p > 100) p = 100;
  printf "%.1f", p;
}')
session_clock=$(fmt_duration "$(( dur_ms / 1000 ))" nodays)

join() {
  local out="" first=1
  for p in "$@"; do
    if [ "$first" -eq 1 ]; then out="$p"; first=0; else out="${out}  |  ${p}"; fi
  done
  printf '%s' "$out"
}

line1=()
line1+=("$(c cyan "Model: ${model}")")
line1+=("$(c white "In: $(fmt_tokens "$tot_in")")")
line1+=("$(c white "Out: $(fmt_tokens "$tot_out")")")
line1+=("$(c brightBlue "Ctx(u) Used: ${ctx_pct}%")")

line2=()
[ -n "$branch" ] && line2+=("$(c yellow "⎇ ${branch}")")
[ -n "$worktree_name" ] && line2+=("$(c green "𖠰 ${worktree_name}")")
line2+=("$(c brightBlue "(+${ins},-${del})")")
line2+=("$(c white "Session: ${session_clock}")")

line3=("$(c white "cwd: ${cwd}")")

line4=()
if [ -n "$five_reset" ]; then
  remain=$(awk -v r="$five_reset" -v n="$now" 'BEGIN{print r-n}')
  line4+=("$(c brightCyan "Reset: $(fmt_duration "$remain" nodays)")")
fi
[ -n "$five_pct" ] && line4+=("$(c brightCyan "Session: $(fmt_pct "$five_pct")%")")
if [ -n "$seven_reset" ]; then
  remain7=$(awk -v r="$seven_reset" -v n="$now" 'BEGIN{print r-n}')
  line4+=("$(c brightGreen "Weekly Reset: $(fmt_duration "$remain7" days)")")
fi
[ -n "$seven_pct" ] && line4+=("$(c brightGreen "Weekly: $(fmt_pct "$seven_pct")%")")

join "${line1[@]}"; echo
join "${line2[@]}"; echo
join "${line3[@]}"; echo
if [ "${#line4[@]}" -gt 0 ]; then join "${line4[@]}"; echo; fi
