const operatingSystems: Record<string, string> = {
  Linux: 'os:linux',
  Windows: 'os:windows',
  macOS: 'os:macos',
  Other: 'os:other',
}
const browsers: Record<string, string> = {
  Chrome: 'browser:chrome',
  Chromium: 'browser:chromium',
  Firefox: 'browser:firefox',
  Safari: 'browser:safari',
  Edge: 'browser:edge',
  Other: 'browser:other',
}
export const managedLabels = [
  ...Object.values(operatingSystems),
  ...Object.values(browsers),
]

export function labelsForIssue(body: string) {
  function field(heading: string) {
    return (
      new RegExp(`^### ${heading}\\r?\\n\\s*([^\\r\\n]+)`, 'm')
        .exec(body)?.[1]
        ?.trim() ?? ''
    )
  }
  return [
    Object.hasOwn(operatingSystems, field('Operating system'))
      ? operatingSystems[field('Operating system')]
      : undefined,
    Object.hasOwn(browsers, field('Browser'))
      ? browsers[field('Browser')]
      : undefined,
  ].filter((label): label is string => !!label)
}
