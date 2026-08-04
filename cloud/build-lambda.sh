#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build/lambda"
ARCHIVE="$ROOT_DIR/build/score-writer.zip"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/scoreboard_core"
cp "$ROOT_DIR/cloud/score_writer.py" "$BUILD_DIR/score_writer.py"
cp "$ROOT_DIR/pi/scoreboard_core/"*.py "$BUILD_DIR/scoreboard_core/"

rm -f "$ARCHIVE"
(
  cd "$BUILD_DIR"
  zip -q -r "$ARCHIVE" .
)

echo "Lambda package prepared at $ARCHIVE"
