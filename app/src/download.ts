import type { ExportFile } from "../../lib/index.ts";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadFile(f: ExportFile) {
  downloadBlob(new Blob([f.content], { type: f.mime }), f.filename);
}

/** Rasterise an SVG string in the browser (no server). */
export async function svgToPng(svg: string, width: number): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    img.src = url;
    await img.decode();
    const scale = width / img.naturalWidth;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("PNG encode failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
