import assert from 'node:assert/strict'
import { test } from 'node:test'
import { labelsForIssue } from './issue-labels.ts'

void test('reads issue form selections with Unix and Windows line endings', () => {
  const body =
    '### Operating system\n\nLinux\n\n### Browser\n\nFirefox\n\n### Steps to reproduce\n\nOpen a file'
  assert.deepEqual(labelsForIssue(body), ['os:linux', 'browser:firefox'])
  assert.deepEqual(labelsForIssue(body.replaceAll('\n', '\r\n')), [
    'os:linux',
    'browser:firefox',
  ])
})
void test('ignores free text, missing fields, and unknown values', () => {
  assert.deepEqual(labelsForIssue('Linux Firefox'), [])
  assert.deepEqual(
    labelsForIssue(
      '### Operating system\n\n__proto__\n\n### Browser\n\nconstructor',
    ),
    [],
  )
  assert.deepEqual(
    labelsForIssue(
      '### Operating system\n\n$(some-command)\n\n### Browser\n\n_No response_',
    ),
    [],
  )
  assert.deepEqual(labelsForIssue('### Operating system\n\nOther'), [
    'os:other',
  ])
})
