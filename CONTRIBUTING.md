# Contributing to DevNotes

DevNotes welcomes bug reports, documentation fixes, and pull requests. For a substantial feature or change to file handling, open an issue describing the intended behavior before starting work.

## Local setup

Fork the repository, clone your fork, and install Node.js 24 with npm 11 or later.

```bash
npm ci
npm run dev
```

Use `nvm use` if you manage Node versions with nvm. Vite prints the development URL when it starts.

## Making a change

Create a branch for your change. Keep the scope focused and explain the problem in the pull request, including a concrete example when possible.

Code, comments, documentation, and test descriptions use English. Visible interface text and accessible labels use natural Brazilian Portuguese. Imported documents and user content keep their original language.

Compose interface controls from the official components in `src/components/ui`. Preserve the shadcn/ui Nova preset and use semantic theme tokens. Add domain components in `src/features`; keep brand colors in `src/styles/global.css`. Read [AGENTS.md](AGENTS.md) for the full conventions.

Install additional registry components with:

```bash
npx shadcn@latest add <component>
```

Keep `package-lock.json` current when dependencies change. Update the README or [user guide](docs/guide.md) when a change affects setup or documented behavior.

## Validation

Run the complete check before submitting:

```bash
npm run check
```

It checks formatting, ESLint, Vitest workflows, local HTTP/filesystem tests, TypeScript, and the production build. Add meaningful coverage for changed behavior, especially persistence, Markdown conversion, and file conflict handling.

For interface changes, verify keyboard navigation, focus, light and dark themes, and narrow screens. Include screenshots in the pull request when they make the change easier to review. Use sample content rather than personal documents or credentials.

The Linux installer changes per-user file associations. Tests should use temporary files and an isolated `DEVNOTES_STATE_DIR`; do not run the installer against another person's desktop configuration.

## Reporting a bug

Include the browser, operating system, steps to reproduce, and expected behavior. Explain whether the document came from the browser workspace, an import, a connected folder, or the local launcher. A small Markdown example is useful for editing and rendering issues.

Remove private document content, API keys, launch tickets, and session credentials before sharing logs or screenshots.
