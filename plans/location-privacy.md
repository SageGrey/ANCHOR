# Keep private locations private

## What is built

Branch `feature/private-site-jitter`.

Sites whose `ANCHOR_Ownership` is `public` are drawn at their exact
point. Every other site, and every site with no class, is moved by up
to 750 m. A dashed circle of the same radius is drawn around the
marker, so the true point is always inside the circle. The details
panel says the same thing in words.

The offset comes from a hash of the site name. The same site always
moves the same way, for every reader and on every load.

`js/jitter.js` holds the algorithm. The browser loads it as a script.
`scripts/jitter-locations.mjs` loads the same file. There is one copy.

## What is NOT solved

**The dashboard offsets the drawing, not the data.** The browser
downloads `data/ANCHOR_sites.geojson`, and that file still holds the
true coordinates. Anybody can open the network tab, or the GitHub
repository, and read them.

The offset in the browser is a display honesty feature. It tells the
reader that the marker is not the parcel. It protects nobody.

**Only the data gives protection.** Do one of these before launch:

1. Run `scripts/jitter-locations.mjs` on the export from the ANCHOR
   database. Publish the output file. Keep the input in the private
   system.
2. Apply the same offset in the API, before the response is sent.
   See [data-api.md](data-api.md).

Both write `ANCHOR_LocationApproximate: true` on each moved site. The
dashboard reads that flag, leaves the coordinates alone, and still
draws the circle. So the published file is safe and the map still
tells the truth about it.

### Run the script

```
node scripts/jitter-locations.mjs private/sites.geojson public/sites.geojson
```

The script needs no packages installed. It reads the state boundaries
over the network. It refuses to overwrite its input.

## The state boundary problem

The first version of the offset moved one site across a state line.

The dashboard counts states and draws an outline around each state
that holds a site. Guthrie Wet Prairie is about 1 km south of the
Kentucky line, in Montgomery County, Tennessee. A 750 m offset to the
north put its marker in Kentucky, where the map drew no outline and
the footer counted no site. The marker contradicted the numbers under
it.

The offset must now land inside the site's own state. If no position
works after eight tries, the radius is halved and the search runs
again, up to six times. A site very close to a line therefore moves
less than one further inside.

That is a real cost. A site 100 m from a state line can only move
about 100 m towards that line, so a reader who knows the site is near
the line learns a little more about where it is. The alternative is a
marker in the wrong state, which is simply false. If the client
prefers the larger offset, remove the `isAllowed` test in
`displayCoordinates` in `js/map.js` and accept that the state count
and the markers will sometimes disagree.

The privacy always wins over the state test. If no position inside the
state can be found, the site is still offset and a warning is written
to the console.

## Site names may identify the landowner

**This is the most serious open privacy problem, and the offset does
not touch it.**

Several site names look like the surname of the landowner:

- `Lambrecht` (Wilson County, Tennessee)
- `Eyheralde Savanna` (Lucas County, Iowa) — "Eyheralde" is a surname
- `Morgan Farm`, `Best Hope Farm` (Dickson County, Tennessee)
- `Bask` (Hickman County, Tennessee)

A reader who has the surname and the county can find the parcel in a
public county property record. Moving the marker 750 m does not stop
that. The name is on the map and in the details panel.

The personal fields were removed from the data. The names were not,
because they are the label the map needs.

This needs a client decision. The options:

1. Keep the names. Accept that a private landowner can be identified.
2. Give each private site a name that carries no surname, for example
   "Dickson County Grassland 2". Keep the true name in the private
   system.
3. Ask each landowner whether their name may appear. Use option 2 for
   any landowner who says no, or who was not asked.

Option 3 is the correct one. Option 2 is the safe one to build now if
the answers are not available before launch.

## Nearby sites

King Savanna, Morgan Farm and Best Hope Farm are within about 1 km of
each other in Dickson County, Tennessee. A 750 m offset is large
enough that their markers can cross. Each marker keeps its own name,
so nothing is mislabelled, but the reader cannot use the relative
positions to tell them apart.

That is correct behaviour. If the offset kept the order, the order
would be information a reader could use.

## Choosing the radius

750 m was chosen because:

- It is much larger than a field, so it does not point at a parcel.
- It is small enough that a site stays in its own county in almost all
  cases, so the map stays useful at state level.
- It keeps the circle visible at the zoom levels a reader uses to look
  at one site.

This is a judgement, not a standard. Change `JITTER_RADIUS_M` in
`js/jitter.js` to change it. Do not lower it without a privacy review.

## How to test

Run this after any change to the offset:

```
node scripts/jitter-locations.mjs data/ANCHOR_sites.geojson /tmp/out.geojson
```

Then confirm, against the output:

1. Every site whose class is `public` has coordinates equal to the
   input.
2. Every other site has different coordinates.
3. Every moved site has `ANCHOR_LocationApproximate: true`.
4. No moved site is more than 750 m from its input point.
5. Every moved site is in the same state as its input point.

Then load the dashboard against the output file and confirm the
browser does not move anything a second time.

## Open questions

1. Is 750 m the right distance? Does the client have a rule, or a
   promise made to landowners, that sets it?
2. Should non-profit sites be offset? They are today. A land trust
   preserve that is open to the public may not need it, but a preserve
   that is closed may need it more than a farm does.
3. What about a site with no ownership class? It is offset today,
   which is the safe default. Confirm that is wanted.
4. May the site names stay as they are? See the section above. This
   is the question that matters most.
5. Did the ANCHOR intake form tell landowners that their site would
   appear on a public map? If not, ask before launch.
