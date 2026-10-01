import { useEffect, useRef, useState } from "react";
import type { Recipe } from "../../../lib/index.ts";
import { DESCRIBE_MODEL, describeToRecipe } from "./describe.ts";

const KEY_STORE = "vt.anthropic-key";
const readKey = () => {
  try {
    return localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
};

/**
 * "Describe it" panel: text and/or a photo → a recipe, using the viewer's own
 * Anthropic API key directly from the browser.
 */
export function Describe({ theme, onRecipe }: { theme: Recipe["theme"]; onRecipe: (r: Recipe, summary: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [key, setKey] = useState(readKey);
  const [remember, setRemember] = useState(() => !!readKey());
  const [image, setImage] = useState<{ name: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      if (remember && key) localStorage.setItem(KEY_STORE, key);
      else localStorage.removeItem(KEY_STORE);
    } catch {
      /* storage unavailable: key lives for this page only */
    }
  }, [remember, key]);

  const pickImage = async (f: File) => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return setError("Use a PNG, JPEG, WebP or GIF photo.");
    if (f.size > 5 * 1024 * 1024) return setError("That photo is over 5 MB. Use a smaller one.");
    const buf = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    setImage({ name: f.name, mediaType: f.type as "image/png", base64: btoa(bin) });
    setError(null);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    try {
      const r = await describeToRecipe({ apiKey: key.trim(), text, image: image ?? undefined, theme, signal: abort.current.signal });
      onRecipe(r.recipe, r.summary);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="describe-open" onClick={() => setOpen(true)}>
        <span aria-hidden="true">✦</span> Describe it instead
      </button>
    );
  }

  return (
    <form
      className="describe"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void run();
      }}
    >
      <label htmlFor="describe-text" className="describe-label">
        Describe the equipment
      </label>
      <textarea
        id="describe-text"
        rows={3}
        placeholder="Sanitary pump P-204, motor on the left, side discharge, running"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="describe-row">
        <label className="describe-photo">
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => e.target.files?.[0] && void pickImage(e.target.files[0])} />
          {image ? `Photo: ${image.name}` : "Add a photo"}
        </label>
        {image && (
          <button type="button" className="describe-link" onClick={() => setImage(null)}>
            Remove
          </button>
        )}
      </div>
      <label htmlFor="describe-key" className="describe-label">
        Your Anthropic API key
      </label>
      <input id="describe-key" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
      <label className="describe-remember">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device
      </label>
      <div className="describe-row">
        <button className="primary" type="submit" disabled={busy || !key.trim() || (!text.trim() && !image)}>
          {busy ? "Configuring…" : "Configure it"}
        </button>
        {busy ? (
          <button type="button" className="describe-link" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        ) : (
          <button type="button" className="describe-link" onClick={() => setOpen(false)}>
            Close
          </button>
        )}
      </div>
      {error && (
        <p className="describe-error" role="alert">
          {error}
        </p>
      )}
      <p className="hint">
        Your key goes straight from this browser to Anthropic ({DESCRIBE_MODEL}); Visual Toolkit has no server and never sees it. Claude only picks
        parameters. The generator draws the equipment, and you can adjust everything afterwards.
      </p>
    </form>
  );
}
