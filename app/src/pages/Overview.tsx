import { FAMILIES, getGenerator, STATES } from "../../../lib/index.ts";
import type { Design } from "../design.ts";
import { GROUPS, hrefOf, type PageId } from "../shell/tools.ts";
import { STYLE_OPTIONS, Thumb } from "../symbols/Builder.tsx";
import { StatusPill } from "../ui/controls.tsx";
import { Icon } from "../ui/icons.tsx";

export function Overview({ design, navigate, openFamily }: { design: Design; navigate: (id: PageId) => void; openFamily: (generator: string) => void }) {
  const families = FAMILIES.flatMap((f) => {
    const g = f.generator ? getGenerator(f.generator) : undefined;
    return g ? [{ name: f.name, gen: g }] : [];
  });
  const tools = GROUPS.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.label })));

  return (
    <div className="page overview">
      <section className="hero">
        <p className="eyebrow">Grindstone Systems</p>
        <h1>Open visual tools for industrial software</h1>
        <p className="lede">
          Create state-aware, themable assets your platform can use — from clean SVG symbols today to smart mimics and spatial
          objects tomorrow. Everything runs in your browser: no account, no server.
        </p>
        <div className="hero-actions">
          <button className="primary" onClick={() => navigate("symbols.builder")}>
            Open Symbols builder <Icon name="arrow" />
          </button>
          <button className="secondary" onClick={() => navigate("symbols.gallery")}>
            Browse gallery
          </button>
        </div>
        <dl className="facts">
          <div>
            <dt>{families.length}</dt>
            <dd>equipment families</dd>
          </div>
          <div>
            <dt>{STYLE_OPTIONS.length}</dt>
            <dd>visual styles</dd>
          </div>
          <div>
            <dt>{STATES.length}</dt>
            <dd>operating states</dd>
          </div>
          <div>
            <dt>$0</dt>
            <dd>static, open source</dd>
          </div>
        </dl>
      </section>

      <section className="block">
        <h2 className="block-title">Start from equipment</h2>
        <div className="equip-row">
          {families.map(({ name, gen }) => (
            <button key={gen.id} className="equip" onClick={() => openFamily(gen.id)} title={gen.description}>
              <Thumb generator={gen.id} design={design} />
              <span>{name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="block">
        <h2 className="block-title">Tools</h2>
        <div className="tool-grid">
          {tools.map((t) => (
            <a
              key={t.id}
              className={`tool-card tool-card--${t.status}`}
              href={hrefOf(t.id)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                navigate(t.id);
              }}
            >
              <span className="tool-icon">
                <Icon name={t.icon} size={18} />
              </span>
              <span className="tool-meta">
                {t.group}
                <StatusPill status={t.status} />
              </span>
              <strong>{t.label}</strong>
              <span className="tool-summary">{t.summary}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
