import { useEffect, useRef, useState } from "react";
import { generate, getTheme, renderSvg, type Recipe, type TokenName, type VtObject } from "../../../lib/index.ts";
import { downloadFile } from "../download.ts";
import { GALLERY } from "../gallery.ts";
import { loadPackFromUrl, parsePack, readMyPack, toPackFile, writeMyPack, type Pack, type PackEntry } from "../packs.ts";
import { PageHeader } from "../ui/controls.tsx";

function Card({ id, title, description, by, recipe, onOpen, onRemove }: { id: string; title: string; description?: string; by?: string; recipe: Recipe; onOpen: (r: Recipe) => void; onRemove?: () => void }) {
  let vo: VtObject | null = null;
  try {
    vo = generate(recipe.generator, recipe.params, recipe.version);
  } catch {
    /* generator not in this build */
  }
  const t = getTheme(recipe.theme === "dark" ? "dark" : "light");
  return (
    <article className="card">
      <div className="card-art" style={{ background: { ...t.tokens, ...recipe.tokens }["surface.canvas"] }}>
        {vo ? <div dangerouslySetInnerHTML={{ __html: renderSvg(vo, { ...recipe, theme: t.id, idPrefix: `g-${id}`, embedRecipe: false }) }} /> : <span className="hint">Needs a newer build</span>}
      </div>
      <div className="card-body">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
        <div className="card-foot">
          <span className="by">{by ? `@${by}` : ""}</span>
          <span className="card-actions">
            {onRemove && (
              <button className="describe-link" onClick={onRemove}>
                Remove
              </button>
            )}
            <button disabled={!vo} onClick={() => onOpen(recipe)}>
              Open
            </button>
          </span>
        </div>
      </div>
    </article>
  );
}

export function GalleryPage({
  onOpen,
  packUrl,
  onApplyTheme,
  notify,
}: {
  onOpen: (r: Recipe) => void;
  packUrl?: string;
  onApplyTheme: (base: "light" | "dark", tokens: Partial<Record<TokenName, string>>) => void;
  notify: (m: string) => void;
}) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [source, setSource] = useState<string | undefined>(packUrl);
  const [url, setUrl] = useState(packUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<PackEntry[]>(readMyPack);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (u: string) => {
    setError(null);
    try {
      const p = await loadPackFromUrl(u);
      setPack(p);
      setSource(u);
      history.replaceState(null, "", `#/symbols/gallery?pack=${encodeURIComponent(u)}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (packUrl) void load(packUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packUrl]);

  return (
    <div className="page">
      <PageHeader eyebrow="Symbols" title="Gallery">
        Designs shared by the community, plus packs your team hosts anywhere. Each design is a tiny recipe, regenerated live. Open one and keep building.
      </PageHeader>

      <section className="panel-card pack-bar">
        <h2 className="block-title">Packs</h2>
        <form
          className="pack-load"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) void load(url.trim());
          }}
        >
          <label htmlFor="pack-url" className="visually-hidden">
            Pack URL
          </label>
          <input id="pack-url" type="url" placeholder="https://…/team.pack.json" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="submit">Load pack</button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Open pack file…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                setPack(parsePack(JSON.parse(await f.text())));
                setSource(undefined);
                setError(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </form>
        {error && (
          <p className="describe-error" role="alert">
            {error}
          </p>
        )}
        <p className="hint">
          A pack is a JSON file of designs and an optional team theme. Host it anywhere that allows cross-origin reads, such as a GitHub raw link. Packs are data
          only and never run code.
        </p>
      </section>

      {pack && (
        <section className="pack-section">
          <div className="pack-head">
            <div>
              <h2>{pack.name}</h2>
              <p className="hint">
                {pack.entries.length} design{pack.entries.length === 1 ? "" : "s"}
                {pack.author ? ` · by ${pack.author}` : ""}
                {pack.description ? ` · ${pack.description}` : ""}
              </p>
            </div>
            <div className="pack-actions">
              {pack.theme && Object.keys(pack.theme.tokens).length > 0 && (
                <button className="secondary" onClick={() => (onApplyTheme(pack.theme!.base, pack.theme!.tokens), notify(`Applied the ${pack.name} theme.`))}>
                  Apply team theme
                </button>
              )}
              {source && (
                <button
                  className="secondary"
                  onClick={async () => {
                    const link = `${location.origin}${location.pathname}#/symbols/gallery?pack=${encodeURIComponent(source)}`;
                    try {
                      await navigator.clipboard.writeText(link);
                      notify("Pack link copied.");
                    } catch {
                      notify(link);
                    }
                  }}
                >
                  Copy pack link
                </button>
              )}
            </div>
          </div>
          <div className="cards">
            {pack.entries.map((e, i) => (
              <Card
                key={i}
                id={`pk-${i}`}
                title={e.title}
                description={e.description}
                // Preview in the team's look; opening keeps the recipe as authored.
                recipe={pack.theme && !e.recipe.tokens ? { ...e.recipe, theme: pack.theme.base, tokens: pack.theme.tokens } : e.recipe}
                onOpen={() => onOpen(e.recipe)}
              />
            ))}
          </div>
        </section>
      )}

      {mine.length > 0 && (
        <section className="pack-section">
          <div className="pack-head">
            <div>
              <h2>My pack</h2>
              <p className="hint">Saved on this device from the builder. Download it to share with your team.</p>
            </div>
            <div className="pack-actions">
              <button className="secondary" onClick={() => downloadFile({ filename: "my-designs.pack.json", mime: "application/json", content: toPackFile("My designs", mine) })}>
                Download pack
              </button>
              <button className="secondary" onClick={() => (writeMyPack([]), setMine([]))}>
                Clear
              </button>
            </div>
          </div>
          <div className="cards">
            {mine.map((e, i) => (
              <Card
                key={i}
                id={`mine-${i}`}
                title={e.title}
                recipe={e.recipe}
                onOpen={onOpen}
                onRemove={() => {
                  const next = mine.filter((_, j) => j !== i);
                  writeMyPack(next);
                  setMine(next);
                }}
              />
            ))}
          </div>
        </section>
      )}

      <section className="pack-section">
        <div className="pack-head">
          <h2>Community gallery</h2>
        </div>
        <div className="cards">
          {GALLERY.map((e) => (
            <Card key={e.slug} id={e.slug} title={e.title} description={e.description} by={e.author} recipe={e.recipe} onOpen={onOpen} />
          ))}
        </div>
      </section>
    </div>
  );
}
