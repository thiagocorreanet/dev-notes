import { createLowlight } from 'lowlight'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import csharp from 'highlight.js/lib/languages/csharp'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import plaintext from 'highlight.js/lib/languages/plaintext'

export const lowlight = createLowlight({
  javascript,
  typescript,
  python,
  csharp,
  json,
  bash,
  sql,
  css,
  xml,
  yaml,
  plaintext,
})
export const codeLanguages = [
  ['auto', 'Detectar linguagem'],
  ['plaintext', 'Texto simples'],
  ['mermaid', 'Mermaid'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['python', 'Python'],
  ['csharp', 'C#'],
  ['json', 'JSON'],
  ['bash', 'Bash'],
  ['sql', 'SQL'],
  ['css', 'CSS'],
  ['xml', 'HTML / XML'],
  ['yaml', 'YAML'],
] as const
