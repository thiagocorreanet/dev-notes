import { Check, FilePenLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { DocumentProposal } from '../ai-chat'
import { MarkdownPreview } from './markdown-preview'

export function AiProposalDialog({
  proposal,
  canApply,
  onApply,
  onClose,
}: {
  proposal: DocumentProposal
  canApply: boolean
  onApply: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex max-h-[min(52rem,calc(100dvh-2rem))] flex-col sm:max-w-4xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              <FilePenLine aria-hidden="true" />
              Sugestão do Codex
            </Badge>
          </div>
          <DialogTitle>
            Revisar alteração em “{proposal.documentTitle}”
          </DialogTitle>
          <DialogDescription>
            Confira o documento completo antes de aplicar. Nada será alterado
            sem sua confirmação.
          </DialogDescription>
        </DialogHeader>
        {proposal.summary && (
          <p className="rounded-lg border bg-muted/50 p-3 text-sm">
            {proposal.summary}
          </p>
        )}
        <Tabs defaultValue="preview" className="min-h-0 flex-1">
          <TabsList>
            <TabsTrigger value="preview">Visualizar</TabsTrigger>
            <TabsTrigger value="markdown">Markdown</TabsTrigger>
          </TabsList>
          <TabsContent
            value="preview"
            className="mt-3 max-h-[55dvh] overflow-y-auto rounded-lg border bg-background p-5"
          >
            <MarkdownPreview content={proposal.markdown} headingIds />
          </TabsContent>
          <TabsContent value="markdown" className="mt-3 min-h-0">
            <Textarea
              aria-label="Markdown sugerido"
              readOnly
              value={proposal.markdown}
              className="min-h-[45dvh] resize-none font-mono text-xs"
            />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Manter documento atual
          </Button>
          <Button type="button" onClick={onApply} disabled={!canApply}>
            <Check aria-hidden="true" />
            Aplicar alteração
          </Button>
        </DialogFooter>
        {!canApply && (
          <p className="text-right text-xs text-muted-foreground">
            Abra e desbloqueie este documento para aplicar a alteração.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
