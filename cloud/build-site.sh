#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build/site"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cp -R "$ROOT_DIR/github-pages/." "$BUILD_DIR/"
cp "$ROOT_DIR/cloud/config.production.js" "$BUILD_DIR/config.js"

echo "Static AWS site prepared at $BUILD_DIR"
