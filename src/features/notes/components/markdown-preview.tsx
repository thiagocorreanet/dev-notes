import { CodeBlock } from './code-block'
import { MermaidDiagram } from './mermaid-diagram'
import { NoteLink } from './note-link'
import { remarkNoteLinks } from '../note-links'
import { markdownUrl } from '../image-files'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function MarkdownPreview({
  content,
  headingIds = false,
}: {
  content: string
  headingIds?: boolean
}) {
  return (
    <div
      data-markdown-body
      data-highlight-root
      className="min-w-0 space-y-4 text-base leading-6 wrap-anywhere [&_blockquote]:border-l-2 [&_blockquote]:pl-5 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_code]:leading-5 [&_h1]:mt-10 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-10 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-8 [&_h2]:tracking-tight [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold [&_li]:mt-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-6"
    >
      <Markdown
        remarkPlugins={[remarkGfm, remarkNoteLinks]}
        urlTransform={markdownUrl}
        skipHtml
        components={{
          pre: ({ node, children }) => {
            const code = node?.children.find(
              (child) => child.type === 'element' && child.tagName === 'code',
            )
            if (!code || code.type !== 'element') return <pre>{children}</pre>
            const language =
              (Array.isArray(code.properties.className)
                ? code.properties.className.join(' ')
                : ''
              ).match(/language-([^ ]+)/)?.[1] ?? ''
            const text = code.children
              .map((child) => (child.type === 'text' ? child.value : ''))
              .join('')
            return language.toLowerCase() === 'mermaid' ? (
              <MermaidDiagram code={text} />
            ) : (
              <CodeBlock code={text} language={language} />
            )
          },
          h1: ({ node, children }) => (
            <h1
              id={
                headingIds
                  ? `document-heading-${node?.position?.start.offset ?? 0}`
                  : undefined
              }
              tabIndex={-1}
            >
              {children}
            </h1>
          ),
          h2: ({ node, children }) => (
            <h2
              id={
                headingIds
                  ? `document-heading-${node?.position?.start.offset ?? 0}`
                  : undefined
              }
              tabIndex={-1}
            >
              {children}
            </h2>
          ),
          h3: ({ node, children }) => (
            <h3
              id={
                headingIds
                  ? `document-heading-${node?.position?.start.offset ?? 0}`
                  : undefined
              }
              tabIndex={-1}
            >
              {children}
            </h3>
          ),
          h4: ({ node, children }) => (
            <h4
              id={
                headingIds
                  ? `document-heading-${node?.position?.start.offset ?? 0}`
                  : undefined
              }
              tabIndex={-1}
            >
              {children}
            </h4>
          ),
          h5: ({ node, children }) => (
            <h5
              id={
                headingIds
                  ? `document-heading-${node?.position?.start.offset ?? 0}`
                  : undefined
              }
              tabIndex={-1}
            >
              {children}
            </h5>
          ),
          h6: ({ node, children }) => (
            <h6
              id={
                headingIds
                  ? `document-heading-${node?.position?.start.offset ?? 0}`
                  : undefined
              }
              tabIndex={-1}
            >
              {children}
            </h6>
          ),
          table: ({ children }) => <Table>{children}</Table>,
          thead: ({ children }) => <TableHeader>{children}</TableHeader>,
          tbody: ({ children }) => <TableBody>{children}</TableBody>,
          tr: ({ children }) => <TableRow>{children}</TableRow>,
          th: ({ children }) => <TableHead>{children}</TableHead>,
          td: ({ children }) => <TableCell>{children}</TableCell>,
          input: ({ checked }) => (
            <Checkbox
              checked={checked ?? false}
              disabled
              aria-label="Status da tarefa"
            />
          ),
          a: ({ children, href }) => (
            <NoteLink href={href}>{children}</NoteLink>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
