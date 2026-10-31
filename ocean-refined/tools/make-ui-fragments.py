# Regenerates ocean-refined/ui-components/*.html from the markup that ships:
# index.html for everything the page declares, and the template strings in
# dive-plan.js / guided-dive.js / dive-summary.js for the components those modules build.
# Usage, from the kit root: python ocean-refined/tools/make-ui-fragments.py ocean-refined
import io, re, sys, os

root = sys.argv[1]
read = lambda name: io.open(os.path.join(root, name), encoding='utf-8').read()
html, plan_js, tour_js, icons_js, summary_js = read('index.html'), read('dive-plan.js'), read('guided-dive.js'), read('ui-icons.js'), read('dive-summary.js')

def element(source, start):
    """The whole element whose opening tag begins at the first occurrence of `start`."""
    at = source.index(start)
    tag = re.match(r'<([a-z0-9]+)', source[at:]).group(1)
    depth, pos = 0, at
    for m in re.finditer(r'<(/?)%s\b[^>]*>' % tag, source[at:]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return source[at:at + m.end()]
    raise ValueError(start)

def icon(name, cls='hud-icon'):
    paths = re.search(r"\b%s:'([^']*)'" % name, icons_js).group(1)
    return '<svg viewBox="0 0 24 24" aria-hidden="true" class="%s">%s</svg>' % (cls, paths)

def template(source, anchor, quote):
    """The string literal that follows `anchor` in a module."""
    at = source.index(anchor) + len(anchor)
    start = source.index(quote, at) + 1
    return source[start:source.index(quote, start)]

def dedent(markup):
    lines = markup.split('\n')
    pad = min((len(l) - len(l.lstrip()) for l in lines[1:] if l.strip()), default=0)
    return '\n'.join([lines[0]] + [l[pad:] for l in lines[1:]])

fragments = {}
def add(name, title, source, styles, scripts, markup, note=''):
    head = '<!-- %s\n     Source: %s\n     Styles: %s\n     Scripts: %s%s -->\n' % (title, source, styles, scripts, ('\n     ' + note) if note else '')
    fragments[name] = head + dedent(markup).strip() + '\n'

BASE = 'styles.css, hologram.css, hud.css (+ motion.css for transitions)'

# 1. Top row and settings.
add('masthead', 'Top row: menu button, wordmark, weather glyph and the sun / moon button', 'index.html', BASE,
    'hud.js (menu, time button, weather glyph); world.js keeps html[data-sky-preset] current',
    element(html, '<header class="masthead">'), 'ambient-audio.js adds its speaker button to .sky-cluster at run time.')
add('settings-menu', 'Settings menu (opens under the menu button)', 'index.html', BASE,
    'hud.js (open / close, locks, weather picker); world.js + expedition-ui.js (time scrubber, presets, Pause motion); movement-panel.js (Scene controls); landmark-interactions.js (Model credits)',
    element(html, '<aside id="settings-menu"'), 'Shipped hidden: hud.js removes the hidden attribute. ambient-audio.js inserts a Sound group at run time.')
add('sky-selector', 'Sky time: the scrubber and the four presets (part of the settings menu)', 'index.html', BASE,
    'world.js + expedition-ui.js', element(html, '<fieldset class="theme-control"'))
add('camera-toggle', 'First / third person switch (part of the settings menu)', 'index.html', BASE,
    'world.js (shown underwater, label and aria-pressed)', element(html, '<button id="camera-toggle"'))

# 2. Heading tape, with the marks hud.js writes (three pixels per degree, a mark every 30 degrees).
marks = ''
for degrees in range(-120, 481, 30):
    bearing = degrees % 360
    cardinal = {0: 'N', 90: 'E', 180: 'S', 270: 'W'}.get(bearing)
    marks += '<span%s style="left:%dpx">%s</span>' % (' data-cardinal=""' if cardinal else '', (degrees + 120) * 3, cardinal or '%03d' % bearing)
heading = element(html, '<div class="heading-indicator"').replace('<div class="heading-tape" id="heading-tape"></div>', '<div class="heading-tape" id="heading-tape">%s</div>' % marks)
add('heading-indicator', 'Heading tape: sliding tape, fixed caret and the three-digit readout', 'index.html; the tape marks are written by hud.js', BASE,
    'hud.js (slides #heading-tape with one transform); world.js (readout and aria-label)', heading)

# 3. Round minimap, with the markers and legend world.js adds for the three sites.
reef = read('reef.js')
sites = re.findall(r"\{ id: '(\w+)', title: '(\w+)', description: '[^']*', position: \[(-?\d+), (-?\d+), (-?\d+)\] \}", reef)
markers = ''.join('<button type="button" aria-label="Map marker %s" title="%s" data-landmark="%s" style="left: %.4f%%; top: %.4f%%;">%d</button>'
                  % (t, t, i, (int(x) + 62) / 124 * 100, (int(z) + 105) / 140 * 100, n + 1) for n, (i, t, x, y, z) in enumerate(sites))
legend = ''.join('<button type="button" aria-label="Swim to %s"><span>0%d</span>%s</button>' % (t, n + 1, t) for n, (i, t, x, y, z) in enumerate(sites))
chart = element(html, '<aside class="reef-map"')
chart = chart.replace('<span class="map-player" id="map-player" aria-hidden="true"></span>', '<span class="map-player" id="map-player" aria-hidden="true" style="left: 50%; top: 75%;"></span>\n        ' + markers)
chart = chart.replace('<div class="map-legend" id="map-legend"></div>', '<div class="map-legend" id="map-legend">%s</div>' % legend)
add('reef-map', 'Round minimap (data-view="round") and the expanded reef atlas (data-view="full")', 'index.html; markers and legend are added by world.js', BASE + ', journey.css (found markers, progress line)',
    'hud.js (pans and turns #map-chart under the centre arrow, rim pips, expand / collapse); expedition-ui.js drawReefChart (the canvas); world.js (marker and diver positions, readings); journey.js (found state); motion.js (selected state)',
    chart, 'Shipped hidden: world.js shows it underwater. The round view shows 50 m around the diver; sites beyond the rim get data-off="true".')

# 4. Instruments.
add('depth-gauge', 'Depth scale, down the left edge', 'index.html', BASE, 'world.js (moves #depth-marker, 0 to 40 m)', element(html, '<aside class="depth"'))
add('air-gauge', 'Air bar, bottom right', 'index.html', BASE, 'dive-hud.js (sets --air on #air-fill, the value and data-level)', element(html, '<div id="air-gauge"'))
add('scene-footer', 'Bottom line: location, depth and the control hint', 'index.html', BASE, 'world.js', element(html, '<footer class="scene-footer'))
add('dive-computer', 'Dive computer side panel (third person)', 'index.html', BASE, 'dive-hud.js', element(html, '<aside id="dive-computer"'))
computer = element(html, '<button id="dive-computer-toggle"').replace('<span aria-hidden="true">▦</span>', '<span aria-hidden="true">%s</span>' % icon('computer'))
computer = computer.replace('aria-controls="dive-computer" hidden>', 'aria-controls="dive-computer" aria-label="Check dive computer. Press C." hidden>')
add('computer-toggle', 'Dive computer button', 'index.html; the icon is set by landmark-interactions.js, the label by dive-hud.js', BASE, 'dive-hud.js, landmark-interactions.js, ui-icons.js', computer)
archive = element(html, '<button id="archive-toggle"').replace('hidden>Dive records', 'hidden>%sDive records' % icon('resume'))
add('archive-toggle', 'Dive records button (opens the Dive Explorer)', 'index.html; the icon is added by landmark-interactions.js', BASE, 'landmark-interactions.js, ui-icons.js', archive)

# 5. Centre of the view.
add('interaction-prompt', 'Prompt to explore a landmark (F)', 'index.html', BASE, 'landmark-interactions.js', element(html, '<button id="interact-prompt"'))
add('capture-hint', 'Crosshair, click-to-swim hint and ascent status', 'index.html', BASE, 'world.js',
    element(html, '<div id="crosshair"') + '\n' + element(html, '<button id="capture-hint"') + '\n' + element(html, '<div id="ascent-status"'))

# 6. Surface hero, with the entry buttons dive-plan.js inserts and the logbook link.
entry = template(plan_js, "const entry = node('div', 'dive-entry', ", "'")
hero = element(html, '<main class="hero"')
hero = re.sub(r'(<button class="dive-button"[^\n]*</button>)', lambda m: m.group(1) + '\n    <div class="dive-entry">%s</div>' % entry, hero)
hero = hero.replace('\n  </main>', '\n    <button type="button" id="logbook-link" class="logbook-link">%sRead the logbook</button>\n  </main>' % icon('resume'))
add('surface-hero', 'Surface hero: headline, Dive in, the two entry buttons, Look around and the logbook link', 'index.html; dive-plan.js inserts .dive-entry, landmark-interactions.js appends #logbook-link',
    BASE + ', dive-plan.css (entry buttons), archive.css (logbook link)', 'world.js (#dive, #explore); dive-plan.js; guided-dive.js; landmark-interactions.js', hero)

# 7. Touch controls: the markup ships complete (thumb-stick and six keys); touch-controls.js drives it.
pad = element(html, '<div class="swim-controls')
add('swim-controls', 'Touch deck: thumb-stick, drag to look, six keys', 'index.html', BASE + ', controls.css', 'touch-controls.js, exploration.js', pad, 'Shipped hidden: world.js shows it underwater, and controls.css only lays it out when <html data-input="touch">.')
add('sky-view-controls', 'Look arrows at the surface', 'index.html', BASE, 'exploration.js', element(html, '<div class="view-controls'))

# 8. Dialogs and panels.
explorer = element(html, '<dialog id="landmark-dialog"')
for section in ('about', 'experience', 'projects', 'resume'):
    explorer = re.sub(r'(<button type="button" data-section="%s"[^>]*>)' % section, lambda m: m.group(1) + icon(section), explorer)
explorer = explorer.replace('<span class="arc-emblem" aria-hidden="true">◈</span>', '<span class="arc-emblem" aria-hidden="true">%s</span>' % icon('computer'))
explorer = explorer.replace('<nav id="explorer-index" class="arc-index" aria-label="Entries in this record"></nav>', '<nav id="explorer-index" class="arc-index" aria-label="Entries in this record"><!-- archive.js renders the entry index here --></nav>')
explorer = explorer.replace('aria-label="Record"></article>', 'aria-label="Record"><!-- archive.js renders the record here from portfolio-content.js --></article>')
add('dive-explorer', 'Dive Explorer: the diver\'s records (profile, dive log, salvage finds, C-card)', 'index.html; section icons, entry index and records are rendered by archive.js',
    'styles.css, hologram.css, motion.css, archive.css', 'archive.js, landmark-interactions.js, portfolio-content.js, ui-icons.js, vendor/gsap.min.js (entrance only)', explorer)
add('credits-dialog', 'Model credits dialog', 'index.html', BASE, 'landmark-interactions.js (loads assets/models/manifest.json)', element(html, '<dialog id="credits-dialog"'))
panel = element(html, '<aside id="movement-panel"').replace('<div class="movement-fields"></div>', '<div class="movement-fields"><!-- movement-panel.js builds one <details> group per settings group from movement-settings.js --></div>')
add('scene-controls', 'Scene controls: lighting and movement tuning panel', 'index.html; the fields are built by movement-panel.js', BASE, 'movement-panel.js, movement-settings.js (created by world.js)', panel, 'Shipped hidden: opened from the settings menu.')

# 9. Components built entirely by modules.
plan = template(plan_js, "const plan = node('dialog', 'dive-plan holo-deep', ", '`')
plan = plan.replace('<div class="plan-marks" role="group" aria-label="Dive sites"></div>', '<div class="plan-marks" role="group" aria-label="Dive sites"><!-- dive-plan.js adds one .plan-mark button per site --></div>')
add('dive-planner', 'Dive planner: site map signboard, site card and dive overview', 'dive-plan.js (built at load and appended to <body>)', 'styles.css, hologram.css, motion.css, dive-plan.css',
    'dive-plan.js, guided-dive.js, journey.js, reef.js, portfolio-content.js', '<dialog id="dive-plan" class="dive-plan holo-deep" aria-labelledby="dive-plan-title">' + plan + '</dialog>')
prompt = template(plan_js, "const prompt = node('dialog', 'dive-prompt holo holo--reading', ", "'")
add('dive-link-prompt', 'Prompt shown for a link that opens onto a dive (#anchor, #wreck, #treasure)', 'dive-plan.js', 'styles.css, hologram.css, motion.css, dive-plan.css', 'dive-plan.js',
    '<dialog class="dive-prompt holo holo--reading" aria-labelledby="dive-prompt-title">' + prompt + '</dialog>')
summary = template(summary_js, "dialog.innerHTML = ", '`').replace('${NOTE_WORDS}', '40')
add('dive-summary', 'Dive summary: the logbook page opened from the button beside Guided dive after a dive', 'dive-summary.js (built at load; the button goes after #guided-dive, the page is appended to <body>)', 'styles.css, hologram.css, motion.css, surface.css (button), dive-plan.css (chip recipe), dive-summary.css',
    'dive-summary.js, dive-log.js, field-guide.js, prepared-charts.js', '<button type="button" class="guided-button ds-open" aria-haspopup="dialog" aria-controls="dive-summary"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg><span>Dive summary</span><small>New</small></button>' + chr(10) + '<dialog class="ds" id="dive-summary" aria-labelledby="ds-title">' + summary + '</dialog>',
    'dive-summary.js fills every section from the dive log when a dive ends (oceandivelog) and opens the page from the button.')
at = tour_js.index("card.innerHTML = ")
pieces = re.findall(r"'((?:[^'\\]|\\.)*)'", tour_js[at:tour_js.index(';', tour_js.index('</footer>', at))])
add('tour-card', 'Guided dive caption card', 'guided-dive.js (built at load and appended to <body>)', 'styles.css, hologram.css, motion.css, journey.css, dive-plan.css (button recipe)', 'guided-dive.js, journey.js',
    '<section class="tour-card holo holo--reading" aria-label="Guided dive" data-show="false" inert>' + ''.join(pieces) + '</section>\n<div class="tour-fade" aria-hidden="true"></div>',
    'guided-dive.js fills the kicker, title and caption, hides the buttons that do not apply and sets data-show / data-state.')

out = os.path.join(root, 'ui-components')
for name, text in fragments.items():
    io.open(os.path.join(out, name + '.html'), 'w', encoding='utf-8', newline='\n').write(text)
print(len(fragments), 'fragments:', ', '.join(sorted(fragments)))
