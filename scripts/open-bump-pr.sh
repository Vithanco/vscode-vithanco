#!/usr/bin/env bash
# Commits the version already written to the working tree and opens its PR. A re-run
# must converge, because the usual reason for one is that opening the PR failed after
# the branch was pushed, or that the engine was rebuilt while the PR waits for review.
# The branch belongs to this job: commits added to it by hand are overwritten.
set -euo pipefail

VERSION=$1
BODY=$2
shift 2
BRANCH="release/$VERSION"

git add -- "$@"
if git diff --cached --quiet; then
    echo "Already at $VERSION with this engine; nothing to open."
    exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -q -m "chore: release $VERSION"

# Comparing trees: every run makes a new commit, and pushing one with the same content
# would only add noise to a PR someone may be reviewing.
if git fetch -q origin "refs/heads/$BRANCH" 2>/dev/null \
    && [ "$(git rev-parse 'FETCH_HEAD^{tree}')" = "$(git rev-parse 'HEAD^{tree}')" ]; then
    echo "$BRANCH already has this content."
else
    git push -q --force origin "HEAD:refs/heads/$BRANCH"
fi

# Only an open PR counts: `gh pr view <branch>` also finds a closed or merged one.
if [ -z "$(gh pr list --head "$BRANCH" --state open --json number --jq '.[].number')" ]; then
    gh pr create --base main --head "$BRANCH" --title "chore: release $VERSION" --body "$BODY"
fi
