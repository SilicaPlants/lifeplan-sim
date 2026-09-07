/**
 * ファイルの保存。
 * claude.ai の Artifact として公開したページでは通常のダウンロードが使えないため、
 * downloads capability が使えるときはそちらへ渡し、それ以外は従来どおり <a download> で保存する。
 */

type DownloadsNamespace = {
  save: (request: { filename: string; data: Blob | string }) => Promise<{ status: string }>;
};

type ClaudeGlobal = {
  use?: (name: string) => Promise<DownloadsNamespace | null>;
};

let cached: Promise<DownloadsNamespace | null> | null = null;

function getDownloads(): Promise<DownloadsNamespace | null> {
  const claude = (globalThis as { claude?: ClaudeGlobal }).claude;
  if (!claude?.use) return Promise.resolve(null);
  if (!cached) cached = claude.use('downloads').catch(() => null);
  return cached;
}

/** Artifact 上では解決に少し時間がかかるため、先に問い合わせておく */
export function warmUpDownloads(): void {
  void getDownloads();
}

/**
 * このページでファイルを保存できるか。
 * claude.ai 上で公開共有されている Artifact は downloads を使えず、
 * 通常のダウンロードも無効化されるため false になる。
 */
export async function canSaveFiles(): Promise<boolean> {
  const claude = (globalThis as { claude?: ClaudeGlobal }).claude;
  if (!claude?.use) return true;
  return (await getDownloads()) !== null;
}

export type SaveResult = 'saved' | 'declined' | 'failed';

export async function saveFile(data: Blob, filename: string): Promise<SaveResult> {
  const downloads = await getDownloads();
  if (downloads) {
    try {
      await downloads.save({ filename, data });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') return 'declined';
      if (code === 'rate_limited') return 'failed';
      // それ以外は通常のダウンロードを試す
    }
  }

  try {
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
  } catch {
    return 'failed';
  }
}
