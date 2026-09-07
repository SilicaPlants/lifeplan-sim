/**
 * Artifact 版のビルド専用スタブ。
 * ExcelJS の配布物には壊れたバイト列（U+FFFD）が含まれていて 1 枚の HTML に埋め込めないため、
 * Artifact 版だけ CDN から読み込む。実体は window.ExcelJS を参照する（excel.ts 側で解決）。
 */
export default undefined as unknown;
