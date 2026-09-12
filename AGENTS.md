# Project conventions

## Language: English code and documentation, Brazilian Portuguese interface

Use English for code and documentation. By explicit user request, all user-facing interface copy must use natural Brazilian Portuguese (pt-BR). Apply these preferences to every future change in this repository.

- Use English for identifiers, file names, comments, docstrings, test descriptions, and internal diagnostic messages.
- Use Brazilian Portuguese for visible interface text, accessible labels, tooltips, placeholders, validation and error messages, page metadata, and bundled example prose. Keep technical names and code examples intact.
- Review interface copy using the humanizer guidance: clear, direct wording without inflated claims or filler.
- Write all documentation, including README files, architecture decisions, development guides, and agent instructions, in English.
- Write documentation in English and interface copy in Brazilian Portuguese. Preserve user-authored and imported documents in their original language.
- Preserve externally defined identifiers and contracts when translating them would break compatibility.
- This requirement concerns project artifacts; conversation with the user may remain in Portuguese.

## UI: shadcn/ui exclusively

By explicit user decision, the entire interface must follow shadcn/ui: https://ui.shadcn.com/.

- Use the official components installed in `src/components/ui` and compositions documented by shadcn/ui.
- Install additional components with `npx shadcn@latest add <component>`, using the official registry and the configuration in `components.json`.
- Preserve the official Nova component preset and variants. Apply the approved DevNotes brand through semantic theme tokens and typography, without creating a parallel visual library or custom controls.
- Do not add other component libraries. Dependencies used by official components, such as Radix, Lucide, and Tailwind, are part of this integration.
- Use semantic theme tokens such as `bg-background`, `text-foreground`, `text-muted-foreground`, and `border-border`. Brand colors belong in `src/styles/global.css`; fixed logo artwork may contain its brand colors. Do not scatter literal colors through feature components or add CSS that redesigns controls.
- Semantic HTML and Tailwind utilities are allowed for structure, responsiveness, spacing, typography, and accessibility; controls must come from `@/components/ui/*`.
- Domain components belong in `src/features`; registry components belong in `src/components/ui`. Compose components within each feature while preserving the official components.
- The approved visual Markdown editor uses Tiptap as a headless document engine. Its editable document and table nodes may use the engine's DOM structure; toolbars, task checkboxes, and other interface controls remain official shadcn/ui components. Document typography and table layout use semantic theme tokens.
- Mermaid renders Markdown diagram content as SVG images. It is a document renderer, not an interface component library; surrounding controls remain shadcn/ui.

## Approved visual identity

The user supplied a DevNotes identity board on September 11, 2026 and explicitly requested its application. This updates the earlier Neutral/Geist-only theme restriction.

- Use the blue and navy DevNotes identity, with white/slate light surfaces and deep navy dark surfaces.
- Use Inter for interface and document typography and JetBrains Mono for source code and metadata.
- Use the document/code brand mark in `public/devnotes-icon.svg`, with the DevNotes wordmark and the localized tagline meaning "Capture knowledge. Build better."
- Keep accessible text contrast. The primary blue may be adjusted for control labels while retaining the reference blue in the brand assets.
- Maintain the existing workspace functionality and responsive shadcn/ui compositions. The identity board is a visual reference, not a request to add the example product features shown in it.

## Validation

- Preserve strict TypeScript and accessibility.
- Run `npm run check` after changes and resolve any failures before finishing.
- Keep the README and `package-lock.json` current when changing configuration or dependencies.
