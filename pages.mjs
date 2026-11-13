// Pages of the tabora.app site in four languages, built from Russian templates (PAGES below): pages/index.html
// -> public/<lang>/index.html, pages/privacy.html -> public/<lang>/privacy/index.html, and a copy of each English
// page without the language in its path (public/index.html, public/privacy/index.html) for visitors who reach
// it without the language redirect (nginx does it for "/" by Accept-Language).
//
// Translations live in i18n/<lang>.json; the key is the Russian text from the template, as in the app dictionaries.
// The unit of translation is a whole phrase:
//   • the content of an element that has Russian text, together with the tags inside it (<b>, <a>, <code>…);
//     icons and empty elements at the edges are not part of the unit;
//   • the value of any attribute with Russian text (content, aria-label, data-*…);
//   • strings with Russian text in <script type="application/ld+json">.
// Marks in the template (they do not reach the built pages):
//   data-i18n          — the element content is translated although it has no Russian letters (numbers, examples);
//   data-i18n="a b"    — the same for attributes a and b;
//   translate="no"     — the element is not translated (language names in the switcher); the attribute stays.
// The build stops if a translation is missing, a translation has different tags or {0} placeholders, letters of
// another language are left, the pages differ in markup, or a local link leads nowhere.
//
// Usage: node pages.mjs [output directory] [--i18n dictionaries directory] [--files site directory for link checks]
//        node pages.mjs --units   — the list of translation units in order (JSON), for the translator
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, parseFragment } from "parse5";

const here = dirname(fileURLToPath(import.meta.url));
// each page: its template and its path under /<lang>/
const PAGES = [
  { template: "pages/index.html", slug: "" },
  { template: "pages/privacy.html", slug: "privacy/" },
];
const ORIGIN = "https://tabora.app";
const SOURCE = "ru";
const FALLBACK = "en"; // x-default and public/index.html
// the order is the same as in the language switcher; forbid: letters that must not appear in the built text
const LANGS = {
  ru: { ogLocale: "ru_RU" },
  en: { ogLocale: "en_US", forbid: /[Ѐ-ӿ]/ },
  uk: { ogLocale: "uk_UA", forbid: /[ыэъёЫЭЪЁ]/ },
  es: { ogLocale: "es_ES", forbid: /[Ѐ-ӿ]/ },
};
// nginx serves these paths from outside the site directory
const SERVED_ELSEWHERE = ["/downloads/"];

const CYR = /[Ѐ-ӿ]/;
const MARK = "data-i18n";

class BuildError extends Error {}
const fail = lines => {
  throw new BuildError([].concat(lines).join("\n"));
};

// ---- parsing ----

function parsePage(html, what) {
  const errors = [];
  const doc = parse(html, { sourceCodeLocationInfo: true, onParseError: e => errors.push(e) });
  if (errors.length) {
    fail(errors.map(e => `${what}:${e.startLine}:${e.startCol}: markup error ${e.code}`));
  }
  return doc;
}

const isElement = n => typeof n.tagName === "string";
const isText = n => n.nodeName === "#text";
const kids = n => (n.tagName === "template" ? n.content.childNodes : n.childNodes) || [];
const attr = (el, name) => el.attrs.find(a => a.name === name)?.value;
const textOf = n => (isText(n) ? n.value : kids(n).map(textOf).join(""));
const squeeze = s => s.trim().replace(/\s+/g, " ");

function* elements(node) {
  for (const child of kids(node)) {
    if (isElement(child)) {
      yield child;
      yield* elements(child);
    }
  }
}

const find = (doc, test, what) => {
  const found = [...elements(doc)].filter(test);
  if (found.length !== 1) {
    fail(`template: expected exactly one ${what}, found ${found.length}`);
  }
  return found[0];
};

// ---- translation units ----

/** What is translated in the template: [{ kind: "text" | "attr" | "json", key, start, end, name?, where }]
 *  and what is removed from the template (data-i18n marks): [{ start, end }]. */
function unitsOf(doc, src, what) {
  const units = [];
  const drops = [];
  const where = node => `${what}:${node.sourceCodeLocation.startLine}`;

  const attrUnits = el => {
    const marked = attr(el, MARK);
    const forced = marked ? marked.split(/\s+/) : [];
    for (const name of forced) {
      attr(el, name) ?? fail(`${where(el)}: ${MARK} names the attribute ${name}, which the element does not have`);
    }
    for (const a of el.attrs) {
      if (a.name !== MARK && (CYR.test(a.value) || forced.includes(a.name))) {
        const loc = el.sourceCodeLocation.attrs[a.name];
        units.push({ kind: "attr", key: a.value, name: a.name, start: loc.startOffset, end: loc.endOffset, where: where(el) });
      }
    }
    if (marked !== undefined) {
      const loc = el.sourceCodeLocation.attrs[MARK];
      drops.push({ start: loc.startOffset - 1, end: loc.endOffset }); // together with the space before the attribute
    }
  };

  const walk = (node, attrsOnly) => {
    for (const el of kids(node)) {
      if (!isElement(el) || attr(el, "translate") === "no") {
        continue;
      }
      attrUnits(el);
      if (el.tagName === "script" || el.tagName === "style") {
        if (!attrsOnly && el.tagName === "script" && attr(el, "type") === "application/ld+json") {
          jsonUnits(el);
        } else if (CYR.test(textOf(el))) {
          fail(`${where(el)}: Russian text inside <${el.tagName}> is not translated`);
        }
        continue;
      }
      const own = !attrsOnly && (attr(el, MARK) === "" || kids(el).some(n => isText(n) && CYR.test(n.value)));
      if (!own) {
        walk(el, attrsOnly);
        continue;
      }
      // the phrase: from the first to the last child with text; icons and empty elements at the edges stay in place
      const empty = n => textOf(n).trim() === "";
      const inner = [...kids(el)];
      const outside = [];
      while (inner.length && empty(inner[0])) {
        outside.push(inner.shift());
      }
      while (inner.length && empty(inner.at(-1))) {
        outside.push(inner.pop());
      }
      if (!inner.length) {
        fail(`${where(el)}: the element with ${MARK} has no text`);
      }
      let start = inner[0].sourceCodeLocation.startOffset;
      let end = inner.at(-1).sourceCodeLocation.endOffset;
      const raw = src.slice(start, end);
      start += raw.length - raw.trimStart().length;
      end -= raw.length - raw.trimEnd().length;
      units.push({ kind: "text", key: squeeze(raw), start, end, where: where(el) });
      for (const part of inner) {
        for (const sub of isElement(part) ? [part, ...elements(part)] : []) {
          if (sub.attrs.some(a => CYR.test(a.value) || a.name === MARK)) {
            fail(`${where(sub)}: <${sub.tagName}> inside a phrase has a translatable attribute; move the element out of the phrase`);
          }
        }
      }
      walk({ childNodes: outside }, true);
    }
  };

  // JSON-LD: strings with Russian text are translated, the rest stays as written
  const jsonUnits = el => {
    const node = kids(el)[0];
    if (!node) {
      return;
    }
    const base = node.sourceCodeLocation.startOffset;
    const text = src.slice(base, node.sourceCodeLocation.endOffset);
    try {
      JSON.parse(text);
    } catch (e) {
      fail(`${where(el)}: JSON-LD does not parse: ${e.message}`);
    }
    for (const m of text.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
      const value = JSON.parse(m[0]);
      if (CYR.test(value)) {
        units.push({ kind: "json", key: value, start: base + m.index, end: base + m.index + m[0].length, where: where(el) });
      }
    }
  };

  walk(doc, false);
  return { units, drops };
}

// ---- checking the translation of one unit ----

const tagsOf = html => (html.match(/<\/?[a-zA-Z][^>]*>/g) || []).sort().join(" ");
const slotsOf = s => (s.match(/\{\d+\}/g) || []).sort().join(" ");

function checkUnit(unit, value, lang) {
  const problems = [];
  if (LANGS[lang].forbid?.test(value)) {
    problems.push("letters of another language are left");
  }
  if (slotsOf(unit.key) !== slotsOf(value)) {
    problems.push("the {0} placeholders do not match the source");
  }
  if (unit.kind !== "text") {
    // an attribute value and a JSON string are plain text: markup and &nbsp; would reach the page literally
    if (/<\/?[a-zA-Z]|&#?\w+;/.test(value)) {
      problems.push("plain text (attribute, JSON-LD) must not contain tags or entities such as &nbsp;");
    }
  } else {
    if (tagsOf(unit.key) !== tagsOf(value)) {
      problems.push(`the tags do not match the source: ${tagsOf(unit.key) || "none"} ≠ ${tagsOf(value) || "none"}`);
    }
    const errors = [];
    parseFragment(value, { onParseError: e => errors.push(e.code) });
    if (errors.length) {
      problems.push(`broken markup (${errors.join(", ")})`);
    }
  }
  return problems;
}

const escAttr = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/\u00a0/g, "&nbsp;");
// "<" inside <script> must not close it early
const escJson = s => JSON.stringify(s).replace(/</g, "\\u003c");

// ---- the page of one language ----

/** Language-dependent edits: lang, the page's own URL, og:locale, the mark of the current language in the switcher. */
function localEdits(doc, lang, slug) {
  const edits = [];
  const set = (el, name, value) => {
    const loc = el.sourceCodeLocation.attrs?.[name] ?? fail(`template: <${el.tagName}> has no attribute ${name}`);
    edits.push({ start: loc.startOffset, end: loc.endOffset, text: `${name}="${escAttr(value)}"` });
  };
  const url = `${ORIGIN}/${lang}/${slug}`;
  set(find(doc, el => el.tagName === "html", "<html>"), "lang", lang);
  set(find(doc, el => el.tagName === "link" && attr(el, "rel") === "canonical", "link rel=canonical"), "href", url);
  set(find(doc, el => el.tagName === "meta" && attr(el, "property") === "og:url", "meta og:url"), "content", url);
  set(find(doc, el => el.tagName === "meta" && attr(el, "property") === "og:locale", "meta og:locale"), "content", LANGS[lang].ogLocale);
  const current = find(doc, el => el.tagName === "a" && attr(el, "hreflang") === lang, `switcher item for ${lang}`);
  const at = current.sourceCodeLocation.startTag.endOffset - 1;
  edits.push({ start: at, end: at, text: ' aria-current="page"' });
  // links to other pages of the site are written with the source language and follow the page's language
  for (const el of elements(doc)) {
    const href = el.tagName === "a" && !attr(el, "hreflang") ? attr(el, "href") : null;
    if (lang !== SOURCE && href && href.startsWith(`/${SOURCE}/`)) {
      set(el, "href", `/${lang}/${href.slice(SOURCE.length + 2)}`);
    }
  }
  return edits;
}

/** The template itself must name all languages: the hreflang links in <head> and the switcher items. */
function checkTemplate(doc, slug) {
  const all = [...elements(doc)];
  const alternates = all.filter(el => el.tagName === "link" && attr(el, "rel") === "alternate").map(el => `${attr(el, "hreflang")} ${attr(el, "href")}`);
  const wantAlternates = [...Object.keys(LANGS).map(l => `${l} ${ORIGIN}/${l}/${slug}`), `x-default ${ORIGIN}/${FALLBACK}/${slug}`];
  if (alternates.join("\n") !== wantAlternates.join("\n")) {
    fail(["template: the rel=alternate hreflang links must be:", ...wantAlternates.map(a => `  ${a}`)]);
  }
  const switcher = all.filter(el => el.tagName === "a" && attr(el, "hreflang")).map(el => `${attr(el, "hreflang")} ${attr(el, "href")} ${attr(el, "lang")} ${attr(el, "translate")}`);
  const wantSwitcher = Object.keys(LANGS).map(l => `${l} /${l}/${slug} ${l} no`);
  if (switcher.join("\n") !== wantSwitcher.join("\n")) {
    fail(["template: the language switcher must have these links (hreflang, href, lang, translate):", ...wantSwitcher.map(a => `  ${a}`)]);
  }
  if (attr(find(doc, el => el.tagName === "html", "<html>"), "lang") !== SOURCE) {
    fail(`template: expected <html lang="${SOURCE}">`);
  }
}

function applyEdits(src, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src;
  let before = Infinity;
  for (const e of sorted) {
    if (e.end > before) {
      fail(`template edits overlap at offset ${e.start}`);
    }
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    before = e.start;
  }
  return out;
}

function render(src, doc, { units, drops }, lang, catalog, slug) {
  const edits = [...localEdits(doc, lang, slug), ...drops.map(d => ({ ...d, text: "" }))];
  const problems = [];
  if (lang !== SOURCE) {
    for (const unit of units) {
      const value = catalog[unit.key];
      if (typeof value !== "string" || value.trim() === "") {
        problems.push(`${unit.where}: missing translation: ${JSON.stringify(unit.key)}`);
        continue;
      }
      const bad = checkUnit(unit, value, lang);
      if (bad.length) {
        problems.push(`${unit.where}: ${JSON.stringify(unit.key)}: ${bad.join("; ")}`);
        continue;
      }
      const text = unit.kind === "attr" ? `${unit.name}="${escAttr(value)}"` : unit.kind === "json" ? escJson(value) : value;
      edits.push({ start: unit.start, end: unit.end, text });
    }
  }
  if (problems.length) {
    fail([`i18n/${lang}.json:`, ...problems.map(p => `  ${p}`)]);
  }
  return applyEdits(src, edits);
}

// ---- checks of the built pages ----

const shapeOf = doc => [...elements(doc)].map(el => `${el.tagName}[${el.attrs.map(a => a.name).filter(n => n !== "aria-current").sort().join(",")}]`);

function visibleStrings(doc) {
  const out = [];
  const walk = node => {
    for (const n of kids(node)) {
      if (isText(n)) {
        out.push(n.value);
      } else if (isElement(n) && attr(n, "translate") !== "no") {
        out.push(...n.attrs.map(a => a.value));
        walk(n);
      }
    }
  };
  walk(doc);
  return out;
}

function checkPages(pages, filesDir, slug, generated) {
  const problems = [];
  const docs = {};
  for (const [lang, html] of Object.entries(pages)) {
    docs[lang] = parsePage(html, `${lang}/${slug}index.html`);
  }
  const base = shapeOf(docs[SOURCE]);
  for (const [lang, doc] of Object.entries(docs)) {
    const shape = shapeOf(doc);
    const at = shape.findIndex((s, i) => s !== base[i]);
    if (shape.length !== base.length || at !== -1) {
      problems.push(`${lang}: the markup differs from the Russian page (${shape.length} elements vs ${base.length}${at === -1 ? "" : `, first difference: ${shape[at]} instead of ${base[at]}`})`);
    }
    const forbid = LANGS[lang].forbid;
    for (const s of forbid ? visibleStrings(doc) : []) {
      if (forbid.test(s)) {
        problems.push(`${lang}: letters of another language are left in the page text: ${JSON.stringify(squeeze(s).slice(0, 80))}`);
      }
    }
    const all = [...elements(doc)];
    const ids = new Set(all.map(el => attr(el, "id")).filter(Boolean));
    const current = all.filter(el => attr(el, "aria-current") === "page").map(el => attr(el, "hreflang"));
    if (attr(all[0], "lang") !== lang || current.join() !== lang) {
      problems.push(`${lang}: the page language or the mark in the switcher does not match the language`);
    }
    for (const el of all) {
      for (const name of ["popovertarget", "data-copy", "for", "aria-controls"]) {
        const id = attr(el, name);
        if (id && !ids.has(id)) {
          problems.push(`${lang}: ${name}="${id}" points to an element that does not exist`);
        }
      }
      const targets = [attr(el, "href"), attr(el, "src"), el.tagName === "meta" && /^og:(url|image)$/.test(attr(el, "property") || "") && attr(el, "content")];
      for (const target of targets.filter(Boolean)) {
        if (target.startsWith("#")) {
          if (target.length > 1 && !ids.has(decodeURIComponent(target.slice(1)))) {
            problems.push(`${lang}: the link ${target} points to a section that does not exist`);
          }
          continue;
        }
        // the page URL is /<lang>/<slug>: relative links resolve against it
        const url = new URL(target, `${ORIGIN}/${lang}/${slug}`);
        if (url.origin !== ORIGIN || SERVED_ELSEWHERE.some(p => url.pathname.startsWith(p))) {
          continue;
        }
        if (!target.startsWith("/") && !target.startsWith(ORIGIN) && target !== "./") {
          problems.push(`${lang}: the link ${target} is relative; the pages live in subdirectories, a path from the root is required`);
        }
        if (filesDir) {
          const path = join(filesDir, decodeURIComponent(url.pathname));
          const file = url.pathname.endsWith("/") ? join(path, "index.html") : path;
          // the pages of all templates are created in this same run
          if (!generated.has(url.pathname) && !(existsSync(file) && statSync(file).isFile())) {
            problems.push(`${lang}: ${target}: the file ${file} does not exist`);
          }
        }
      }
    }
  }
  if (problems.length) {
    fail(["the built pages failed the checks:", ...new Set(problems)].map((p, i) => (i ? `  ${p}` : p)));
  }
}

// ---- entry point ----

function main(argv) {
  const args = { out: join(here, "public"), i18n: join(here, "i18n"), files: null, units: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--units") {
      args.units = true;
    } else if (argv[i] === "--i18n" || argv[i] === "--files") {
      args[argv[i].slice(2)] = resolve(argv[++i] ?? fail(`a directory is required after ${argv[i - 1]}`));
    } else if (argv[i].startsWith("--")) {
      fail(`unknown option ${argv[i]}`);
    } else {
      args.out = resolve(argv[i]);
    }
  }
  const catalogs = {};
  for (const lang of Object.keys(LANGS)) {
    if (lang !== SOURCE) {
      const file = join(args.i18n, `${lang}.json`);
      try {
        catalogs[lang] = JSON.parse(readFileSync(file, "utf8"));
      } catch (e) {
        fail(`${file}: cannot read the dictionary: ${e.message}`);
      }
    }
  }
  const sources = PAGES.map(page => {
    const src = readFileSync(join(here, page.template), "utf8");
    const doc = parsePage(src, page.template);
    checkTemplate(doc, page.slug);
    return { ...page, src, doc, found: unitsOf(doc, src, page.template) };
  });
  const keys = new Set(sources.flatMap(s => s.found.units.map(u => u.key)));
  if (args.units) {
    process.stdout.write(JSON.stringify([...keys], null, 1) + "\n");
    return;
  }
  // the pages built in this run: links between them are checked against this list
  const generated = new Set(sources.flatMap(s => Object.keys(LANGS).map(l => `/${l}/${s.slug}`)));
  const built = [];
  for (const s of sources) {
    const pages = {};
    for (const lang of Object.keys(LANGS)) {
      pages[lang] = render(s.src, s.doc, s.found, lang, catalogs[lang] ?? {}, s.slug);
    }
    checkPages(pages, args.files ?? args.out, s.slug, generated);
    built.push({ slug: s.slug, pages });
  }
  // a dictionary entry that no template uses is a leftover of a removed phrase
  for (const [lang, catalog] of Object.entries(catalogs)) {
    const unused = Object.keys(catalog).filter(key => !keys.has(key));
    if (unused.length) {
      fail([`i18n/${lang}.json:`, ...unused.map(key => `  unused dictionary entry (no template has such a phrase): ${JSON.stringify(key)}`)]);
    }
  }
  for (const { slug, pages } of built) {
    for (const [lang, html] of Object.entries(pages)) {
      mkdirSync(join(args.out, lang, slug), { recursive: true });
      writeFileSync(join(args.out, lang, slug, "index.html"), html);
    }
    mkdirSync(join(args.out, slug), { recursive: true });
    writeFileSync(join(args.out, slug, "index.html"), pages[FALLBACK]);
  }
  console.log(`✓ site pages: ${Object.keys(LANGS).join(", ")} and the ${FALLBACK} copies without a language; templates: ${sources.length}; phrases to translate: ${keys.size}`);
}

try {
  main(process.argv.slice(2));
} catch (e) {
  if (e instanceof BuildError) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
  throw e;
}
