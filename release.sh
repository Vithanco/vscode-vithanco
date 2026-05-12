#!/bin/bash
# Cut a release of the VGraph VS Code extension.
#
# Usage:
#   ./release.sh <version>
#   VGRAPH_REPO=/path/to/VGraph ./release.sh <version>
#   VGRAPH_REPO=/path/to/VGraph PUBLISH=1 ./release.sh <version>
#
# Examples:
#   ./release.sh 0.1.1
#   VGRAPH_REPO=~/private/swift/VGraph ./release.sh 0.1.2
#   VGRAPH_REPO=~/private/swift/VGraph PUBLISH=1 ./release.sh 0.2.0
#
# What it does:
#   1. Validates the version string (semver, no 'v' prefix)
#   2. (Optional) If $VGRAPH_REPO is set, copies the freshest VGraphWasm.wasm
#      from that monorepo so the extension ships against the latest engine.
#   3. Bumps version in package.json
#   4. Runs npm run build to produce out/extension.js and out/preview.js
#   5. Packages the .vsix
#   6. Commits (incl. updated WASM), tags, pushes
#   7. Creates a GitHub Release with the .vsix attached
#   8. (Optional, PUBLISH=1) Publishes to the VS Code Marketplace via vsce
#
# Prerequisites:
#   - Run from inside the standalone vscode-vithanco repo (NOT the VGraph monorepo)
#   - gh CLI authenticated (`gh auth status`)
#   - Working tree clean
#   - For PUBLISH=1: a publisher PAT in $VSCE_PAT or a logged-in `vsce` session
#     (https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

set -euo pipefail

# ---- 1. Parse and validate version ----------------------------------------

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
    echo "Usage: $0 <version>"
    echo "       VGRAPH_REPO=/path/to/VGraph $0 <version>           (also refresh WASM)"
    echo "       VGRAPH_REPO=/path/to/VGraph PUBLISH=1 $0 <version> (also publish to Marketplace)"
    exit 1
fi

if [[ "$VERSION" == v* ]]; then
    echo "Error: version must not start with 'v' (use 0.1.1, not v0.1.1)"
    exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: version must be semver (e.g. 0.1.1), got '$VERSION'"
    exit 1
fi

# ---- 2. Safety checks -----------------------------------------------------

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR"

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [[ "$GIT_ROOT" != "$SCRIPT_DIR" ]]; then
    echo "Error: release.sh must be run from the standalone vscode-vithanco repo root."
    echo "  Script dir: $SCRIPT_DIR"
    echo "  Git root:   ${GIT_ROOT:-<not a git repo>}"
    echo ""
    echo "If you're still in the VGraph monorepo, sync this folder to the standalone repo first."
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    echo "Error: working tree is not clean. Commit or stash changes first."
    git status --short
    exit 1
fi

if git rev-parse "$VERSION" >/dev/null 2>&1; then
    echo "Error: tag '$VERSION' already exists."
    exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
    echo "Error: gh CLI not found. Install from https://cli.github.com/"
    exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
    echo "Error: gh CLI not authenticated. Run: gh auth login"
    exit 1
fi

# ---- 3. (Optional) Copy VGraphWasm.wasm from the VGraph monorepo ----------

if [[ -n "${VGRAPH_REPO:-}" ]]; then
    if [[ ! -d "$VGRAPH_REPO" ]]; then
        echo "Error: VGRAPH_REPO ('$VGRAPH_REPO') does not exist."
        exit 1
    fi

    SRC_WASM="$VGRAPH_REPO/website/Package/VGraphWasm.wasm"
    if [[ ! -f "$SRC_WASM" ]]; then
        echo "Error: $SRC_WASM not found. Run ./build.sh in the VGraph repo first."
        exit 1
    fi

    cp "$SRC_WASM" ./VGraphWasm.wasm

    if [[ -n "$(git status --porcelain VGraphWasm.wasm)" ]]; then
        WASM_SIZE=$(stat -f "%z" VGraphWasm.wasm 2>/dev/null || stat -c "%s" VGraphWasm.wasm)
        echo "VGraphWasm.wasm refreshed from VGRAPH_REPO ($WASM_SIZE bytes) — will be committed with the release."
    else
        echo "VGraphWasm.wasm unchanged (matches VGRAPH_REPO)."
    fi
else
    echo "VGRAPH_REPO not set — using the committed VGraphWasm.wasm as-is."
    echo "  (Set VGRAPH_REPO to copy a freshly built WASM from the VGraph monorepo.)"
fi

# ---- 4. Install + bump version --------------------------------------------

if [[ ! -d node_modules ]]; then
    echo "Installing dependencies..."
    npm install --silent
fi

echo "Bumping version → $VERSION"
node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('package.json', 'utf8'));
j.version = '$VERSION';
fs.writeFileSync('package.json', JSON.stringify(j, null, 2) + '\n');
"

# ---- 5. Build + package ---------------------------------------------------

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

# ---- 6. Commit, tag, push -------------------------------------------------

git add package.json VGraphWasm.wasm

if git diff --cached --quiet; then
    echo "No file changes to commit; tagging current HEAD as $VERSION."
else
    git commit -m "Release $VERSION"
fi

git tag "$VERSION"

echo "Pushing commit and tag..."
git push origin HEAD
git push origin "$VERSION"

# ---- 7. Create GitHub release with the .vsix attached --------------------

echo "Creating GitHub release..."
gh release create "$VERSION" \
    --title "$VERSION" \
    --notes "Release $VERSION" \
    "$VSIX"

# ---- 8. (Optional) Publish to VS Code Marketplace -------------------------

if [[ "${PUBLISH:-}" == "1" ]]; then
    echo ""
    echo "Publishing to VS Code Marketplace..."
    npx vsce publish --packagePath "$VSIX" --no-dependencies
    echo "Published to https://marketplace.visualstudio.com/items?itemName=vithanco.vithanco"
else
    echo ""
    echo "Skipping Marketplace publish (set PUBLISH=1 to enable)."
    echo "Manual publish: npx vsce publish --packagePath $VSIX --no-dependencies"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Release $VERSION published"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Marketplace publisher portal: https://marketplace.visualstudio.com/manage/publishers/vithanco"
