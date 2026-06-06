#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: migrate-flow-js-canonical.sh [--remove-yaml] <libs/flows-dir>

Marks existing .flow.js files as canonical for the FlowScript spike.
Without --remove-yaml it only reports pairs. With --remove-yaml it deletes
the matching .flow.yaml files when a .flow.js sibling exists.

This script intentionally does not convert YAML-only flows. Generate the
.flow.js first through the Flow engine flow-code API, then rerun this script.
USAGE
}

remove_yaml=false
if [[ "${1:-}" == "--remove-yaml" ]]; then
  remove_yaml=true
  shift
fi

flows_dir="${1:-}"
if [[ -z "$flows_dir" || "${flows_dir:-}" == "-h" || "${flows_dir:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! -d "$flows_dir" ]]; then
  echo "No such flows directory: $flows_dir" >&2
  exit 1
fi

found=0
removed=0
while IFS= read -r -d '' code_file; do
  found=$((found + 1))
  yaml_file="${code_file%.flow.js}.flow.yaml"
  if [[ -f "$yaml_file" ]]; then
    if $remove_yaml; then
      rm "$yaml_file"
      removed=$((removed + 1))
      printf 'canonical: %s (removed %s)\n' "$code_file" "$yaml_file"
    else
      printf 'paired:    %s (yaml %s)\n' "$code_file" "$yaml_file"
    fi
  else
    printf 'canonical: %s\n' "$code_file"
  fi
done < <(find "$flows_dir" -maxdepth 1 -type f -name '*.flow.js' -print0 | sort -z)

yaml_only=0
while IFS= read -r -d '' yaml_file; do
  code_file="${yaml_file%.flow.yaml}.flow.js"
  if [[ ! -f "$code_file" ]]; then
    yaml_only=$((yaml_only + 1))
    printf 'yaml-only: %s\n' "$yaml_file"
  fi
done < <(find "$flows_dir" -maxdepth 1 -type f -name '*.flow.yaml' -print0 | sort -z)

printf 'summary: %d flow.js, %d yaml-only, %d yaml removed\n' "$found" "$yaml_only" "$removed"
