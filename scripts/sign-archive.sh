#!/usr/bin/env bash
# El archivo de Xcode sale sin firmar (ver ios.yml) y la exportación toma los entitlements de la
# firma de cada binario: sin ellos, la app y el widget perderían el App Group que comparten.
# Firma ad hoc, sin certificado, solo para dejarlos escritos; la firma buena la pone la exportación.
set -euo pipefail

archive="$1"
app="$archive/Products/Applications/App.app"
widget="$app/PlugIns/TasksWidget.appex"

sign() {
  codesign --force --sign - --timestamp=none --generate-entitlement-der "$@"
}

# De dentro afuera: codesign no firma un paquete con código anidado sin firmar.
while IFS= read -r -d '' item; do
  sign "$item"
done < <(find "$app" -depth \( -name '*.framework' -o -name '*.dylib' \) -print0)

sign --entitlements ios/App/TasksWidget/TasksWidget.entitlements "$widget"
sign --entitlements ios/App/App/App.entitlements "$app"

for bundle in "$widget" "$app"; do
  echo "Entitlements de ${bundle##*/}:"
  codesign -d --entitlements - "$bundle"
done
