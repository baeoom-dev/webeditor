/**
 * 배포 번들 빌드 스크립트 (esbuild).
 *
 * 산출물 (dist/):
 *   webeditor.esm.js       — ES Module (모던 앱: import 사용, 소비자가 재번들)
 *   webeditor.iife.min.js  — IIFE 전역 `WebEditor` (레거시 페이지: <script> 태그)
 *   webeditor.css          — 스타일시트 (압축)
 *   webeditor.d.ts         — TypeScript 타입 정의
 */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const banner = `/*! ${pkg.name} v${pkg.version} | ${pkg.license} License */`;

await mkdir(dist, { recursive: true });

// 1) ESM 번들 (비압축 — 소비자 번들러가 최적화)
await build({
  entryPoints: [path.join(root, 'src/index.js')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: path.join(dist, 'webeditor.esm.js'),
  banner: { js: banner },
});

// 2) IIFE 번들 (압축 — <script> 태그 직행)
await build({
  entryPoints: [path.join(root, 'src/index.js')],
  bundle: true,
  format: 'iife',
  globalName: 'WebEditor',
  target: 'es2018',
  minify: true,
  outfile: path.join(dist, 'webeditor.iife.min.js'),
  banner: { js: banner },
});

// 3) CSS (압축)
await build({
  entryPoints: [path.join(root, 'src/styles/editor.css')],
  minify: true,
  outfile: path.join(dist, 'webeditor.css'),
  banner: { css: banner },
});

// 4) 폰트 CSS (외부 CDN @import 만 담은 옵션 파일 — 그대로 복사, 배너만 부착)
{
  const fontsCss = await readFile(path.join(root, 'src/styles/fonts.css'), 'utf8');
  await writeFile(path.join(dist, 'webeditor-fonts.css'), `${banner}\n${fontsCss}`);
}

// 5) 타입 정의 복사
await copyFile(path.join(root, 'types/webeditor.d.ts'), path.join(dist, 'webeditor.d.ts'));

// 산출물 크기 리포트
const { stat } = await import('node:fs/promises');
const report = [];
for (const f of ['webeditor.esm.js', 'webeditor.iife.min.js', 'webeditor.css', 'webeditor-fonts.css', 'webeditor.d.ts']) {
  const s = await stat(path.join(dist, f));
  report.push(`  ${f.padEnd(24)} ${(s.size / 1024).toFixed(1)} KB`);
}
process.stdout.write(`빌드 완료 (dist/)\n${report.join('\n')}\n`);
