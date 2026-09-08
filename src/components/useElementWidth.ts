import { useEffect, useState, type RefObject } from 'react';

/** 要素の実測幅を返す（SVG チャートの横幅をレスポンシブにするため） */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 720): number {
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    const update = () => setWidth(el?.clientWidth || fallback);
    update();
    const ro = el ? new ResizeObserver(update) : null;
    if (el && ro) ro.observe(el);
    // 画面の回転やウィンドウ幅の変化も拾う（ResizeObserver が働かない場合の保険）
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref, fallback]);

  return width;
}
