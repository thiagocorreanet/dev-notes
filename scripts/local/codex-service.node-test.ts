import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CodexServiceError, parseCodexReply } from './codex-service.ts'

void test('parses structured Codex replies without changing Markdown', () => {
  assert.deepEqual(
    parseCodexReply(
      'thread-1',
      JSON.stringify({
        message: 'Review ready.',
        proposedMarkdown: '# Exact Markdown\n\nContent',
        proposalSummary: '  Improved structure.  ',
      }),
    ),
    {
      threadId: 'thread-1',
      message: 'Review ready.',
      proposedMarkdown: '# Exact Markdown\n\nContent',
      proposalSummary: 'Improved structure.',
    },
  )
})

void test('rejects malformed, incomplete, and oversized Codex replies', () => {
  for (const raw of [
    'not JSON',
    JSON.stringify({
      message: 'Missing fields.',
      proposedMarkdown: null,
    }),
    JSON.stringify({
      message: 'Wrong field type.',
      proposedMarkdown: 42,
      proposalSummary: null,
    }),
    JSON.stringify({
      message: 'Oversized.',
      proposedMarkdown: 'x'.repeat(2 * 1024 * 1024 + 1),
      proposalSummary: null,
    }),
  ]) {
    assert.throws(
      () => parseCodexReply('thread-1', raw),
      (error) =>
        error instanceof CodexServiceError && error.code === 'invalidResponse',
    )
  }
})
