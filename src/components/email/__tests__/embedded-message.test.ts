import { describe, expect, it } from 'vitest';
import { emlPreviewFromBytes, unwrapEmbeddedMessage } from '../use-body-override';

const message = (lines: string[]) => new TextEncoder().encode(lines.join('\r\n'));

describe('embedded message parsing', () => {
  it('does not decode an unsupported transfer encoding as base64', async () => {
    const preview = await emlPreviewFromBytes(message([
      'Subject: Encoded attachment',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: x-base64',
      '',
      'SGVsbG8=',
    ]));
    expect(preview.text?.trim()).toBe('SGVsbG8=');
  });

  it('preserves inline images and downloaded attachment bytes', async () => {
    const parsed = await unwrapEmbeddedMessage(message([
      'Content-Type: multipart/related; boundary=parts', '',
      '--parts', 'Content-Type: text/html', '', '<img src="cid:picture">',
      '--parts', 'Content-Type: image/png', 'Content-ID: <picture>',
      'Content-Disposition: inline; filename=picture.png', 'Content-Transfer-Encoding: base64', '',
      'iVBORw0KGgo=', '--parts', 'Content-Type: application/octet-stream',
      'Content-Disposition: attachment; filename=file.bin', 'Content-Transfer-Encoding: base64', '',
      'AAEC', '--parts--', '',
    ]));
    expect(parsed.html).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(parsed.attachments).toEqual([
      { name: 'file.bin', type: 'application/octet-stream', size: 3, bytes: new Uint8Array([0, 1, 2]) },
    ]);
  });
});
