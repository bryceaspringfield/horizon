// A PDF's text as lines, read in the browser with pdf.js (loaded only when a PDF is uploaded): items on the same
// baseline joined left to right, lines top to bottom, page by page.
export async function pdfLines(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const items = (await (await doc.getPage(n)).getTextContent()).items as { str: string; transform: number[] }[];
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of items) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5]);
      const k = [...rows.keys()].find((q) => Math.abs(q - y) <= 2) ?? y;
      (rows.get(k) ?? rows.set(k, []).get(k)!).push({ x: it.transform[4], s: it.str });
    }
    for (const k of [...rows.keys()].sort((a, b) => b - a)) out.push(rows.get(k)!.sort((a, b) => a.x - b.x).map((r) => r.s).join(' '));
  }
  return out;
}
