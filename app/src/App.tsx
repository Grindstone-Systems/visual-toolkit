import { FAMILIES, getGenerator, getTheme, tokenVar } from "../../lib/index.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyRecipe, designFromCode, designLink, initialDesign, type Design } from "./design.ts";
import { GALLERY } from "./gallery.ts";
import { Overview } from "./pages/Overview.tsx";
import { ThemeEditor } from "./pages/ThemeEditor.tsx";
import { ToolStatusPage } from "./pages/ToolStatusPage.tsx";
import { Shell, type Command } from "./shell/Shell.tsx";
import { ALL_PAGES, groupOf, hrefOf, pageById, parseHash, type PageId, type Route } from "./shell/tools.ts";
import { Builder, type StageView } from "./symbols/Builder.tsx";
import { GalleryPage } from "./symbols/GalleryPage.tsx";
import { Icon } from "./ui/icons.tsx";

export function App() {
  const [design, setDesign] = useState<Design>(initialDesign);
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [stage, setStage] = useState<StageView>("single");
  const [toast, setToast] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const designRef = useRef(design);
  designRef.current = design;

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((notify as unknown as { t?: number }).t);
    (notify as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 3200);
  }, []);

  // Load from the URL (share links) and follow hash changes.
  useEffect(() => {
    const load = async () => {
      const r = parseHash();
      setRoute(r);
      if (r.code) {
        try {
          setDesign(await designFromCode(initialDesign(), r.code));
        } catch (e) {
          notify(`Couldn't open that link: ${(e as Error).message}`);
        }
      }
      loadedRef.current = true;
    };
    void load();
    window.addEventListener("hashchange", load);
    return () => window.removeEventListener("hashchange", load);
  }, [notify]);

  // In the builder the address bar is always a share link.
  useEffect(() => {
    if (!loadedRef.current || route.page !== "symbols.builder") return;
    const t = window.setTimeout(async () => {
      const link = await designLink(design);
      if (link !== location.href) history.replaceState(null, "", link);
    }, 250);
    return () => window.clearTimeout(t);
  }, [design, route.page]);

  const theme = getTheme(design.theme);

  // App chrome follows the symbol theme so Light/Dark is a whole-screen switch.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme.scheme;
    for (const [k, v] of Object.entries({ ...theme.tokens, ...design.tokens })) root.style.setProperty(tokenVar(k as never), v);
  }, [theme, design.tokens]);

  const navigate = useCallback((page: PageId) => {
    setRoute({ page });
    document.querySelector(".content")?.scrollTo(0, 0);
    if (page === "symbols.builder") void designLink(designRef.current).then((l) => history.pushState(null, "", l));
    else history.pushState(null, "", hrefOf(page));
  }, []);

  const openFamily = useCallback(
    (generator: string) => {
      setDesign((d) => ({ ...d, generator }));
      navigate("symbols.builder");
    },
    [navigate],
  );

  const toggleTheme = useCallback(() => setDesign((d) => ({ ...d, theme: d.theme === "dark" ? "light" : "dark" })), []);

  const page = pageById(route.page);
  useEffect(() => {
    document.title = route.page === "overview" ? "Visual Toolkit" : `${page.label} · Visual Toolkit`;
  }, [route.page, page.label]);

  const commands = useMemo<Command[]>(
    () => [
      ...ALL_PAGES.map((p) => ({
        id: `page:${p.id}`,
        label: p.label,
        hint: groupOf(p.id)?.label ?? "Go to",
        icon: p.icon,
        run: () => navigate(p.id),
      })),
      ...FAMILIES.flatMap((f) => {
        const g = f.generator ? getGenerator(f.generator) : undefined;
        return g ? [{ id: `gen:${g.id}`, label: `New ${f.name.toLowerCase()} symbol`, hint: "Symbols builder", icon: "builder" as const, run: () => openFamily(g.id) }] : [];
      }),
      { id: "theme", label: "Toggle light / dark theme", hint: "Appearance", icon: "sun", run: toggleTheme },
    ],
    [navigate, openFamily, toggleTheme],
  );

  let content;
  switch (route.page) {
    case "overview":
      content = <Overview design={design} navigate={navigate} openFamily={openFamily} />;
      break;
    case "symbols.builder":
      content = <Builder design={design} setDesign={setDesign} stage={stage} setStage={setStage} notify={notify} />;
      break;
    case "symbols.gallery":
      content = (
        <GalleryPage
          packUrl={route.pack}
          notify={notify}
          onApplyTheme={(base, tokens) => setDesign((d) => ({ ...d, theme: base, tokens }))}
          onOpen={(r) => {
            setDesign((d) => applyRecipe(d, r));
            navigate("symbols.builder");
            notify("Opened from the gallery — tweak it and make it yours.");
          }}
        />
      );
      break;
    case "themes.editor":
      content = <ThemeEditor design={design} setDesign={setDesign} openBuilder={() => navigate("symbols.builder")} />;
      break;
    case "spatial.models":
      content = (
        <ToolStatusPage
          tool={page}
          group={groupOf(page.id)?.label}
          action={
            <button
              className="primary"
              onClick={() => {
                setStage("3d");
                openFamily("pump.centrifugal");
              }}
            >
              Open the pump in 3D <Icon name="arrow" />
            </button>
          }
        />
      );
      break;
    default:
      content = <ToolStatusPage tool={page} group={groupOf(page.id)?.label} />;
  }

  return (
    <Shell
      page={route.page}
      crumb={route.page === "symbols.builder" ? getGenerator(design.generator)?.name : undefined}
      counts={{ "symbols.gallery": GALLERY.length }}
      scheme={theme.scheme}
      onToggleTheme={toggleTheme}
      navigate={navigate}
      commands={commands}
    >
      {content}
      <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </Shell>
  );
}
