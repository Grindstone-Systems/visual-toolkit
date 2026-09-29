import { generate, getTheme, renderSvg, type Recipe, type VtObject } from "../../../lib/index.ts";
import { GALLERY } from "../gallery.ts";
import { PageHeader } from "../ui/controls.tsx";

export function GalleryPage({ onOpen }: { onOpen: (r: Recipe) => void }) {
  return (
    <div className="page">
      <PageHeader eyebrow="Symbols" title="Gallery">
        Designs shared by the community. Each one is a tiny recipe, regenerated live — open any of them and keep building.
        Share your own with <b>Submit to gallery</b> in the builder.
      </PageHeader>
      <div className="cards">
        {GALLERY.map((e) => {
          let vo: VtObject | null = null;
          try {
            vo = generate(e.recipe.generator, e.recipe.params, e.recipe.version);
          } catch {
            /* generator not in this build */
          }
          const t = getTheme(e.recipe.theme);
          return (
            <article key={e.slug} className="card">
              <div className="card-art" style={{ background: t.tokens["surface.canvas"] }}>
                {vo ? (
                  <div dangerouslySetInnerHTML={{ __html: renderSvg(vo, { ...e.recipe, idPrefix: `g-${e.slug}` }) }} />
                ) : (
                  <span className="hint">Needs a newer build</span>
                )}
              </div>
              <div className="card-body">
                <h2>{e.title}</h2>
                {e.description && <p>{e.description}</p>}
                <div className="card-foot">
                  <span className="by">@{e.author}</span>
                  <button disabled={!vo} onClick={() => onOpen(e.recipe)}>
                    Open
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
