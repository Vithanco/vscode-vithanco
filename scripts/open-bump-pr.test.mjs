import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'open-bump-pr.sh');
const BRANCH = 'release/1.2.3';

// gh is faked: `pr list --state open` answers from OPEN_PR, and any other listing
// also sees CLOSED_PR, as the real one does for a branch whose PR was closed or merged.
const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
case "$*" in
    "pr list"*"--state open"*) echo "\${OPEN_PR:-}" ;;
    "pr list"*|"pr view"*) echo "\${OPEN_PR:-}\${CLOSED_PR:-}" ;;
esac
`;

function given() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-bump-pr-'));
    const origin = path.join(root, 'origin.git');
    const repo = path.join(root, 'repo');
    const bin = path.join(root, 'bin');
    const log = path.join(root, 'gh.log');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'gh'), FAKE_GH, { mode: 0o755 });
    fs.writeFileSync(log, '');
    const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GH_LOG: log,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@example.invalid',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@example.invalid',
    };
    const git = (...args) =>
        execFileSync('git', args, { cwd: repo, env, stdio: 'pipe', encoding: 'utf8' }).trim();
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
    execFileSync('git', ['init', '-q', '-b', 'main', repo]);
    const setVersion = (version) => fs.writeFileSync(path.join(repo, 'version.txt'), version);
    setVersion('1.0.0');
    git('add', '.');
    git('commit', '-qm', 'start');
    git('remote', 'add', 'origin', origin);
    git('push', '-q', 'origin', 'main');
    return {
        setVersion,
        git,
        // Each CI run starts from a fresh checkout of main.
        freshCheckout: () => git('checkout', '-q', '-B', 'main', 'origin/main'),
        run: ({ openPR = '', closedPR = '' } = {}) =>
            execFileSync(script, ['1.2.3', 'the body', 'version.txt'], {
                cwd: repo,
                env: { ...env, OPEN_PR: openPR, CLOSED_PR: closedPR },
                stdio: 'pipe',
            }),
        branchTip: () => git('ls-remote', 'origin', `refs/heads/${BRANCH}`),
        created: () => fs.readFileSync(log, 'utf8').split('\n').filter((l) => l.startsWith('pr create')),
    };
}

test('a new version gets a branch and a PR', () => {
    const plugin = given();
    plugin.setVersion('1.2.3');
    plugin.run();
    assert.notEqual(plugin.branchTip(), '');
    assert.equal(plugin.created().length, 1);
    assert.match(plugin.created()[0], /--head release\/1\.2\.3/);
});

test('a re-run against an open PR with the same content changes nothing', () => {
    const plugin = given();
    plugin.setVersion('1.2.3');
    plugin.run();
    const tip = plugin.branchTip();
    plugin.freshCheckout();
    plugin.setVersion('1.2.3');
    plugin.run({ openPR: '7' });
    assert.equal(plugin.branchTip(), tip);
    assert.equal(plugin.created().length, 1);
});

test('a re-run with new content updates the open PR rather than opening another', () => {
    const plugin = given();
    plugin.setVersion('1.2.3');
    plugin.run();
    const tip = plugin.branchTip();
    plugin.freshCheckout();
    plugin.setVersion('1.2.3 rebuilt');
    plugin.run({ openPR: '7' });
    assert.notEqual(plugin.branchTip(), tip);
    assert.equal(plugin.created().length, 1);
});

test('a branch left behind when opening the PR failed still gets its PR on a re-run', () => {
    const plugin = given();
    plugin.setVersion('1.2.3');
    plugin.run();
    plugin.freshCheckout();
    plugin.setVersion('1.2.3');
    plugin.run();
    assert.equal(plugin.created().length, 2);
});

test('a PR closed earlier does not stop a new one', () => {
    const plugin = given();
    plugin.setVersion('1.2.3');
    plugin.run({ closedPR: '7' });
    assert.equal(plugin.created().length, 1);
});

test('already at this version with this engine, it pushes and opens nothing', () => {
    const plugin = given();
    plugin.run();
    assert.equal(plugin.branchTip(), '');
    assert.equal(plugin.created().length, 0);
});
