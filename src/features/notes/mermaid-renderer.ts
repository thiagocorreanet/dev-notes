export interface DiagramPalette {
  dark: boolean
  background: string
  foreground: string
  surface: string
  border: string
  primary: string
  fontFamily: string
}

let renderQueue: Promise<unknown> = Promise.resolve()

export function renderMermaid(
  source: string,
  palette: DiagramPalette,
  signal?: AbortSignal,
): Promise<string> {
  const task = renderQueue.then(async () => {
    signal?.throwIfAborted()
    if (!source.trim()) throw new Error('Empty diagram')
    if (source.length > 50_000)
      throw new Error('Diagram exceeds the rendering limit')
    const { default: mermaid } = await import('mermaid')
    await document.fonts?.ready
    signal?.throwIfAborted()
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      maxTextSize: 50_000,
      maxEdges: 500,
      htmlLabels: false,
      theme: 'base',
      fontFamily: palette.fontFamily,
      themeVariables: {
        darkMode: palette.dark,
        background: palette.background,
        primaryColor: palette.surface,
        primaryTextColor: palette.foreground,
        primaryBorderColor: palette.primary,
        lineColor: palette.foreground,
        textColor: palette.foreground,
        mainBkg: palette.surface,
        nodeBorder: palette.border,
        clusterBkg: palette.background,
        clusterBorder: palette.border,
        edgeLabelBackground: palette.background,
      },
      secure: [
        'securityLevel',
        'startOnLoad',
        'maxTextSize',
        'maxEdges',
        'suppressErrorRendering',
        'htmlLabels',
        'theme',
        'themeVariables',
        'themeCSS',
        'fontFamily',
        'dompurifyConfig',
      ],
    })
    const container = document.createElement('div')
    container.style.cssText =
      'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;'
    container.setAttribute('aria-hidden', 'true')
    document.body.append(container)
    try {
      const { svg } = await mermaid.render(
        `diagram-${crypto.randomUUID()}`,
        source,
        container,
      )
      const svgDocument = new DOMParser().parseFromString(svg, 'image/svg+xml')
      const root = svgDocument.documentElement
      const bounds = root
        .getAttribute('viewBox')
        ?.split(/[\s,]+/)
        .map(Number)
      // Mermaid uses percentage dimensions for inline SVG; images need an
      // intrinsic size to avoid the browser's small default image viewport.
      const width = bounds?.[2] ?? 0
      const height = bounds?.[3] ?? 0
      if (bounds?.length === 4 && width > 0 && height > 0) {
        root.setAttribute('width', String(width))
        root.setAttribute('height', String(height))
      }
      // Keep the diagram legible when printing a dark-theme document on paper.
      root.style.backgroundColor = palette.background
      // SVG images cannot execute scripts or affect the surrounding document.
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svgDocument))}`
    } finally {
      container.remove()
    }
  })
  // A malformed diagram must not prevent subsequent diagrams from rendering.
  renderQueue = task.catch(() => undefined)
  return task
}
