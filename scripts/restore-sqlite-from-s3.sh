#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: scripts/restore-sqlite-from-s3.sh <s3_uri_to_sqlite_gz> <output_sqlite_path>"
  exit 1
fi

S3_URI="$1"
OUTPUT_SQLITE="$2"
WORK_DIR="$(mktemp -d)"
GZ_PATH="$WORK_DIR/restore.sqlite.gz"
CHECKSUM_PATH="$GZ_PATH.sha256"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "Downloading backup candidate..."
aws s3 cp "$S3_URI" "$GZ_PATH"

echo "Downloading checksum candidate..."
aws s3 cp "$S3_URI.sha256" "$CHECKSUM_PATH"

echo "Validating checksum..."
(cd "$WORK_DIR" && shasum -a 256 -c "$(basename "$CHECKSUM_PATH")")

echo "Decompressing restore candidate..."
gunzip -c "$GZ_PATH" > "$OUTPUT_SQLITE"

echo "Running SQLite integrity check..."
sqlite3 "$OUTPUT_SQLITE" "PRAGMA integrity_check;"

echo "Restore candidate written to $OUTPUT_SQLITE"
echo "Review manually before replacing the active DATABASE_PATH."
