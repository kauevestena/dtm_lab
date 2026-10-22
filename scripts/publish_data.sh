#!/usr/bin/env bash
# Uploads the data snapshot to the GitHub release that the Pages workflow reads.
# Usage: scripts/publish_data.sh <cooper.copc.laz> <products dir> [tag=data-v1]
# A snapshot is immutable: new data gets a new tag (data-v2, …) and pages.yml is pointed at it.
set -euo pipefail
COPC=$1; PRODUCTS=$2; TAG=${3:-data-v1}
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
tar -C "$PRODUCTS" -czf "$TMP/products.tar.gz" .
cp "$COPC" "$TMP/cooper.copc.laz"
(cd "$TMP" && sha256sum cooper.copc.laz products.tar.gz > SHA256SUMS)
cat "$TMP/SHA256SUMS"
gh release create "$TAG" --title "Data snapshot $TAG" \
  --notes "COPC of Nuvem_Cooper_Matriz_2026_07_17 and the whole-cloud products of scripts/build_products.py. See data/README.md." \
  "$TMP/cooper.copc.laz" "$TMP/products.tar.gz" "$TMP/SHA256SUMS"
