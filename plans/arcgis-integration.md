# Connect the ANCHOR database to ArcGIS

## The request

> Want to link ANCHOR database to ArcGIS (completing the form should
> complete it).

A partner fills in the ANCHOR intake form once. The site then appears
in the ANCHOR database and in ArcGIS, with no second entry by hand.

## What is now known

Route A below is the correct one, and most of it needs no new code. The
form is Survey123 and it already writes to a hosted feature layer in
ArcGIS Online. The layer is published as a public, query-only view:

```
https://services6.arcgis.com/FqSZYgvweBKv4NFt/arcgis/rest/services/Public_LIVE_ANCHOR_survey123_IntakeForm/FeatureServer
```

Layer 0 is named `survey`. It holds 30 records, which are the same 30
records as the exported file, in the same order. It answers to anybody,
with no token, and it sends `Access-Control-Allow-Origin: *`, so a
browser can read it directly.

Branch `feature/arcgis-data-source` points the dashboard at it. What
that branch found:

- **The layer is the source of truth.** Its 29 site centroids agree
  with the points in `data/ANCHOR_sites.geojson` to 0.00 m. The
  exported file was made from this layer, so there is no third version
  of the data to reconcile.
- **Sites are polygons, not points.** The survey records the tracts the
  person drew. The dashboard asks the server for the centroid only
  (`returnCentroid=true&returnGeometry=false`), so no boundary reaches
  the browser. This is a privacy decision. See
  [location-privacy.md](location-privacy.md).
- **The layer has 164 columns; the export has 65.** The extra ones
  include the tract sizes, the county and state answers, and 11 more
  conservation practices per land cover than the dashboard offers
  (grazing management, food plots, riparian planting and others). The
  dashboard shows 8. Somebody chose that subset and the reason is not
  recorded.
- **There is no ownership column,** because the form does not ask. See
  [ownership-data.md](ownership-data.md).
- **The layer carries who filled in each form.** `Creator` and
  `AgencyOrPartner_FillingForm` hold names. They are already public on
  this service, and the dashboard does not show them, but a production
  endpoint must not pass them on. See [data-api.md](data-api.md).

## Why the rest is not built

Nothing about this work can be done in this repository. It needs:

- Write access to the feature layer, which is needed to add the
  ownership question and to delete the test record. The public view is
  query-only.
- The owner of the ArcGIS Online organisation that publishes the view,
  and a decision about whether the dashboard may depend on it.
- Credentials, which must never go in this repository.

**Reading is solved. Writing is not.** The rest of this document
covers the write side, which is what "completing the form should
complete it" asks for.

## What must be established first

Answer these before any design work:

1. Does the Landscape Partnership own the ArcGIS Online organisation
   that publishes the view above, or does somebody else? Which licence
   level?
2. Who is the ArcGIS administrator?
3. What does "the ANCHOR database" mean, and does it still hold data
   the feature layer does not? If the feature layer is the only store,
   this whole task reduces to keeping it tidy.
4. Is the public view meant to stay public, and stay at that address?
   The dashboard now stops working if it moves.

## Three ways to do it

### A. Survey123 writes straight to a feature layer — this is the one

A submission already writes to a hosted feature layer in ArcGIS Online.
There is no integration to build for the read side. Steps 1 and 2 are
done. Steps 3 to 5 remain, and each needs the client.

Steps:

1. ~~Confirm the form is Survey123 and find its feature layer.~~ Done.
   See "What is now known" above.
2. ~~Confirm every field the dashboard needs is in the layer.~~ Done.
   All 65 columns the dashboard reads are present, and the layer holds
   99 more.
3. Add the ownership question to the form. See
   [ownership-data.md](ownership-data.md). This is the one change that
   removes a whole file and a whole script from this repository.
4. Build a second view of the layer that holds only the public fields,
   with private locations offset, and point the dashboard at that
   instead of at `Public_LIVE_...`. See
   [location-privacy.md](location-privacy.md) and
   [data-api.md](data-api.md). **Until this is done the dashboard reads
   a service that gives any reader the exact boundary of every private
   site.**
5. Decide which reference layers ship, and whether they come from the
   same organisation. See [map-layers.md](map-layers.md).

### B. A webhook on submission

Not needed for reading. It applies only if a second system has to
receive each submission. A small service receives the submission and
writes it on with the ArcGIS REST API `addFeatures` operation.

Needed:

- A place to run the service.
- An ArcGIS account for the service, with permission to edit the
  layer, and nothing more.
- A record of failures. A webhook that fails silently loses a
  submission and nobody notices.
- A way to retry. The ArcGIS service can be down when a submission
  arrives.

### C. A scheduled job

A job runs on a schedule, reads new submissions, and writes them to
ArcGIS.

Simpler than B and slower. Choose it if the client is content for a
new site to appear the next day, and if the form tool has no webhook.

**Recommendation: A. It is already how the data flows.** B and C are
only needed if a system other than the feature layer must also receive
each submission, and question 3 above decides whether one exists.

## What must not happen

Do not put ArcGIS credentials in this repository, in `js/config.js`,
or in any file the browser downloads. A token in browser code lets
anybody edit the layer. Every write to ArcGIS must happen on a server.

## Field mapping

Whatever the route, the fields must match. The dashboard needs the
names in the table in [data-api.md](data-api.md). Two points to watch:

- The practice columns end in a code (`_NGFP`, `_PB`) and hold a
  number in the middle that is not consistent. `MixedPineSav_12_TPB`
  and `NatGrass_13_TPB` are both tree planting. The dashboard matches
  on the ending. Keep that, or change `siteHasPractice` in
  `js/map.js`.
- `Calculation_ANCHOR_ACRES_TOTAL` does not equal the sum of the land
  cover columns on 19 of 30 records. Decide which is correct before
  building a mapping that assumes either. See
  [data-quality.md](data-quality.md).

## Open questions

Questions 1 and 7 of this list are answered. The form is Survey123, the
feature layer exists, and it agrees with the file in this repository.
What is left:

1. Who owns the ArcGIS Online organisation that publishes the public
   view, and who administers it?
2. Is the public view meant to stay public and stay at its current
   address? The dashboard now depends on both.
3. Does a separate "ANCHOR database" still exist? If it does, which one
   wins when the two disagree?
4. Must a new submission appear on the dashboard at once? It does now,
   because the dashboard reads the layer live. Confirm that is wanted:
   it means an unfinished or mistaken submission is on the public map
   as soon as it is saved, with no review step. The test record
   described in [data-quality.md](data-quality.md) is an example of what
   arrives.
5. Who reviews a new submission before the public sees it, if anybody?
6. Why does the dashboard offer 8 conservation practices when the form
   collects 19? The other 11 are in the data and cannot be filtered on.
