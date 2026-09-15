#!/usr/bin/env bash
# xcodebuild con el log completo en build/xcodebuild.log. Si falla, enseña solo los errores:
# el log entero tiene decenas de miles de líneas.
set -uo pipefail

mkdir -p build
log="build/xcodebuild.log"

if xcodebuild "$@" >>"$log" 2>&1; then
  tail -n 15 "$log"
else
  status=$?
  echo "::group::Errores"
  grep -E "(error|fatal error):" "$log" | sort -u | head -n 80
  echo "::endgroup::"
  tail -n 40 "$log"
  exit "$status"
fi
