# Repository automation

## Quality checks

The Quality workflow runs for pull requests, pushes to `main`, and manual dispatches. Its code job checks formatting, lint, types, editor tests, local file-service tests, automation tests, and the production build. The browser job tests that build with Chromium and Firefox. Each test owns a temporary directory and a local service on an automatically assigned port.

Browser coverage includes original-file saves, recovery after reload, external edit conflicts, reading position, minimap navigation, focus and appearance settings, dropped copies, narrow screens, folder navigation, and backup preview, merge, and restore. These tests do not use your installed service, browser profile, or personal documents.

New commits cancel earlier Quality runs for the same pull request. The final `Required checks` job succeeds only when code and browser jobs both pass.

The upstream repository enforces the [Protect main ruleset](https://github.com/thiagocorreanet/dev-notes/rules/23058247) on its default branch. Changes require a pull request, resolved review conversations, an up-to-date branch, and a successful `Required checks` result from GitHub Actions. Force pushes and branch deletion are blocked, with no bypass actors. Review approval is optional so a sole maintainer can merge after CI passes. These settings live on GitHub; forks must configure their own ruleset.

Reports, failure screenshots, and traces are retained as Actions artifacts for seven days. The traces contain only temporary test data, including short-lived access to a service that is destroyed after the test.

Run the checks locally:

```bash
npm ci
npm run check
npx playwright install chromium firefox
npm run test:e2e
```

On Linux, install the browser system dependencies with `npx playwright install --with-deps chromium firefox` if required. `npm run check` builds `dist/`; run it or `npm run build` before browser tests. Open the HTML report with `npx playwright show-report`.

## Release packages

The Release workflow has two entry points:

- A manual run checks the selected ref and produces downloadable build artifacts. It does not create a tag or GitHub release.
- Pushing a `v*` tag checks that its value matches `package.json`, runs the complete Quality workflow, packages the build, and creates a draft GitHub release with generated notes and assets.

For a release, update the version and lockfile together, merge the change, then tag that commit. For example, when the package version is `0.1.0`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The version check accepts stable versions and prerelease suffixes, provided the tag matches the package version exactly. Review the draft and its notes before publishing. Existing releases are never deleted or replaced by the workflow; creating a draft for an existing release fails rather than overwriting its assets.

Each build produces:

| Asset                           | Contents                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `devnotes-VERSION-web.zip`      | The production `dist/` contents for static hosting                                           |
| `devnotes-VERSION-linux.tar.gz` | The compiled web app, local Node launcher, file service, icon, and installation instructions |
| `SHA256SUMS`                    | SHA-256 checksums for both archives                                                          |

The Linux archive requires Node.js 24 and npm 11 or later. It does not include Node or require frontend dependencies. Extract it to a permanent directory and run `npm run local:install -- --default` there. Save open documents and stop the old service before updating. See the README inside the archive for uninstall and relocation instructions.

The package job verifies checksums, extracts the Linux archive, registers its handler in temporary XDG directories, and opens and saves a temporary original file through the packaged service. It does not change the runner's normal file associations.

To build and verify the archives locally on Linux, install `zip`, `tar`, and `sha256sum`, then run:

```bash
npm run build
npm run release:package
node scripts/automation/smoke-package.ts
```

Packages go to the ignored `release/` directory. A `LICENSE` file is included in the Linux archive when present in the source checkout. Packaging does not select or change the project license.

## Issues and labels

Bug reports request a version, operating system, browser, opening method, and reproduction steps. Feature requests ask for the problem and proposed behavior. All repository forms use English.

The Label bug reports workflow reads the selected OS and browser from issues with the `bug` label. On creation, edit, or reopen, it adds the corresponding `os:*` and `browser:*` labels and removes obsolete labels in those two groups. Other labels remain unchanged. Unknown values are ignored.

The managed labels are `os:linux`, `os:windows`, `os:macos`, `os:other`, `browser:chrome`, `browser:chromium`, `browser:firefox`, `browser:safari`, `browser:edge`, and `browser:other`. The repository also uses the standard `bug` and `enhancement` labels. Create these labels when adopting the workflows in another repository.

The labeling job executes code from the default branch on issue events. Pull request checks use read-only repository permissions, and the release draft job receives write access only after validation and packaging succeed. Action versions are pinned to commit SHAs, with their major versions recorded in comments.
