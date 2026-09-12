# DevNotes user guide

[Back to the project overview](../README.md)

This guide describes the editor, file workflows, and storage behavior. Action names are translated into English throughout this guide; the application interface uses Brazilian Portuguese.

## Run locally

Use Node.js 24 and npm 11 or later. The Node.js major version is pinned in `.nvmrc`.

```bash
nvm use # Optional when using nvm.
npm ci
npm run dev
```

Open the address printed by Vite, usually `http://localhost:5173`.

## Open Markdown files from the computer

DevNotes can open in the **default web browser** when a Markdown file is activated in the Linux file manager. The React/TypeScript/shadcn interface is reused; no Tauri, Electron, desktop window, or development server is involved. A Node.js 24 process serves the production build and accesses explicitly opened files on the same computer.

```bash
# Build and register DevNotes as the default Markdown application for this Linux user.
npm run local:install -- --default

# Alternatively, build and launch without installing file associations.
npm run build
npm run local:open -- "/absolute/path/to/document.md"
```

The installer registers `.md` and `.markdown` MIME handlers through a per-user desktop entry. Without `--default`, DevNotes appears in **Open With** without replacing the current default. The installed launcher references this checkout and the current Node executable: keep both in place and reinstall after moving them. This is a local checkout installation, not a standalone distributable installer. File association installation currently supports Linux; other systems can use the CLI but do not yet have association installers.

Opening a file starts the local service if necessary, then opens a browser page at:

```text
http://127.0.0.1:45164/?ws=1&file=/absolute/path/to/document.md
```

The path is URL-encoded by the launcher, including spaces, accents, `&`, and `#`. `ws=1` selects the local opening flow; it does not import the entire containing folder. Each file activation opens a browser page and reuses the same background service. The service stays running until stopped or the computer restarts. The next activation starts it again automatically. Only `127.0.0.1` is bound; no network interface is exposed.

- **Save original file** and **Ctrl/Cmd+S** write the launched document back to its original path. Edits are written to the original only when explicitly saved; recovery snapshots stay in browser storage, and the browser warns before leaving with unsaved edits. Reloading reads the file from disk and offers any recoverable draft. Download and Save as retain their existing copy-download behavior.
- The title/content split preserves the original Markdown prefix and line endings when the title is unchanged. Saving an unchanged document preserves its exact UTF-8 content, including files without a leading heading. Changing the title updates the document heading, not the filename.
- Saves check the disk version and refuse competing external edits. The editor retains the unsaved version and explains how to download it or reload the original with the existing Refresh file action. Writes use a temporary file in the destination directory, synchronize it, preserve permission bits, recheck the disk version, and rename it into place. Write permission on the containing directory is required. Metadata such as extended attributes and hard-link identity is not preserved. There is no cross-process compare-and-swap guarantee against another program writing at the final rename boundary.
- Files must be regular UTF-8 Markdown files of at most 2 MB. Authorization is limited to files opened through the launcher. Entering an arbitrary filesystem path in a URL does not authorize it. A one-use launch ticket establishes an HttpOnly, SameSite session cookie and redirects to the `ws`/`file` URL. The service validates Host/Origin and rejects cross-site requests. Launcher credentials are stored in the user's private state directory, outside the web build.
- Ordinary browser workspace notes and connected-folder workflows keep their existing behavior. Workspace rename, move, trash, and export actions do not manipulate the launched file on disk. Relative images and links retain the existing browser renderer behavior; the service does not expose the containing directory as a file server.

The default port is **45164**, deliberately separate from other local editors. Use `npm run local:open -- --port=45165 "/path/document.md"` to select another port when starting a service. An already-running service keeps its port. Changing ports changes the browser storage origin, so use a stable port to retain the same browser workspace. The port does not affect Markdown content stored on disk.

```bash
npm run local:stop
npm run local:uninstall
```

Uninstall removes the desktop handler and restores recorded previous defaults when DevNotes is still selected. It keeps documents, browser storage, and the checkout. Stop the server separately before uninstalling. Service state and logs are under `$XDG_STATE_HOME/devnotes` or `~/.local/state/devnotes`. `DEVNOTES_STATE_DIR` provides an isolated state directory for testing. `--no-browser` prints short-lived launch links for browser testing; treat those links as local access credentials.

## Interface motion

Motion uses the existing shadcn/ui Nova components and `tw-animate-css`; no additional animation library is required. The official shadcn MCP was consulted for `collapsible-demo`, `skeleton-demo`, and `button-loading`. Spinner was installed with `npx shadcn@latest add spinner`.

- Sidebar folders animate their measured height and rotate their chevrons. New document tabs, document/view changes, and presentation slides have short opacity transitions.
- Opening a file through the local launcher shows an accessible Skeleton composition until the real document arrives. The document region reports its loading state and does not flash an example document.
- Explicit saves show a Spinner while pending. Success appears only after persistence succeeds, resets after 2.2 seconds, and stops applying as soon as the document changes. Failures retain the error and the unsaved document.
- Theme changes transition semantic colors for 180 ms. Code-copy confirmation animates briefly and resets after 2.2 seconds.
- Animations and transitions are disabled for `prefers-reduced-motion: reduce` and printing. Minimap navigation also uses immediate scrolling when reduced motion is enabled. Document typing does not restart the entry animation.

## Focus, reading preferences, and recovery

Use **Focus mode** in the header or **Toggle focus mode** in the command palette to hide the sidebar, document tabs, secondary actions, and AI chat. Search, view selection, saving, and the exit control stay available. **Escape** leaves focus mode after any open dialog has been dismissed. The editable document stays mounted and retains its text and editing state. The sidebar returns to its previous width and expanded/collapsed state.

**Appearance preferences** is available in the header and command palette. Choose 14, 16, 18, or 20 px document text, comfortable/wide/full document width, a light/dark theme, and whether to animate the interface. Settings apply immediately, persist per browser origin, and synchronize between open tabs. Inter remains the document/UI font and JetBrains Mono remains the source-code font. Split view uses the available width for its two columns. Focus mode constrains otherwise full-width documents for reading. The system's reduced-motion preference always takes precedence over the animation switch. Preference storage failures are reported in the settings dialog.

Drop one or more `.md` or `.markdown` files anywhere over the app to open them as browser workspace copies. A shadcn Card identifies the drop target, and the browser's normal file-navigation behavior is prevented. The whole batch is validated before import: at most 100 files, 2 MB each, and 20 MB total. Unsupported files reject the batch without replacing the open document. Dropped files do not grant the local service access to their original paths and are never written back implicitly. Use the existing computer file association to edit an original, or use Download/Save as for a dropped copy. The existing file picker remains available for keyboard and touch users.

Unsaved documents opened through the local launcher keep recovery snapshots in browser storage. On reopening, DevNotes offers **Recover draft** or **Discard this draft** before editing continues. Recovery never writes to disk automatically. Each editing session has its own snapshot key so concurrent tabs do not overwrite one another's recovery records. Restoring a snapshot retains its original disk version, so external changes still produce a save conflict. Saving successfully clears that session's recovery record. If the original is missing or the service is unavailable, a stored snapshot can still be recovered for downloading; original-file saves still require file access. Storage failures warn the user to save or download before leaving. Clearing browser data removes recovery records. Temporary new documents retain their existing explicit-save behavior.

Reading positions are remembered independently for each document in Read and Split views. The app stores the nearest heading and offset, with a pixel fallback if the heading no longer exists. It briefly adjusts for asynchronous content layout, then stops adjusting when the reader interacts. Explicit minimap navigation takes priority over position restoration. The selected heading receives a temporary semantic-color outline/background, including a static highlight when animation is disabled.

These controls use official shadcn/ui Dialog, Select, Switch, Alert, Button, and Card compositions. The MCP examples `switch-demo`, `select-demo`, and `dialog-demo` were consulted, and Switch was installed with `npx shadcn@latest add switch`.

## Workspace

On desktop, drag the divider between the sidebar and the document to adjust the sidebar width. The divider uses the official shadcn/ui Resizable component: it supports mouse and touch input, keyboard arrows when focused, and a double-click to restore the default width. Width is constrained to 260 to 480 px while reserving at least 360 px for the document. The preferred width is saved locally and restored when reopening the sidebar or reloading the app. Browser storage failures do not prevent resizing. On mobile, the sidebar continues to open as a sheet.

The sidebar toolbar provides seven actions using official shadcn/ui buttons and tooltips. The descriptions below use English; their interface labels appear in Brazilian Portuguese:

| Action             | Behavior                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| New document       | Open a blank temporary document in Edit mode. It stays in memory until Save workspace.                                 |
| New workspace page | Create a named page in the selected folder and save it in this browser.                                                |
| New folder         | Create a nested workspace folder in the selected location. Choose Workspace root to create at the top level.           |
| Refresh file       | Reload an imported Markdown file from its source. Confirm before replacing local edits.                                |
| Collapse all       | Close every folder, including nested folders, and clear the search so the collapsed tree remains visible.              |
| Open folder        | Import a local folder's hierarchy and `.md` / `.markdown` files as workspace copies.                                   |
| Save workspace     | Keep temporary documents, save the workspace locally, and download a JSON backup containing all documents and folders. |

Use **Open Markdown file** in the sidebar footer or command palette to open a `.md` or `.markdown` document. The app only opens Markdown files and folders containing Markdown; JSON backup import is not available. The existing JSON export contains document content and folder structure for external archival, not browser file permissions.

The sidebar nests folders and documents beneath the workspace root, with indentation and guide lines for each level. Folders appear before documents, sorted by name within each level. Expand or collapse a folder with a click, Enter, or Space. The folder-plus action beside a folder selects it and opens the form to create a subfolder; empty folders remain visible. Select the workspace root to create top-level items.

Sidebar search matches page titles, content, and folder paths, revealing matching descendants inside collapsed folders. Matching folder names also reveal their contents, including empty subfolders. Clearing the query restores the previous expansion state. Read and Edit use the full available width beside the sidebar. **Edit** provides a visual document editor, **Markdown** edits the source, and **Split** displays the source alongside its preview (stacked on smaller screens). Use Download for an individual `.md` document.

### Visual editing

The headless [Tiptap editor](https://tiptap.dev/docs/editor/getting-started/install/react) uses official shadcn/ui controls for formatting, headings, lists, checklists, quotes, code, undo/redo, and table insertion. Click in a table to add or delete rows and columns. Tab moves between cells and creates a row at the end. Tables keep a header row and one paragraph per cell for Markdown compatibility; merged cells and nested blocks are not supported.

Visual edits serialize back to Markdown and follow the same workspace persistence rules as source edits. Opening Edit alone never rewrites a document. The [Tiptap Markdown extension](https://tiptap.dev/docs/editor/markdown) is currently beta: source locations and Markdown delimiters may normalize after an edit. Before opening a document visually, the app compares the original and converted Markdown syntax trees. Documents with unsupported formatting, raw HTML, references, or unsafe URLs stay available through the Markdown tab instead of undergoing lossy conversion. Preview continues to support GFM tables and read-only task checkboxes.

Collapse the sidebar with the toolbar button or Ctrl/Cmd+B. On mobile it opens as a sheet. Both branded light and dark themes are available; the selected theme is retained in appearance preferences. Two bundled example documents remain available alongside your own notes and are included when saving the full workspace.

Use the magnifying glass in the top bar or **Ctrl/Cmd+F** to find text in the current document. The shadcn/ui popover shows the query, occurrence counter, previous/next arrows, and a close button. Search is literal and case-insensitive. Enter moves forward, Shift+Enter moves backward, and Escape closes the search. Read and Edit highlight matches and scroll to the current occurrence; Split searches the preview, and Markdown selects matching source text. Browsers with the CSS Custom Highlight API highlight all matches; older browsers select the current match.

Use the **Ctrl K** button beside the magnifying glass or **Ctrl/Cmd+K** to open the command palette. It uses the official shadcn/ui Command and Dialog compositions, consulted through the shadcn MCP (`command-dialog`, `command-demo`, and the audit checklist). The palette groups editor actions and documents. Command matching ignores accents and supports keywords such as `pdf`, `apresentacao`, `workspace`, and `minimap`. Document results search titles, content, and folder paths, with location and matching excerpts. Use arrows and Enter, or click a result. Escape closes the palette; reopening clears the query.

The palette also includes focus mode and appearance preferences. The table uses English translations of the interface labels:

| Action                | Behavior                                                                                                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change theme          | Switch between light and dark.                                                                                                                                                                                                                                              |
| Save open file as PDF | Open the browser print dialog with only the active document; choose Save as PDF. Code wraps for printing and editor controls are excluded.                                                                                                                                  |
| Presentation mode     | Open a full-window presentation split at level-one and level-two Markdown headings. Navigate with arrows or the previous/next controls; Escape exits.                                                                                                                       |
| Find in document      | Focus the existing document search; Ctrl/Cmd+F also opens it.                                                                                                                                                                                                               |
| New document          | Start a temporary document in Edit mode.                                                                                                                                                                                                                                    |
| New workspace folder  | Create a folder beneath the selected location.                                                                                                                                                                                                                              |
| Open folder/workspace | Import a folder containing Markdown documents as workspace copies.                                                                                                                                                                                                          |
| Open Markdown file    | Open a local `.md` or `.markdown` file without changing the original.                                                                                                                                                                                                       |
| Save workspace        | Save documents locally and download the existing JSON archive.                                                                                                                                                                                                              |
| Save page             | Persist only the active page, including a temporary draft. For a document opened through the local launcher, save to the original file. Ctrl/Cmd+S performs the same action.                                                                                                |
| Save as               | Download a Markdown copy with a chosen filename. The browser controls the destination according to its download preferences.                                                                                                                                                |
| Configure AI          | Save a server URL and model locally. An optional API key stays in memory for the current tab and is cleared on reload. Saving settings does not send requests; the corner chat uses this connection when you send a message. Settings are excluded from workspace archives. |
| Open minimap          | Open a navigable heading overview. Selecting a section switches to Read mode and focuses that heading.                                                                                                                                                                      |

Presentation and minimap structure comes from the Markdown syntax tree, so fenced code does not create false sections. PDF export and presentation do not modify the document.

### Markdown diagrams

Fenced `mermaid` blocks render as diagrams in Read, Split, presentation, and PDF export. The visual editor retains the editable source and shows a live diagram beneath it; choose **Mermaid** in the code language selector. For example:

````markdown
```mermaid
flowchart TD
  A[Start] --> B{Valid?}
  B -->|Yes| C[Save]
  B -->|No| D[Review]
```
````

The [Mermaid renderer](https://mermaid.js.org/config/usage.html) loads on demand and follows the active theme. Diagrams use strict security settings and isolated SVG images, without interactive links. Invalid syntax displays an error and the original source; rendering never rewrites the Markdown. Rendering is limited to 50,000 characters and 500 edges per diagram. PDF export waits for diagrams and images to finish loading.

### AI chat

The **Chat with AI** button in the bottom-right corner opens a responsive chat composed from the existing official Nova Popover, Input Group, Button, Checkbox, Badge, and Alert components. The official shadcn MCP was queried for `popover-demo`, `input-group-textarea`, and its audit checklist.

Configure a base server URL (for example `http://localhost:11434/v1`), model, and optional session-only API key from the chat settings or command palette. The client posts non-streaming requests to `<base URL>/chat/completions` using the [Chat Completions compatibility contract](https://docs.ollama.com/api/openai-compatibility). The server must allow the app origin through CORS and be reachable under the browser's HTTPS rules. No backend proxy is bundled.

Enter sends a message; Shift+Enter inserts a line break. Responses render as Markdown. You can interrupt a request, retry an unsuccessful message from the restored composer, minimize without losing the conversation, and start a new conversation. Requests time out after two minutes. Changing the server or model starts a new conversation. Conversations remain in memory and are cleared on reload; neither chats nor API keys are included in workspace exports.

The active document is sent only when **Include open document** is checked at send time. Its title and content are captured with that message and remain part of subsequent conversation history until a new conversation starts, even if the checkbox is later cleared. Chat responses never edit workspace documents automatically.

### Document organization and recovery

Use a document or folder's context menu (right click or the keyboard context-menu key), or its ellipsis button, to rename, move, duplicate, or send it to the trash. Folder moves reject cycles and duplicate sibling names. Duplicating a folder copies its visible subtree with new identifiers and remaps links between copied documents. These operations affect workspace copies only. Organizing a temporary document saves it into the workspace.

The sidebar trash restores documents with their history and folders with their hierarchy. Restoring a folder leaves items that were already individually trashed in the trash. Restoring a single document also restores its ancestor folders. If a restored folder name is already taken, the app gives the restored folder an available name. Permanent deletion requires confirmation and removes the selected subtree and its history. Deleted bundled examples stay deleted.

The history button, also available in document menus, compares a previous version with the current title and Markdown. Up to 30 recovery points are retained per document; continuous edits are grouped into one-minute intervals. Renaming and restoring create separate recovery points. A restore first retains the current text, allowing the operation to be reversed through history. Versions persist in the browser and are included in workspace backups, along with trash and favorites. Existing version-1 backups without this metadata remain readable.

### Writing and navigation tools

- Open documents appear in a horizontally scrollable tab bar. Closing a tab does not delete the document or discard a temporary draft. At least one tab stays open. Available tabs and the selected document are restored after reload; temporary drafts retain their existing in-memory lifetime.
- Mark a document with the star button or its menu to add it to the sidebar favorites. Favorites persist with the workspace.
- The new-page form includes architecture decision, bug investigation, and meeting-note templates. Switching templates asks before replacing text already entered in the form.
- In a visual-editor paragraph, type `/` and a command such as `/tabela`, `/codigo`, or `/tarefa`. Arrow keys select a command, Enter inserts it, and Escape dismisses the menu. Commands also insert headings, paragraphs, images, and links to notes. The menu does not activate inside code blocks or tables.
- Write `[[Note title]]`, `[[Folder/Note title]]`, or `[[Note title|Link label]]` to link notes in the preview. Ambiguous titles require a folder path. The link insertion dialog creates Markdown links using stable document identifiers, so they continue working after renames and moves. Deleted or missing targets cannot be opened. Code samples are excluded from wiki-link parsing.
- Code blocks include language selection in visual editing, syntax highlighting in editing and reading, and a copy button. Supported languages include JavaScript, TypeScript, Python, C#, JSON, Bash, SQL, CSS, HTML/XML, and YAML. Unlabelled blocks use automatic detection; plain text disables highlighting. The reader leaves blocks of 100,000 characters or more unhighlighted.
- Paste a PNG, JPEG, GIF, or WebP image into a top-level visual-editor paragraph, or use the image button. Each image may be up to 1 MB. Images are embedded in Markdown as data URLs and are included in JSON backups and Markdown downloads without external hosting. SVG and executable data URLs are rejected. Browser storage capacity still applies: image-heavy notes and history may reach the local quota; the existing save error keeps the session available for download.

All new controls use the official shadcn/ui components and Brazilian Portuguese copy. Syntax highlighting uses Tiptap's CodeBlockLowlight extension and a selected set of highlight.js languages through lowlight, with semantic theme colors. Revision comparisons use the diff package. Integration tests allow 15 seconds for complete editor workflows in JSDOM.

### Local folders and refresh

The **Open folder** import action uses read-only access. Folder access uses the browser's directory picker with read-only permission when available. Other browsers use a directory file input. Imported files are workspace copies: editing, creating a folder, and saving a workspace never modify the originals on disk.

The native directory picker retains file handles during the session, allowing Refresh file to reread the current file. After reloading the application, or when using the fallback picker, Refresh file asks you to select the original file again. The selected filename must match the imported source. Both folder pickers import only Markdown documents and their ancestor folders. Unrelated files and folders are omitted; folders without Markdown documents show an error and leave the workspace unchanged. File extensions are checked case-insensitively on open and refresh, even when a picker filter is bypassed. Canceling a picker keeps the current workspace unchanged.

Imports skip `.git` and `node_modules`, support files up to 2 MB, and allow up to 20 MB of Markdown per import. Folder scanning is limited to 10,000 entries. Failed imports leave existing workspace data intact.

### Task dashboard

Open **Task dashboard** from the header or command palette to see checklists across all visible notes, including temporary drafts and examples. Filter by pending/completed status, folder (including descendants), document, or task text. Trashed notes are excluded. The counters describe the entire workspace; the list follows the selected filters.

Task extraction uses the GFM Markdown syntax tree: nested and quoted tasks are supported, while fenced code, indented code, inline code, and ordinary lists are excluded. Toggling a task replaces only its checkbox character in the original source, preserving formatting and line endings. Clicking its document opens the Markdown editor and selects that task. Task changes follow normal browser persistence; connected files remain pending until explicitly saved to disk.

### Connected local folder

Open **Local folder** from the header or command palette, then **Connect local folder**. This separate action requests read/write permission through the browser's [directory picker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker). It requires a supporting browser and a secure context (HTTPS or localhost). Unsupported browsers retain the read-only import and Markdown download workflows. No Docker, backend, or cloud service is required.

- Connection scans import Markdown files and preserve their relative paths. Empty folders can also be connected. The scan skips `.git` and `node_modules`, with limits of 10,000 entries, 2 MB per file, and 20 MB of Markdown per scan.
- Browser edits remain local until **Save document to folder** or an individual file's **Save** action. Existing files keep their filenames. New documents accept a relative Markdown path, create missing parent directories, and refuse to overwrite an existing file. Saving a temporary document also persists it in the browser.
- **Check folder changes** rescans the directory. Newly discovered files are imported; external edits load automatically only when the workspace copy has no competing edits. Missing files leave the workspace copy intact and require an explicit recreation decision. There is no background file watcher.
- Conflicts display the DevNotes and disk versions. Users can load the disk version or explicitly replace it with the DevNotes version. The content being replaced is retained in document history. Every save rereads the destination and checks it again around the temporary write; stale conflict decisions are rejected. The browser API does not provide a cross-application atomic compare-and-swap, so simultaneous external writes at the final commit boundary cannot be ruled out.
- File handles and synchronization baselines last for the current page session. After reload, reconnect the folder: a unique matching source path reuses its workspace note, while differences require a conflict decision because the previous baseline is unavailable. Matching uses the selected folder name and relative paths, not a persistent filesystem identity; choose the same physical folder when reconnecting. Multiple workspace copies with the same source path are rejected as ambiguous.
- Renaming, moving, trashing, or permanently deleting workspace items does not rename, move, or delete disk files. A trashed note is not resurrected by a scan; after permanent deletion and reconnection, a file still on disk can be imported again. Disconnecting retains the workspace notes. Handles and baselines are excluded from backups.

The connected-folder banner reports pending files relative to the latest manual scan. **Save page** and Ctrl/Cmd+S retain their browser-only behavior for connected-folder copies; disk writes use the explicit local-folder actions. Files opened through the local launcher instead save directly to their original paths with these commands.

### Persistence

Workspace pages and folders save automatically in `localStorage` in the current browser and origin. Existing notes from the previous storage format are read without deleting the original data; subsequent changes use the workspace format. Temporary documents are intentionally unsaved until Save workspace. The app requests the browser's normal leave-page confirmation when a temporary document contains text.

The ordinary web deployment has no backend, account authentication, or cloud sync. The optional local launcher adds a loopback file service with local session authorization. Clearing browser data removes the local workspace. Storage failures display an alert and keep session data available for export. If stored data is unreadable, saving replaces it as explained in the recovery alert. Download Markdown copies of documents you need to retain independently of the browser and reopen later.

## Commands

| Command                              | Purpose                                                               |
| ------------------------------------ | --------------------------------------------------------------------- |
| `npm run dev`                        | Start the development server                                          |
| `npm run build`                      | Check TypeScript and build into `dist/`                               |
| `npm run preview`                    | Preview the production build locally                                  |
| `npm run typecheck`                  | Check TypeScript                                                      |
| `npm run lint`                       | Check ESLint rules                                                    |
| `npm run lint:fix`                   | Apply automatic lint fixes                                            |
| `npm run format`                     | Format project files                                                  |
| `npm run format:check`               | Check formatting                                                      |
| `npm test`                           | Run tests in watch mode                                               |
| `npm run test:run`                   | Run tests once                                                        |
| `npm run test:coverage`              | Generate a coverage report                                            |
| `npm run local:open -- <file.md>`    | Open a Markdown file in the default browser through the local service |
| `npm run local:install -- --default` | Build and register the default Markdown handler on Linux              |
| `npm run local:stop`                 | Stop the background local service                                     |
| `npm run local:uninstall`            | Remove the Linux file handler                                         |
| `npm run test:local`                 | Test real local HTTP and filesystem operations                        |
| `npm run check`                      | Check formatting, lint, tests, types, and production build            |

## Project structure

```text
src/
├── app/                  # Application composition
├── components/ui/        # Official shadcn/ui registry components
├── features/notes/       # Notes UI, examples, state, persistence, and tests
├── hooks/                # Hooks installed by the registry
├── lib/                  # Shared shadcn/ui utilities
├── styles/               # Tailwind and official theme tokens
├── test/                 # Test environment setup
└── main.tsx              # React entry point
```

Domain components belong in `src/features`. Registry components belong in `src/components/ui`. The `@/` alias points to `src/`.

## UI conventions and shadcn MCP

The interface exclusively follows [shadcn/ui](https://ui.shadcn.com/), as required by [AGENTS.md](../AGENTS.md): official **Nova** component preset, **Radix** base, **Lucide** icons, and the approved **DevNotes** blue/navy identity. Preserve registry variants and use semantic theme tokens. Code and documentation use English. The interface, accessible labels, feedback, metadata, and bundled example prose use Brazilian Portuguese (pt-BR), with direct wording reviewed using the humanizer guidance. User-authored notes and imported documents retain their original language. Localized labels in official components preserve their structure and variants.

The visual identity follows the user-supplied DevNotes board (September 11, 2026):

- White and slate light surfaces; deep navy (`#0B1220`) dark surfaces; reference blue (`#3882F6`) in the brand.
- Locally bundled **Inter Variable** for the interface and **JetBrains Mono Variable** for code and metadata. Latin subsets avoid external font requests.
- A vector document/code mark at `public/devnotes-icon.svg`, reused in the sidebar, mobile toolbar, and browser favicon. The SVG is a simplified vector interpretation of the supplied raster mark.
- The **DevNotes** wordmark and a Brazilian Portuguese translation of the **Capture knowledge. Build better.** tagline.
- Document headings at 36/44 and 24/32 on desktop, body text at 16/24, and source text at 14/20.
- Blue selection states, semantic surface/border colors, and an 8 px base radius, applied through shadcn theme tokens. Primary control colors use darker blue in light mode and lighter blue with navy labels in dark mode to maintain readable contrast, including hover states.

Brand values are centralized in `src/styles/global.css` through the [official shadcn theming mechanism](https://ui.shadcn.com/docs/theming). The `neutral` base in `components.json` remains the registry scaffold; the approved identity overrides its theme tokens. Preserve these overrides when installing additional components. Registry component source and variants remain official.

The [official shadcn MCP server](https://ui.shadcn.com/docs/mcp) was queried through a terminal MCP client for registry configuration, the `sidebar-07`, `collapsible-demo`, `popover-demo`, `command-dialog`, and `resizable-demo` composition examples, and component installation commands. MCP is a development tool here; the editor itself does not provide an MCP integration. The server command is:

```bash
npx shadcn@latest mcp
```

The additional components were installed through the official CLI using the project's `components.json`:

```bash
npx shadcn@latest add sidebar tabs dialog table tooltip checkbox collapsible alert-dialog popover command kbd resizable
```

Installed components include Button, Card, Input, Textarea, Label, Badge, Alert, Empty, Separator, Sidebar, Sheet, Skeleton, Tabs, Dialog, Table, Tooltip, Checkbox, Collapsible, Alert Dialog, Popover, Command, Kbd, Input Group, and Resizable. Command uses the official `cmdk` dependency; Resizable uses `react-resizable-panels`. The sidebar mobile hook uses `useSyncExternalStore` to subscribe to viewport changes while satisfying the React Hooks lint rules. ESLint allows registry exports used by Fast Refresh and prevents direct HTML controls in feature components.

Markdown is parsed by `react-markdown` with `remark-gfm`; tables and task checkboxes are composed from shadcn/ui. Raw embedded HTML is skipped and the renderer's default URL filtering is retained.

After changing dependencies or configuration, keep this README and `package-lock.json` current and run `npm run check`. GitHub Actions runs the same checks for pushes and pull requests.

## Deployment

Run `npm run build` and host `dist/` on a static hosting service with HTTPS. `npm run preview` is for local verification. Treat any `VITE_*` environment variables as public because they are included in the browser bundle. Local `.env` files are ignored by Git.

The web deployment remains a static browser SPA. The optional `scripts/local/` service serves the same production build and a locally authenticated document API; do not deploy that service on a public host. Rebuild and restart the local service after changing its code.
