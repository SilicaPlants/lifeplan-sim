/**
 * SVG 要素を PNG 画像に変換する。
 * 画面の SVG は色を CSS 変数で指定しているため、そのままでは書き出せない。
 * 実際に計算された色を 1 要素ずつ写し取ってから直列化する。
 */
export async function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const srcNodes = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const dstNodes = [clone, ...Array.from(clone.querySelectorAll('*'))];
  srcNodes.forEach((src, i) => {
    const dst = dstNodes[i] as SVGElement | undefined;
    if (!dst) return;
    const cs = window.getComputedStyle(src as Element);
    dst.setAttribute('fill', cs.fill);
    dst.setAttribute('stroke', cs.stroke);
    if (cs.strokeWidth) dst.setAttribute('stroke-width', cs.strokeWidth);
    if (cs.strokeDasharray && cs.strokeDasharray !== 'none') {
      dst.setAttribute('stroke-dasharray', cs.strokeDasharray);
    }
    if (cs.opacity && cs.opacity !== '1') dst.setAttribute('opacity', cs.opacity);
    if (src instanceof SVGTextElement) {
      dst.setAttribute('font-family', cs.fontFamily);
      dst.setAttribute('font-size', cs.fontSize);
      dst.setAttribute('font-weight', cs.fontWeight);
    }
  });

  // 背景（透過のままだと貼り付け先で文字が読めなくなる）
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute(
    'fill',
    window.getComputedStyle(document.body).getPropertyValue('--surface-1').trim() || '#ffffff',
  );
  clone.insertBefore(bg, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('画像の生成に失敗しました'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像の生成に失敗しました');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('画像の生成に失敗しました'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** クリップボードへ画像をコピーする。使えない環境では false を返す */
export async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

export { saveFile as downloadBlob } from './download';
