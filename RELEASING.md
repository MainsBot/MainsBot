# Releasing

This repo now uses `package.json` as the canonical app version source. The web footer and `!version` output both read from it through the build info helper.

## Standard release flow

### 1. Make sure the branch is clean

```bash
git status
```

If the tree is not clean, commit or intentionally discard the changes first.

### 2. Bump the version

For major/minor/patch releases:

```bash
npm version major --no-git-tag-version
```

or

```bash
npm version minor --no-git-tag-version
```

or

```bash
npm version patch --no-git-tag-version
```

If you are setting a specific release directly:

```bash
npm version 3.0.0 --no-git-tag-version
```

That updates:
- `package.json`
- `package-lock.json`

### 3. Update release notes

Edit:
- `CHANGELOG.md`

Put the newest release entry at the top.

### 4. Commit the release

```bash
git add package.json package-lock.json CHANGELOG.md README.md RELEASING.md
git commit -m "release: v3.0.0"
```

### 5. Tag it

Use annotated tags:

```bash
git tag -a v3.0.0 -m "MainsBot v3.0.0"
```

### 6. Push branch and tag

```bash
git push origin master
git push origin v3.0.0
```

If your default branch is not `master`, use the correct branch name.

## GitHub release page

After the tag is pushed:

1. Open the repository on GitHub.
2. Go to `Releases`.
3. Click `Draft a new release`.
4. Select the tag, for example `v3.0.0`.
5. Title it `MainsBot v3.0.0`.
6. Paste the matching `CHANGELOG.md` section into the release notes.
7. Publish the release.

## Recommended release notes format

Use the same section layout as the changelog:

- Added
- Changed
- Fixed
- Removed
- Operational notes

## Deploy after release

On the server:

```bash
cd /opt/mainsbot
git fetch origin
git checkout master
git pull --ff-only
npm install
sudo systemctl restart mainsbot@<instance>
sudo systemctl restart mainsbot-web@<instance>
```

## Quick sanity checks

After deploy:

```bash
node -p "require('./package.json').version"
journalctl -u mainsbot@<instance> -n 50 --no-pager
journalctl -u mainsbot-web@<instance> -n 50 --no-pager
```

Then verify:

- footer shows the new version
- `!version` returns the new build version
- `/api/status` returns the updated build metadata
