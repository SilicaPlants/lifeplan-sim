import { useEffect, useState, type RefObject } from 'react';

/** 要素の実測幅を返す（SVG チャートの横幅をレスポンシブにするため） */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 720): number {
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || fallback);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fallback]);

  return width;
}
