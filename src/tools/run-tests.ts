import { testFileWrite } from './file_write/file_write.test.js';
import { testFileRead } from './file_read/file_read.test.js';
import { testFileList } from './file_list/file_list.test.js';
import { testReadDirectory } from './read_directory/read_directory.test.js';
import { testGrep } from './grep/grep.test.js';
import { testAstgrep } from './astgrep/astgrep.test.js';
import { testGlob } from './glob/glob.test.js';
import { testStrReplace } from './str_replace/str_replace.test.js';
import { testApplyPatch } from './apply_patch/apply_patch.test.js';
import { testReadImage } from './read_image/read_image.test.js';
import { testScanQrCode } from './scan_qr_code/scan_qr_code.test.js';
import { testFetchTextFromImage } from './fetch_text_from_image/fetch_text_from_image.test.js';
import { testArchiveFiles } from './archive_files/archive_files.test.js';
import { testExtractArchive } from './extract_archive/extract_archive.test.js';
import { testShallTool } from './shall_tool/shall_tool.test.js';

async function runAll() {
  console.log('Running Mythgram Native Tool Tests...');
  await testFileWrite();
  await testFileRead();
  await testFileList();
  await testReadDirectory();
  await testGrep();
  await testAstgrep();
  await testGlob();
  await testStrReplace();
  await testApplyPatch();
  await testReadImage();
  await testScanQrCode();
  await testFetchTextFromImage();
  await testArchiveFiles();
  await testExtractArchive();
  await testShallTool();
  console.log('All 15 Mythgram Native Tools Passed Tests!');
}

runAll().catch((err) => {
  console.error('Tool test failed:', err);
  process.exit(1);
});
