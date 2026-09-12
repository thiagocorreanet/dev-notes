import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Checkbox } from '@/components/ui/checkbox'

export function TaskItemView({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) {
  return (
    <NodeViewWrapper
      as="li"
      data-type="taskItem"
      className="flex items-start gap-2"
    >
      <span contentEditable={false} className="mt-1">
        <Checkbox
          aria-label="Tarefa concluída"
          checked={node.attrs.checked === true}
          disabled={!editor.isEditable}
          onCheckedChange={(checked) =>
            updateAttributes({ checked: checked === true })
          }
        />
      </span>
      <NodeViewContent className="min-w-0 flex-1" />
    </NodeViewWrapper>
  )
}
