import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { usePanelRef } from 'react-resizable-panels'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { useSidebar } from '@/components/ui/sidebar'
import {
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  readSidebarWidth,
  saveSidebarWidth,
} from '../sidebar-width'

export function ResizableWorkspace({
  sidebar,
  children,
  focused = false,
}: {
  sidebar: ReactNode
  children: ReactNode
  focused?: boolean
}) {
  const { isMobile, open, setOpen } = useSidebar()
  const visible = open && !focused
  const [initialWidth] = useState(readSidebarWidth)
  const preferredWidth = useRef(initialWidth)
  const panelRef = usePanelRef()
  const groupElementRef = useRef<HTMLDivElement>(null)
  const handleElementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isMobile) return
    if (visible) panelRef.current?.resize(preferredWidth.current)
    else panelRef.current?.collapse()
  }, [isMobile, visible, panelRef])

  if (isMobile)
    return (
      <>
        {!focused && sidebar}
        {children}
      </>
    )

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      id="workspace-layout"
      elementRef={groupElementRef}
      onLayoutChanged={(layout, { isUserInteraction }) => {
        if (!isUserInteraction || focused) return
        const panel = panelRef.current
        if (!panel) return
        const collapsed = panel.isCollapsed()
        if (open === collapsed) setOpen(!collapsed)
        if (!collapsed) {
          // The callback precedes the DOM update for keyboard resizing.
          const available =
            (groupElementRef.current?.clientWidth ?? 0) -
            (handleElementRef.current?.offsetWidth ?? 0)
          const width = (available * (layout['workspace-sidebar'] ?? 0)) / 100
          if (width < MIN_SIDEBAR_WIDTH) return
          preferredWidth.current = width
          saveSidebarWidth(width)
        }
      }}
    >
      <ResizablePanel
        id="workspace-sidebar"
        panelRef={panelRef}
        defaultSize={initialWidth}
        minSize={MIN_SIDEBAR_WIDTH}
        maxSize={MAX_SIDEBAR_WIDTH}
        groupResizeBehavior="preserve-pixel-size"
        collapsible
        collapsedSize={0}
      >
        <div
          className="h-full w-full overflow-hidden"
          inert={!visible}
          aria-hidden={!visible}
        >
          {sidebar}
        </div>
      </ResizablePanel>
      <ResizableHandle
        elementRef={handleElementRef}
        withHandle
        aria-label="Ajustar largura da barra lateral"
        title="Arraste para ajustar. Use as setas do teclado ou dê dois cliques para restaurar a largura."
        disabled={!visible}
        className={visible ? undefined : 'hidden'}
        disableDoubleClick
        onDoubleClick={() => {
          preferredWidth.current = DEFAULT_SIDEBAR_WIDTH
          panelRef.current?.resize(DEFAULT_SIDEBAR_WIDTH)
          saveSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
        }}
      />
      <ResizablePanel id="workspace-document" minSize={360}>
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
