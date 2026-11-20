import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PNG } from 'pngjs';
import { scanQrCodeTool } from './scan_qr_code.js';

export async function testScanQrCode() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram-test-qr-'));
  const imgPath = path.join(tmpDir, 'blank.png');
  const png = new PNG({ width: 32, height: 32 });
  png.data.fill(255);
  await fs.writeFile(imgPath, PNG.sync.write(png));

  const res = await scanQrCodeTool.execute(
    { image_path: imgPath },
    { sessionId: 'test', workspace: tmpDir, visionSupport: true }
  );
  assert.strictEqual(res.image_path, imgPath);
  assert.strictEqual(res.success, false);
  await fs.rm(tmpDir, { recursive: true, force: true });
}
