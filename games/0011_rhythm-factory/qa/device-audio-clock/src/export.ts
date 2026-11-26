const filename = 'game0011-stage-a2a-r3-device-qa.json';

export function exportJson(evidence: unknown): string {
  const json = JSON.stringify(evidence, (_name, value: unknown) =>
    typeof value === 'number' && !Number.isFinite(value) ? null : value, 2);
  if (typeof json !== 'string') throw new Error('JSONに変換できる計測結果がありません');
  return `${json}\n`;
}

export function downloadJson(json: string): { status: 'requested' | 'failed'; reason: string | null } {
  let link: HTMLAnchorElement | undefined;
  let url: string | undefined;
  try {
    link = document.createElement('a');
    if (!('download' in link) || typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
      return { status: 'failed', reason: 'このブラウザではファイル保存を要求できません' };
    }
    url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    // The test operator confirms that the browser actually saved the file.
    return { status: 'requested', reason: null };
  } catch {
    return { status: 'failed', reason: 'ブラウザにファイル保存を要求できませんでした' };
  } finally {
    link?.remove();
    if (url !== undefined) {
      const requestedUrl = url;
      globalThis.setTimeout(() => URL.revokeObjectURL(requestedUrl), 1_000);
    }
  }
}

export async function copyJson(json: string): Promise<{ status: 'confirmed' | 'failed'; reason: string | null }> {
  try {
    if (typeof navigator.clipboard?.writeText !== 'function') {
      return { status: 'failed', reason: 'クリップボードAPIを利用できません' };
    }
    await navigator.clipboard.writeText(json);
    return { status: 'confirmed', reason: null };
  } catch {
    return { status: 'failed', reason: 'ブラウザがクリップボードへの書き込みを拒否しました' };
  }
}
