// Resume layout. Content comes from JSON (see schema/resume.schema.json); this
// file only decides how it looks. Defaults (defaults.json, shared with the
// editor) reproduce the original Word resume (Calibri, A4) this template was
// recreated from, measured from its PDF content stream.
//
// Data path: `sys.inputs.data` (root-relative, e.g. "/data/base.json"); the
// browser maps the current resume to "/resume.json".

#let data = json(sys.inputs.at("data", default: "/resume.json"))
#let defaults = json("defaults.json")

#let get(d, key, default) = if type(d) == dictionary { d.at(key, default: default) } else { default }
#let meta = get(data, "meta", (:))
#let colors = defaults.colors + get(meta, "colors", (:))
#let c(key) = rgb(colors.at(key))
#let margin = defaults.margin + get(meta, "margin", (:))

// Vertical rhythm in pt. Line boxes run from ascender to descender (1em), so a
// gap is the white space between one line's descender and the next line's
// ascender. `leading` is the gap inside a paragraph (Word's 1.15 line spacing),
// `paragraph` the gap between skill lines; `meta.spacing` overrides any of them.
#let sp = defaults.spacing + get(meta, "spacing", (:))
#let pt(key) = sp.at(key) * 1pt

#let font-size = get(meta, "fontSize", defaults.fontSize) * 1pt
#let fonts = get(meta, "fonts", defaults.fonts)

#set document(title: get(get(data, "basics", (:)), "name", "Resume") + " – Resume")
#set page(
  paper: get(meta, "paper", "a4"),
  margin: (top: margin.top * 1pt, bottom: margin.bottom * 1pt, left: margin.left * 1pt, right: margin.right * 1pt),
)
#set text(font: fonts, size: font-size, fill: c("text"), top-edge: "ascender", bottom-edge: "descender", lang: "en", hyphenate: false, kerning: false, ligatures: false)
#set par(leading: pt("leading"), spacing: 0pt, justify: false)
#set block(spacing: 0pt)
#show link: it => it

// `**bold**` is the only inline markup. Text is split, never evaluated, so
// characters like $ # @ _ in the data are printed as-is.
#let rich(s) = {
  let parts = str(s).split("**")
  for (i, p) in parts.enumerate() {
    if calc.odd(i) { strong(p) } else { p }
  }
}

#let visible(xs) = xs.enumerate().filter(((i, x)) => not get(x, "hidden", false))

// Prints `t` and reports layout facts about it for agents (`resume lint`): how
// many lines it wraps to, and whether its last line holds only one or two words.
#let probed(id, t) = {
  rich(t)
  layout(size => context {
    let lines-of(s) = {
      let h = measure(block(width: size.width, par(rich(s)))).height
      calc.round((h + pt("leading")) / (font-size + pt("leading")))
    }
    let n = lines-of(t)
    let words = str(t).split(" ")
    let widow = n > 1 and words.len() > 3 and lines-of(words.slice(0, -2).join(" ")) < n
    [#metadata((id: id, lines: n, widow: widow))<lint>]
  })
}

#let section-title(title) = {
  text(size: 11pt, weight: "bold", fill: c("heading"), upper(title))
  v(pt("title-rule"))
  // The rule overhangs the text column slightly, as in the original.
  move(dx: -1.5pt, line(length: 100% + 4.75pt, stroke: 1.5pt + c("rule")))
  v(pt("rule-content"))
}

#let date-range(e) = (get(e, "start", ""), get(e, "end", "")).filter(x => x != "").join(" – ")

// "Role | Location" in italics with an upright bar, or whichever half exists.
#let sub-line(first, loc) = (first, loc).filter(x => x != "").map(emph).join[ | ]

#let entry-head(title, aside, sub: none) = {
  grid(
    columns: (1fr, auto),
    column-gutter: 8pt,
    text(size: 11pt, weight: "bold", fill: c("entry"), title),
    align(right + bottom, text(fill: c("entry"), aside)),
  )
  if sub != none {
    v(pt("entry-title-sub"))
    text(fill: c("entry"), sub)
  }
}

#let bullets(path, items) = {
  for (n, (i, b)) in visible(items).enumerate() {
    if n > 0 { v(pt("bullet")) }
    grid(columns: (18pt, 1fr), [•], probed(path + "/" + str(i) + "/text", get(b, "text", "")))
  }
}

// Bullets under an entry, after `gap`, if any are visible.
#let bullet-tail(path, items, gap) = if visible(items).len() > 0 {
  v(gap)
  bullets(path, items)
}

// Visible entries of a section, `entry-gap` apart; `body(i, e)` draws one.
#let entries(xs, body) = for (n, (i, e)) in visible(xs).enumerate() {
  if n > 0 { v(pt("entry-gap")) }
  body(i, e)
}

#let header(b) = {
  align(center, text(size: 22pt, weight: "bold", fill: c("name"), get(b, "name", "")))
  v(pt("name-contact"))
  let parts = ()
  let email = get(b, "email", "")
  if email != "" { parts.push(link("mailto:" + email, email)) }
  let phone = get(b, "phone", "")
  if phone != "" { parts.push(phone) }
  for l in get(b, "links", ()) {
    if not get(l, "hidden", false) { parts.push(link(l.url, get(l, "label", l.url))) }
  }
  align(center, text(fill: c("contact"), parts.join([#h(0.55em)|#h(0.55em)])))
}

#let skills-section(title, xs) = {
  section-title(title)
  for (n, (i, s)) in visible(xs).enumerate() {
    if n > 0 { v(pt("paragraph")) }
    let t = "**" + get(s, "category", "") + ":** " + get(s, "items", ()).join(", ")
    block(width: 100%, probed("/skills/" + str(i) + "/items", t))
  }
}

#let experience-section(title, xs) = {
  section-title(title)
  entries(xs, (i, e) => {
    entry-head(get(e, "company", ""), date-range(e), sub: sub-line(get(e, "role", ""), get(e, "location", "")))
    bullet-tail("/experience/" + str(i) + "/bullets", get(e, "bullets", ()), pt("entry-sub-bullets"))
  })
}

#let education-section(title, xs) = {
  section-title(title)
  entries(xs, (i, e) => {
    entry-head(get(e, "institution", ""), date-range(e), sub: sub-line(get(e, "degree", ""), get(e, "location", "")))
    bullet-tail("/education/" + str(i) + "/details", get(e, "details", ()), pt("entry-sub-bullets"))
  })
}

#let projects-section(title, xs) = {
  section-title(title)
  entries(xs, (i, p) => {
    let url = get(p, "url", "")
    entry-head(get(p, "name", ""), if url != "" { text(fill: c("text"), link(url, get(p, "urlLabel", url))) } else { date-range(p) })
    let d = get(p, "description", "")
    if d != "" {
      v(pt("project-desc"))
      block(width: 100%, probed("/projects/" + str(i) + "/description", d))
    }
    bullet-tail("/projects/" + str(i) + "/bullets", get(p, "bullets", ()), if d != "" { pt("bullet") } else { pt("entry-sub-bullets") })
  })
}

#let builtin = (
  skills: skills-section,
  experience: experience-section,
  education: education-section,
  projects: projects-section,
)
#let titles = defaults.sectionTitles + get(meta, "sectionTitles", (:))
#let customs = get(data, "custom", ()).enumerate()

#header(get(data, "basics", (:)))

#for key in get(meta, "sectionOrder", builtin.keys()) {
  if key in builtin {
    let xs = get(data, key, ())
    if type(xs) == array and visible(xs).len() > 0 {
      v(pt("section-before"))
      builtin.at(key)(titles.at(key), xs)
    }
  } else {
    // Free-form sections (`custom[]`): a title plus bullets, placed by `key`.
    let found = customs.find(((i, s)) => get(s, "key", "") == key)
    if found != none {
      let (i, s) = found
      let bs = get(s, "bullets", ())
      if not get(s, "hidden", false) and visible(bs).len() > 0 {
        v(pt("section-before"))
        section-title(get(s, "title", ""))
        bullets("/custom/" + str(i) + "/bullets", bs)
      }
    }
  }
}

// Where the content ends, so tools can tell how much room is left (PageInfo).
#context [#metadata((
  pages: counter(page).final().first(),
  endY: here().position().y.pt(),
  pageHeight: page.height.pt(),
  topMargin: margin.top,
  bottomMargin: margin.bottom,
  linePitch: (font-size + pt("leading")).pt(),
))<pages>]
