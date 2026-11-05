"""Build test fixtures that mimic the DFO Region 2 page (copied from the live page, modified 2026-09-16).

Variant "blank" leaves repeated cells empty (as the page renders); variant "rowspan" merges them with rowspan,
so the parser is tested against both ways DFO might mark up the table.
"""
import html, os, sys

FN960 = '<a href="https://notices.dfo-mpo.gc.ca/fns-sap/index-eng.cfm?pg=view_notice&amp;DOC_ID=366086&amp;ID=all">FN0960</a>'
FN961 = '<a href="https://notices.dfo-mpo.gc.ca/fns-sap/index-eng.cfm?pg=view_notice&amp;DOC_ID=366093&amp;ID=all">FN0961</a>'
FN1008 = '<a href="https://notices.dfo-mpo.gc.ca/fns-sap/index-eng.cfm?pg=view_notice&amp;DOC_ID=367431&amp;ID=all">FN1008</a>'

STAVE = ("downstream of B.C. Hydro Dam to the CPR Railway Bridge; except you shall not fish for salmon in that portion on the east side of the Stave River, "
         "known as the Ruskin Spawning Channel on the east bank of the BC Hydro park from the inlet near the dam, downstream to the boat ramp crossing; and you shall "
         "not fish for salmon in that portion on the west side of the Stave River known as the Northrop Spawning Channel from the intake downstream to where the channel "
         "joins the Stave River mainstem, including its tributary containing the fishway")
CHILLI = ("from a line between 2 fishing boundary signs on either side of the Chilliwack River 100 m downstream from the confluence of the Chilliwack River and Slesse Creek "
          "downstream including that portion of the Sumas River from the Barrow Town Pump Station downstream to fishing boundary signs near the confluence with the Fraser River.")

# (water, area, species, dates, limit) ; None = same as row above
ROWS = [
 ("Alouette River and tributaries", "Upstream of the 216th Street bridge to a line between two fishing boundary signs at Allco park", "Chinook", "Sep 1 to Nov 30", "1 per day"),
 (None, None, "Coho", "Sep 1 to Sep 30", "Non-retention"),
 (None, None, None, "Oct 1 to Dec 31", "1 hatchery marked per day"),
 (None, "Downstream of the 216th street bridge to the confluence of the Pitt River", "Coho", "Oct 1 to Dec 31", "1 hatchery marked per day"),
 (None, "North Alouette and tributaries", "Chinook", "Sep 1 to Nov 30", "1 per day"),
 (None, None, "Coho", "Sep 1 to Nov 30", "Non-retention"),
 ("Ashlu Creek", "", "All", "Apr 1 to Mar 31", "Bait ban"),
 (None, None, "Coho", "Sep 15 to Jan 31", "1 hatchery marked per day"),
 ("Capilano River", "including tributaries", "Coho", "Apr 1 to Jun 30", "2 hatchery marked per day"),
 (None, None, "Coho", "Jul 1 to Mar 31", "4 hatchery marked per day"),
 (None, None, "Coho", "Aug 1 to Oct 31", "Bait ban"),
 (None, None, "Chinook", "Aug 1 to Sep 4", "4 per day, only 2 over 62 cm"),
 (None, None, "Chinook", "Sep 5 to Nov 30", "4 per day" + FN960),
 (None, None, "Chinook", "Aug 1 to Oct 31", "Bait ban"),
 ("Chapman Creek", "upstream of tidal water fishing boundary signs located below the Hwy 101 Bridge to 100 m below the falls. The falls are located approximately 550 m upstream of the powerline crossing.", "Coho", "Apr 1 to Mar 31", "4 hatchery marked per day, only 2 over 35 cm"),
 (None, None, "Chinook", "Apr 1 to Mar 31", "4 per day, only 1 over 50 cm"),
 ("Cheakamus River", "", "All", "Apr 1 to Mar 31", "Bait ban"),
 (None, None, "Coho", "Sep 15 to Jan 31", "1 per day, hatchery marked only"),
 ("Chehalis River", "downstream of the logging bridge 2.4 km downstream of Chehalis Lake, including tributaries to that part", "Chinook", "June 1 to Aug 31", "1 per day"),
 (None, None, None, "Sep 1 to Dec 31", "4 per day, only 1 over 62 cm"),
 (None, None, "Coho", "June 1 to Aug 31", "Non-retention"),
 (None, None, None, "Sep 1 to Dec 31", "4 hatchery marked per day"),
 ("Chilliwack/Vedder River (including Sumas River)", CHILLI, "Chinook", "July 1 to Aug 31", "1 per day"),
 (None, None, None, "Sep 1 to Dec 31", "4 per day, only 2 over 62 cm"),
 (None, None, "Coho", "July 1 to Aug 31", "Non-retention"),
 (None, None, None, "Sep 1 to Dec 31", "4 hatchery marked per day"),
 ("Coquitlam River", "", "Chinook", "Sep 5 to Sep 18", "1 hatchery marked per day" + FN961),
 (None, None, "Chinook", "Sep 19 to Dec 31", "1 per day" + FN1008),
 (None, None, "Coho", "Sep 1 to Dec 31", "1 hatchery marked per day"),
 ("De Boville Slough", "downstream of the confluence of Cedar Creek and Hyde Creek.", "Coho", "Oct 1 to Dec 31", "1 hatchery marked per day"),
 ("Dewdney Slough - See <a href=\"#nicomen\">Nicomen Slough</a>", "", "", "", ""),
 ("Fraser River", "mainstem waters upstream of the CPR Bridge at Mission, BC", "All", "Apr 1 until further notice", "No fishing for salmon"),
 ("Harrison River", "from the outlet of Harrison Lake downstream to the Highway 7 Bridge", "Coho", "Sep 1 to Dec 31", "4 hatchery marked per day"),
 (None, "from the Highway 7 Bridge downstream to the confluence with the Fraser River", "Coho", "Sep 1 to Dec 31", "4 hatchery marked per day"),
 ("Kanaka Creek", "downstream of the 112th Street bridge.", "Coho", "Nov 1 to Nov 30", "1 hatchery marked per day"),
 ("Khartoum Lake", "", "All", "Apr 1 to Mar 31", "Single barbless hook"),
 (None, None, "Chinook", "Apr 1 to Mar 31", "4 per day"),
 (None, None, "Coho", "Apr 1 to Mar 31", "4 per day"),
 ("Little Campbell River", "downstream of 12th Avenue, including tributaries to that part.", "Chinook", "Aug 15 to Sep 15", "1 hatchery marked per day"),
 (None, None, None, "Sep 16 to Dec 31", "Non-retention"),
 (None, None, "Coho", "Aug 15 to Sep 15", "Non-retention"),
 (None, None, None, "Sep 16 to Dec 31", "1 hatchery marked per day"),
 (None, "downstream of a line between 2 fishing boundary signs on either side of the Little Campbell River to the pedestrian bridge at the foot of Stayte Road.", "All", "Aug 15 to Sep 30", "No fishing for salmon"),
 ("Lois Lake", "", "All", "Apr 1 to Mar 31", "Single barbless hook"),
 (None, None, "Chinook", "Apr 1 to Mar 31", "4 per day"),
 (None, None, "Coho", "Apr 1 to Mar 31", "4 per day"),
 ("Mamquam River", "", "All", "Apr 1 to Mar 31", "Bait ban"),
 (None, None, "Coho", "Sep 15 to Jan 31", "1 per day, hatchery marked only"),
 ("Nicomekl River", "downstream of 208th Street", "Chinook", "Sep 1 to Nov 30", "1 per day"),
 (None, None, None, "Dec 1 to Dec 31", "Non-retention"),
 (None, None, "Coho", "Sep 1 to Dec 31", "1 hatchery marked per day"),
 ("Nicomen (including Dewdney) Slough", "from the confluence of Siddle (Bell's) Creek downstream to the Fraser River", "Coho", "Sep 1 to Dec 31", "4 hatchery marked per day, only 2 over 35 cm"),
 ("Norrish (Suicide) Creek", "", "Coho", "Sep 1 to Dec 31", "4 hatchery marked per day, only 2 over 35 cm"),
 ("Serpentine River", "downstream of 168th Street at Bothwell Park", "Chinook", "Sep 1 to Nov 30", "1 per day"),
 (None, None, None, "Dec 1 to Dec 31", "Non-retention"),
 (None, None, "Coho", "Sep 1 to Dec 31", "1 hatchery marked per day"),
 ("Squamish River (including Powerhouse Channel)", "", "All", "Apr 1 to Mar 31", "Bait ban"),
 (None, None, "Coho", "Sep 15 to Jan 31", "1 per day, hatchery marked only"),
 ("Stave River", STAVE, "Coho", "Sep 1 to Dec 31", "4 hatchery marked per day, only 2 over 35 cm"),
 ("Sumas River - See <a href=\"#chilliwack\">Chilliwack River</a>", "", "", "", ""),
 ("Vedder River - See <a href=\"#chilliwack\">Chilliwack River</a>", "", "", "", ""),
]

HEAD = """<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="dcterms.modified" content="2026-09-16">
<title>Region 2 - Lower Mainland</title></head><body>
<nav><ul><li><a href="#">Jobs and the workplace and other menu items that are long enough</a></li></ul></nav>
<main>
<h1>Region 2 - Lower Mainland: Recreational salmon fishing limits, openings and closures</h1>
<ul>
<li>You can only fish for salmon in Region 2 during daylight hours.</li>
<li>No fishing is allowed within 100 meters of any government facility operated for counting, passing or rearing fish.</li>
<li>You must be aware of these possession limits:
 <ul><li>The daily limit for all species of Pacific salmon from tidal and fresh waters combined is 4. Individual species limits also apply.</li>
 <li>The possession limit for all salmon from all waters is twice the daily limit. You cannot possess more than 8 salmon in total, except for salmon that are at your ordinary residence.</li>
 <li>The total annual limit for chinook salmon over 50 cm is 10 fish from all fresh waters combined.</li></ul></li>
<li>Squamish watershed: the aggregate daily limit of hatchery-marked coho in the entire Squamish non-tidal systems combined is one (1).</li>
</ul>
<h3>Related links</h3><ul><li><a href="#">Glossary of sport fishing terms</a></li></ul>
<h2>Salmon limits, openings and closures</h2>
<p>There is no fishing for salmon in waters of Region 2 flowing into Areas 28 and 29 except for the opportunities listed in the table below.</p>
<p>Unless otherwise stated in the table below, the daily limit for waters in Region 2 flowing into Areas 13, 15, and 16 is zero (0).</p>
<p>This table refers to fishing for salmon only.</p>
<table class="table"><thead><tr><th>Waters</th><th>Specific area</th><th>Species</th><th>Dates</th><th>Limits/Gear</th></tr></thead><tbody>
"""
TAIL = """</tbody></table>
<dl id="wb-dtmd"><dt>Date modified:</dt><dd><time property="dateModified">2026-09-16</time></dd></dl>
</main><footer><ul><li><a href="#">Contact us about anything at all here</a></li></ul></footer></body></html>"""

def esc(s):
    return s if s.startswith("<") or "<a " in s else html.escape(s)

def blank():
    out = [HEAD]
    for w, a, s, d, l in ROWS:
        cells = [w or "", a or "", s or "", d, l]
        if w and "See" in w:
            out.append(f'<tr><td colspan="5">{w}</td></tr>\n'); continue
        out.append("<tr>" + "".join(f"<td>{esc(c) if c else ''}</td>" for c in cells) + "</tr>\n")
    return "".join(out) + TAIL

def rowspan():
    # resolve carry-forward values, then emit rowspans for water and area columns
    resolved = []
    W = A = S = None
    for w, a, s, d, l in ROWS:
        if w is not None: W, A, S = w, a, s
        else:
            if a is not None: A, S = a, s
            elif s is not None: S = s
        resolved.append((W, A, S, d, l))
    out = [HEAD]
    i = 0
    while i < len(resolved):
        w = resolved[i][0]
        if "See" in w:
            out.append(f'<tr><td colspan="5">{w}</td></tr>\n'); i += 1; continue
        j = i
        while j < len(resolved) and resolved[j][0] == w: j += 1
        group = resolved[i:j]
        k = 0
        while k < len(group):
            a = group[k][1]
            m = k
            while m < len(group) and group[m][1] == a: m += 1
            for r in range(k, m):
                _, _, s, d, l = group[r]
                tds = ""
                if r == 0: tds += f'<th rowspan="{len(group)}" scope="row">{esc(w)}</th>'
                if r == k: tds += f'<td rowspan="{m-k}">{esc(a)}</td>'
                tds += f"<td>{s}</td><td>{d}</td><td>{l}</td>"
                out.append(f"<tr>{tds}</tr>\n")
            k = m
        i = j
    return "".join(out) + TAIL

AREA29 = """<!DOCTYPE html><html><head><meta name="dcterms.modified" content="2026-06-04"></head><body><main>
<h2>Salmon</h2>
<h3>Chinook salmon</h3>
<table><thead><tr><th>Area</th><th>Dates</th><th>Daily limit</th><th>Gear / notes</th></tr></thead><tbody>
<tr><td>Subareas 29-6, 29-7, and 29-9 to 29-17</td><td>Apr 1 to Mar 31</td><td>0</td><td>Closed. Barbless hook and line.</td></tr>
<tr><td>Subareas 29-1 to 29-5</td><td>Apr 1 to Mar 31</td><td>2</td><td>Barbless hook and line</td></tr>
</tbody></table>
<h3>Coho salmon</h3>
<table><thead><tr><th>Area</th><th>Dates</th><th>Daily limit</th><th>Gear / notes</th></tr></thead><tbody>
<tr><td>Fraser River tidal waters</td><td>Apr 1 to Mar 31</td><td>0</td><td>Closed year round</td></tr>
</tbody></table>
<h3>Groundfish</h3>
<table><thead><tr><th>Area</th><th>Limit</th></tr></thead><tbody><tr><td>29-11</td><td>Lingcod 1</td></tr></tbody></table>
</main></body></html>"""

if __name__ == "__main__":
    d = sys.argv[1]
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "region2-blank.html"), "w").write(blank())
    open(os.path.join(d, "region2-rowspan.html"), "w").write(rowspan())
    open(os.path.join(d, "area29.html"), "w").write(AREA29)
    print("fixtures written")
