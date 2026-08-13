#!/bin/bash
# Bump the VGraph VS Code extension's version and rebuild artifacts.
# Does NOT commit, tag, push, or publish — those are manual on purpose so the
# version bump can be folded into whatever commit makes sense.
#
# Usage:
#   ./release.sh                  # auto patch bump (e.g. 0.1.0 → 0.1.1)
#   ./release.sh --minor          # auto minor bump (e.g. 0.1.0 → 0.2.0)
#   ./release.sh --major          # auto major bump (e.g. 0.1.0 → 1.0.0)
#   ./release.sh <version>        # explicit version (e.g. 0.1.4)
#   VGRAPH_REPO=/path/to/VGraph ./release.sh [args]
#
# What it does:
#   1. Picks the next version (patch unless --minor/--major/explicit given)
#   2. (Optional) Refreshes VGraphWasm.wasm from $VGRAPH_REPO
#   3. Builds out/extension.js and packages the .vsix
#   4. Writes the new version into package.json
#   5. Prints the artifacts and the suggested git/publish commands
#
# Prerequisites:
#   - npm (and node_modules; auto-installed on first run)
#   - For publishing to the Marketplace later: vsce + publisher PAT

set -euo pipefail

# ---- 1. Parse / derive version --------------------------------------------

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR"

CURRENT=$(node -p "require('./package.json').version")

ARG="${1:-}"
case "$ARG" in
    ""|--patch) BUMP=patch ;;
    --minor)    BUMP=minor ;;
    --major)    BUMP=major ;;
    v*)
        echo "Error: version must not start with 'v' (use 0.1.1, not v0.1.1)"
        exit 1
        ;;
    *)
        if ! [[ "$ARG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "Error: version must be semver (e.g. 0.1.1) or one of --patch/--minor/--major, got '$ARG'"
            exit 1
        fi
        BUMP=explicit
        VERSION="$ARG"
        ;;
esac

if [[ "$BUMP" != "explicit" ]]; then
    VERSION=$(node -e "
        const [maj, min, pat] = '$CURRENT'.split('.').map(Number);
        const bump = '$BUMP';
        const v = bump === 'major' ? [maj+1, 0, 0]
                : bump === 'minor' ? [maj, min+1, 0]
                :                    [maj, min, pat+1];
        console.log(v.join('.'));
    ")
fi

echo "Bumping $CURRENT → $VERSION  ($BUMP)"

# ---- 2. (Optional) Copy VGraphWasm.wasm from the VGraph monorepo ----------

if [[ -n "${VGRAPH_REPO:-}" ]]; then
    if [[ ! -d "$VGRAPH_REPO" ]]; then
        echo "Error: VGRAPH_REPO ('$VGRAPH_REPO') does not exist."
        exit 1
    fi

    SRC_WASM="$VGRAPH_REPO/website/Package/VGraphWasm.wasm"
    if [[ ! -f "$SRC_WASM" ]]; then
        echo "Error: $SRC_WASM not found. Run 'just build' (or 'just wasm') in the VGraph repo first."
        exit 1
    fi

    cp "$SRC_WASM" ./VGraphWasm.wasm
    echo "VGraphWasm.wasm refreshed from VGRAPH_REPO."
else
    echo "VGRAPH_REPO not set — using the existing VGraphWasm.wasm as-is."
fi

# ---- 3. Install + bump version --------------------------------------------

if [[ ! -d node_modules ]]; then
    echo "Installing dependencies..."
    npm install --silent
fi

node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('package.json', 'utf8'));
j.version = '$VERSION';
fs.writeFileSync('package.json', JSON.stringify(j, null, 2) + '\n');
"

# ---- 4. Build + package ---------------------------------------------------

echo "Building production bundle..."
npm run build --silent

echo "Packaging .vsix..."
npm run package --silent

VSIX="vithanco-${VERSION}.vsix"
if [[ ! -f "$VSIX" ]]; then
    echo "Error: expected '$VSIX' not found after package step."
    exit 1
fi

VSIX_SIZE=$(stat -f "%z" "$VSIX" 2>/dev/null || stat -c "%s" "$VSIX")
echo ""
echo "Build artifacts:"
printf "  %-40s  %s bytes\n" "$VSIX" "$VSIX_SIZE"

echo ""
echo "✓ Bumped to $VERSION. Commit / tag / publish when you're ready, e.g.:"
echo "    git add package.json VGraphWasm.wasm"
echo "    git commit -m \"chore: bump to $VERSION\""
echo "    git tag $VERSION && git push origin HEAD $VERSION"
echo "    gh release create $VERSION --title $VERSION --notes \"Release $VERSION\" $VSIX"
echo "    npx vsce publish --packagePath $VSIX --no-dependencies"
