#!/usr/bin/env bash
# Phase 0: time each PDAL ground filter on the whole cloud (no output written).
# Usage: scripts/time_filters.sh <cloud.copc.laz> <log dir>   (needs PDAL >= 2.6 on PATH)
set -euo pipefail
IN=$1; OUT=$2; mkdir -p "$OUT"
declare -A F=(
  [smrf]='{"type":"filters.smrf"}'
  [pmf]='{"type":"filters.pmf","cell_size":1.0,"max_window_size":33,"slope":1.0,"initial_distance":0.15,"max_distance":2.5,"exponential":true}'
  [csf]='{"type":"filters.csf"}'
)
for name in smrf pmf csf; do
  cat > "$OUT/$name.json" <<JSON
[ {"type":"readers.copc","filename":"$IN","threads":8},
  {"type":"filters.ferry","dimensions":"Classification=>RefClass"},
  {"type":"filters.assign","value":"Classification = 0"},
  ${F[$name]},
  {"type":"filters.stats","dimensions":"Classification","enumerate":"Classification"},
  {"type":"writers.null"} ]
JSON
  echo "== $name $(date -Is)"
  /usr/bin/time -v pdal pipeline "$OUT/$name.json" --metadata "$OUT/$name.meta.json" > "$OUT/$name.log" 2>&1 || echo "$name FAILED"
  grep -E "Elapsed|Maximum resident" "$OUT/$name.log"
done
