# Collect the ownership class in the data

## What is built

Branch `feature/ownership-in-data`.

Each feature now carries `ANCHOR_Ownership`, one of `public`,
`private` or `non-profit`. `js/map.js` reads that property. It does
not classify anything. A value it does not know is reported to the
console. A site with no value is drawn, is left out of every ownership
filter, and reads "Unknown" in its details.

`scripts/set-ownership.mjs` holds the classification for the prototype
and writes the property into the GeoJSON. It also writes
`ANCHOR_OwnershipConfidence`, which is `high`, `medium` or `low`, and
it records the evidence for every entry.

The same script writes `data/ANCHOR_ownership.json`, which holds the
class, the confidence and the evidence keyed by site name. That file
exists because the intake form's ArcGIS service has no ownership
column: branch `feature/arcgis-data-source` reads the sites live, and
without the file every site would read "Unknown". `js/main.js` copies a
class onto a feature that arrived without one, and never overwrites one
that came with the data.

**That script and that file are both temporary.** On the day the intake
form collects the class, the service starts sending it, `js/main.js`
stops finding anything to fill in, and all three can be deleted:
`scripts/set-ownership.mjs`, `data/ANCHOR_ownership.json`, and the
`ownershipUrl` setting in `js/config.js`. Nothing else has to change.
That is the whole reason the copy happens at load and not in the render
code.

## Why the class had to be guessed

The ANCHOR survey has no field that asks who owns the site. It has
`AgencyOrPartner_FillingForm` and `ManagingPartner`. Both are free
text, and both hold the name of the organisation that filled in the
form.

That organisation is often not the owner. The clearest case is the
Southeastern Grasslands Institute. SGI is a non-profit at Austin Peay
State University in Clarksville, Tennessee. It appears on many of the
Tennessee records. It owns none of that land. It helps landowners
restore grassland under a grant. Reading `ManagingPartner` as the
owner would classify a private farm as a non-profit.

Fifteen of the twenty-nine mapped sites are in Middle Tennessee, in
the counties SGI works in. The guess had to be made site by site.

## Current state of the classification

| Confidence | Count | What it means |
| --- | --- | --- |
| high | 12 | Confirmed against a public record of the owning body |
| medium | 7 | Strong indication, not confirmed |
| low | 10 | Guessed from the site name and the county |

The ten low-confidence entries need review by somebody who knows the
data. Each carries a `basis` note in `scripts/set-ownership.mjs` that
says what is missing.

### One correction was found

`Barnett Woods and Prairie State Natural Area` was classified
`non-profit`. It is Barnett's Woods State Natural Area in Montgomery
County, Tennessee. The Nature Conservancy bought it in 1981 and
transferred it to the State of Tennessee in 2005. It is public.

The prototype's guess was reasonable — a conservation non-profit was
involved — and it was wrong. This is what the whole table looks like.

There is a second problem with the same record. The natural area is
40 acres. The ANCHOR record says 455 acres. The ANCHOR site therefore
covers land beyond the natural area, and that land may have a
different owner. A single class may not describe it. See
[data-quality.md](data-quality.md).

## What the intake form must ask

Add one required question:

> Who owns this land?
>
> - Public — a federal, state, county or city body
> - Private — an individual, a family, or a company
> - Non-profit — a land trust, a conservation organisation, or a
>   private university

Three rules for the form:

1. Make it required. A site with no answer is offset for privacy and
   is left out of the ownership filters, so a missing answer removes
   the site from part of the map.
2. Ask who OWNS the land. Do not ask who manages it, and do not ask
   who is filling in the form. Those are different questions and the
   present data proves they give different answers.
3. Give an example under each option. "Private" is not obvious to
   somebody filling in a form for a family farm held by a company.

## Sites that may need more than one class

Some ANCHOR sites are a group of parcels, not one parcel. Barnett's
Woods is the clear case: a state natural area plus about 415 acres of
something else.

Two ways to handle it:

1. Record the class of the largest part. Simple, and it loses
   information.
2. Allow more than one class per site, and show every class that
   applies. More work in the form, in the data and in the filters.

Option 1 is enough for launch. Ask the client whether a site with
mixed ownership is common. If it is, plan option 2.

Note that a site with any private part must be offset for privacy,
whatever class is recorded for it. See
[location-privacy.md](location-privacy.md).

## Open questions

1. Are the ten low-confidence classes correct? The list is in
   `scripts/set-ownership.mjs`, with a note on each.
2. `Spring Creek Prairie` is in Montgomery County, Tennessee, in the
   data. No public record of a Tennessee site with that name was
   found. The name is the same as the Audubon Spring Creek Prairie in
   Nebraska, which is a different place. Is the name right?
3. How common is a site with more than one owner?
4. Can the class be filled in for the sites already in the database,
   or must each partner be asked again?
5. Does the client want a fourth class, for example "Tribal"? The
   three classes come from the prototype's dropdown, not from a policy.
