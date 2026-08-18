# Plans for production

These documents cover the work that must be done before the ANCHOR
dashboard goes to the public. Each one covers work that cannot be
completed in this repository alone. Each needs a decision, an account,
or data that is not here.

Written in ASD-STE100 Simplified Technical English: short sentences,
active voice, one instruction in one sentence. The vocabulary rules are
relaxed for technical terms that have no approved equivalent.

## The documents

| Document | Subject | Who must decide |
| --- | --- | --- |
| [data-api.md](data-api.md) | Serve the site data from a private endpoint instead of a file in this repository | Landscape Partnership, hosting |
| [location-privacy.md](location-privacy.md) | Keep the true coordinates of private land out of the published data | Landscape Partnership, legal |
| [ownership-data.md](ownership-data.md) | Collect the ownership class in the intake form instead of guessing it | ANCHOR data owners |
| [arcgis-integration.md](arcgis-integration.md) | Connect the ANCHOR database to ArcGIS, so that one form submission completes both | Landscape Partnership, GIS staff |
| [mapbox-account.md](mapbox-account.md) | Move the basemap style and token to an account the client owns | Ferguson Lynch, Landscape Partnership |
| [map-layers.md](map-layers.md) | Decide which reference layers launch, and connect them | Landscape Partnership |
| [data-quality.md](data-quality.md) | The problems found in the current data set | ANCHOR data owners |
| [qa-plan.md](qa-plan.md) | How to check the filters and the dropdown options | Landscape Partnership, QA |
| [accessibility.md](accessibility.md) | What an accessibility audit must still cover | QA, accessibility specialist |
| [responsive-design.md](responsive-design.md) | Whether tablet widths need a design of their own | Ferguson Lynch, Landscape Partnership |

## What was built in this batch

Ten branches, each meant to become one pull request, stacked in this
order. Each branch builds on the one before it. Review them in order.

| # | Branch | What it does |
| --- | --- | --- |
| 1 | `feature/popup-total-acres` | Total acres in each site's details |
| 2 | `feature/runtime-config` | Deployment settings in one file |
| 3 | `feature/ownership-in-data` | Ownership read from the data, not from map.js |
| 4 | `feature/private-site-jitter` | Offset the shown position of non-public sites |
| 5 | `fix/site-count-orphan-record` | Count only sites that have a location |
| 6 | `feature/map-layers` | Connect NLCD, stop offering layers that do not exist |
| 7 | `feature/accessibility-pass` | Fix the faults an audit found |
| 8 | `feature/data-check-script` | A script that checks the options against the data |
| 9 | `feature/arcgis-data-source` | Read the sites from the intake form, not a file |
| 10 | `docs/production-plans` | These documents |

Two notes on the order:

Branches 4 and 5 must go together. Branch 4 changes when the site
count is calculated, which makes the fault branch 5 corrects visible
at page load instead of only after a filter change.

Branch 9 is last of the code branches on purpose. It needs the config
of branch 2, the ownership of branch 3, the offset of branch 4 and the
location filter of branch 5, and it changes where every number on the
page comes from. Branches 1 to 8 can all merge without it. It is also
the branch most likely to be held back: it points the dashboard at a
service that is not yet the safe one to read. See
[data-api.md](data-api.md).

## Open questions

Every document ends with its own questions. These are the ones that
block the most work:

1. Where will the private data endpoint be hosted? A view of the
   ArcGIS feature layer may be enough, which would need no server at
   all. Who owns the ArcGIS organisation, and may the dashboard depend
   on it? (See [data-api.md](data-api.md) and
   [arcgis-integration.md](arcgis-integration.md).)
2. Are 10 of the 29 ownership classes correct? They are marked low
   confidence and were guessed from the site name and location.
   (See [ownership-data.md](ownership-data.md).)
3. Several site names appear to be landowner surnames. Is that
   acceptable in a public map?
   (See [location-privacy.md](location-privacy.md).)
4. Is 750 m the right offset distance for private land?
   (See [location-privacy.md](location-privacy.md).)
5. Do Protected Areas and Critical Habitat have to launch, or can the
   dashboard launch with NLCD alone?
   (See [map-layers.md](map-layers.md).)
6. The "Native Long Savanna" filter option matches no site in the
   current data. Is that a gap in the data, or a land cover no ANCHOR
   site holds yet?
   (See [qa-plan.md](qa-plan.md).)
7. Which acreage figure is correct? The site total and the sum of the
   land cover columns disagree on 19 of 30 records.
   (See [data-quality.md](data-quality.md).)
8. Now that the dashboard reads the intake form live, who reviews a
   submission before the public map shows it? Nobody does today.
   (See [arcgis-integration.md](arcgis-integration.md).)

One question was answered while this batch was built. The record with a
12-digit number in place of a site name is a test submission, made from
a Ferguson Lynch account on 9 June 2026. It should be deleted from the
form. (See [data-quality.md](data-quality.md).)
