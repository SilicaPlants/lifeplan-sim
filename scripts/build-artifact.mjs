/**
 * dist-single/index.html（1 枚にまとめたビルド結果）を Artifact 用の断片に変換する。
 * Artifact は publish 時に <!doctype html><head>…</head><body> を付けるため、
 * こちらは title / style / #root / script だけを並べたファイルを出す。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'dist-single/index.html';
const OUT = 'dist-single/artifact.html';
const TITLE = 'LifePlanSim';
// ExcelJS は配布物に不正なバイト列を含み HTML に埋め込めないため、CDN から読み込む
const EXCELJS_CDN =
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"></script>';

const html = readFileSync(SRC, 'utf8');
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);

if (scripts.length === 0) {
  throw new Error(`${SRC} にスクリプトが見つかりません。先に npm run build:single を実行してください。`);
}

const out = [
  `<title>${TITLE}</title>`,
  ...styles,
  EXCELJS_CDN,
  '<div id="root"></div>',
  ...scripts,
  '',
].join('\n');

if (out.includes('\uFFFD')) {
  throw new Error('置換文字（U+FFFD）が含まれています。Artifact に公開できません。');
}

writeFileSync(OUT, out);
const kb = Math.round(Buffer.byteLength(out) / 1024);
console.log(`${OUT} を書き出しました（${kb} KB / style ${styles.length} 個・script ${scripts.length} 個）`);
