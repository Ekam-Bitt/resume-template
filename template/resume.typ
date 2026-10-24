// Resume layout. Content comes from JSON (see schema/resume.schema.json); this
// file only decides how it looks. Defaults reproduce the original Word resume
// (Calibri, A4) this template was recreated from, measured from its PDF content stream.
//
// Data path: `sys.inputs.data` (root-relative, e.g. "/data/base.json"); the
// browser maps the current resume to "/resume.json".

#let data = json(sys.inputs.at("data", default: "/resume.json"))

#let get(d, key, default) = if type(d) == dictionary { d.at(key, default: default) } else { default }
#let meta = get(data, "meta", (:))
#let colors = (
  name: "#1F1F1F",
  contact: "#1F497D",
  heading: "#2E74B5",
  entry: "#444444",
  text: "#000000",
  rule: "#000000",
) + get(meta, "colors", (:))
#let c(key) = rgb(colors.at(key))
#let margin = (top: 14.6, bottom: 20, left: 36, right: 37.5) + get(meta, "margin", (:))

// Vertical rhythm in pt. Line boxes run from ascender to descender (1em), so a
// gap is the white space between one line's descender and the next line's
// ascender. Values match the original; `meta.spacing` overrides any of them.
#let sp = (
  leading: 4.2,         // inside a paragraph: Word's 1.15 line spacing
  paragraph: 5,         // between skill lines / bullets
  bullet: 4.5,
  name-contact: 10.7,
  section-before: 12.05,
  title-rule: 3.25,
  rule-content: 3.9,
  entry-title-sub: 2.55,
  entry-sub-bullets: 3.9,
  entry-gap: 19.05,
  project-desc: 10.25,
) + get(meta, "spacing", (:))
#let pt(key) = sp.at(key) * 1pt

#let font-size = get(meta, "fontSize", 10) * 1pt
#let fonts = get(meta, "fonts", ("Carlito", "Calibri"))

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

// Reports layout facts for agents (`resume lint`): how many lines a block
// wraps to, and whether its last line holds only one or two words.
#let lint-probe(id, body-text, width) = context {
  let lines-of(s) = {
    let h = measure(block(width: width, par(rich(s)))).height
    calc.round((h + pt("leading")) / (font-size + pt("leading")))
  }
  let n = lines-of(body-text)
  let words = str(body-text).split(" ")
  let widow = if n > 1 and words.len() > 3 {
    lines-of(words.slice(0, -2).join(" ")) < n
  } else { false }
  [#metadata((id: id, lines: n, widow: widow))<lint>]
}

#let section-title(title) = {
  text(size: 11pt, weight: "bold", fill: c("heading"), upper(title))
  v(pt("title-rule"))
  // The rule overhangs the text column slightly, as in the original.
  move(dx: -1.5pt, line(length: 100% + 4.75pt, stroke: 1.5pt + c("rule")))
  v(pt("rule-content"))
}

#let date-range(e) = {
  let s = get(e, "start", "")
  let f = get(e, "end", "")
  if s != "" and f != "" [#s – #f] else if s != "" [#s] else [#f]
}

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
  let hang = 18pt
  for (n, (i, b)) in visible(items).enumerate() {
    if n > 0 { v(pt("bullet")) }
    let t = if type(b) == str { b } else { get(b, "text", "") }
    grid(
      columns: (hang, 1fr),
      [•],
      {
        rich(t)
        layout(size => lint-probe(path + "/" + str(i) + "/text", t, size.width))
      },
    )
  }
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
    block(width: 100%, {
      rich(t)
      layout(size => lint-probe("/skills/" + str(i) + "/items", t, size.width))
    })
  }
}

#let role-line(e) = {
  let role = get(e, "role", "")
  let loc = get(e, "location", "")
  if role != "" and loc != "" [#emph(role) | #emph(loc)] else if role != "" { emph(role) } else if loc != "" { emph(loc) } else { none }
}

#let experience-section(title, xs) = {
  section-title(title)
  for (n, (i, e)) in visible(xs).enumerate() {
    if n > 0 { v(pt("entry-gap")) }
    entry-head(get(e, "company", ""), date-range(e), sub: role-line(e))
    let bs = get(e, "bullets", ())
    if visible(bs).len() > 0 {
      v(pt("entry-sub-bullets"))
      bullets("/experience/" + str(i) + "/bullets", bs)
    }
  }
}

#let education-section(title, xs) = {
  section-title(title)
  for (n, (i, e)) in visible(xs).enumerate() {
    if n > 0 { v(pt("entry-gap")) }
    let degree = get(e, "degree", "")
    let loc = get(e, "location", "")
    let sub = if degree != "" and loc != "" [#emph(degree) | #emph(loc)] else if degree != "" { emph(degree) } else { none }
    entry-head(get(e, "institution", ""), date-range(e), sub: sub)
    let ds = get(e, "details", ())
    if visible(ds).len() > 0 {
      v(pt("entry-sub-bullets"))
      bullets("/education/" + str(i) + "/details", ds)
    }
  }
}

#let projects-section(title, xs) = {
  section-title(title)
  for (n, (i, p)) in visible(xs).enumerate() {
    if n > 0 { v(pt("entry-gap")) }
    let url = get(p, "url", "")
    let shown = get(p, "urlLabel", url)
    entry-head(get(p, "name", ""), if url != "" { text(fill: c("text"), link(url, shown)) } else [#date-range(p)])
    let d = get(p, "description", "")
    if d != "" {
      v(pt("project-desc"))
      block(width: 100%, {
        rich(d)
        layout(size => lint-probe("/projects/" + str(i) + "/description", d, size.width))
      })
    }
    let bs = get(p, "bullets", ())
    if visible(bs).len() > 0 {
      v(if d != "" { pt("bullet") } else { pt("entry-sub-bullets") })
      bullets("/projects/" + str(i) + "/bullets", bs)
    }
  }
}

// Free-form sections (`custom[]`): a title plus bullets, placed in
// `meta.sectionOrder` by their `key`.
#let custom-section(s) = {
  section-title(get(s, "title", ""))
  bullets("/custom/" + str(get(s, "index", 0)) + "/bullets", get(s, "bullets", ()))
}

#let default-titles = (
  skills: "Technical Skills",
  experience: "Work Experience",
  education: "Education",
  projects: "Projects",
)
#let titles = default-titles + get(meta, "sectionTitles", (:))
#let customs = get(data, "custom", ()).enumerate().map(((i, s)) => s + (index: i))

#header(get(data, "basics", (:)))

#for key in get(meta, "sectionOrder", ("skills", "experience", "education", "projects")) {
  let xs = get(data, key, ())
  let builtin = (
    skills: skills-section,
    experience: experience-section,
    education: education-section,
    projects: projects-section,
  )
  if key in builtin {
    if type(xs) == array and visible(xs).len() > 0 {
      v(pt("section-before"))
      builtin.at(key)(titles.at(key), xs)
    }
  } else {
    let s = customs.find(s => get(s, "key", "") == key)
    if s != none and not get(s, "hidden", false) and visible(get(s, "bullets", ())).len() > 0 {
      v(pt("section-before"))
      custom-section(s)
    }
  }
}

// Where the content ends, so tools can tell how much room is left.
#context [#metadata((
  pages: counter(page).final().first(),
  end-y: here().position().y.pt(),
  page-height: page.height.pt(),
  bottom-margin: margin.bottom,
  top-margin: margin.top,
  line-pitch: (font-size + pt("leading")).pt(),
))<pages>]
