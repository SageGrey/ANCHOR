# Serve the site data from a private endpoint

## The problem

The dashboard now reads the intake form's own public ArcGIS service.
See [arcgis-integration.md](arcgis-integration.md). It can also read
`data/ANCHOR_sites.geojson`, a file in this public repository. Neither
is safe to ship, for the same reason: both hand every reader the exact
position of every site, private land included.

The bundled file has two problems of its own. The repository is public
on GitHub, and Git keeps every version of the file for ever. It was
cleaned of personal information before it was committed, which was the
correct action, but that protects only the fields that were removed. It
cannot protect a future addition that somebody commits without cleaning
it.

The live service fixes one thing and makes another worse:

- **Fixed.** The dashboard no longer shows what was in a file on the
  day somebody exported it. A new site appears as soon as it is saved.
- **Worse.** Nobody reviews a submission before the public map shows it,
  and the service answers with all 164 columns, including the name of
  the person who filled in each form. The dashboard does not draw those
  columns. It downloads them.

Both sources also leave no room for a field that must stay private.

## What must be built

An endpoint that returns the site data as GeoJSON. The dashboard
already reads its address from `js/config.js`, so the browser code
does not change.

```js
// js/config.js
data: {
    source: "file",
    sitesUrl: "https://api.example.org/anchor/sites.geojson",
    credentials: "same-origin",
},
```

`source: "file"` is the setting for any endpoint that returns GeoJSON
directly, whatever serves it. `source: "arcgis"` is for a FeatureServer
and speaks the Esri query protocol instead.

A view of the feature layer, published from the same ArcGIS Online
organisation, can be this endpoint. It is likely the cheapest route,
because it needs no server: an ArcGIS view can drop columns and can
hold offset geometry. What it cannot easily do is hold the true
coordinates somewhere else, so decide first whether the true positions
have to stay reachable at all. See
[location-privacy.md](location-privacy.md).

### What the endpoint must return

A GeoJSON `FeatureCollection`. Each feature must be a `Point` with
these properties:

| Property | Type | Necessary | Notes |
| --- | --- | --- | --- |
| `ANCHOR_SiteName` | string | yes | Also used as the key for the privacy offset |
| `Calculation_ANCHOR_ACRES_TOTAL` | number | yes | Shown in the details and in the footer totals |
| `ANCHOR_Ownership` | string | yes | `public`, `private` or `non-profit`. See [ownership-data.md](ownership-data.md) |
| `ANCHOR_LocationApproximate` | boolean | yes | `true` if the endpoint already applied the offset. See [location-privacy.md](location-privacy.md) |
| `<cover>_EstAcres` | number | yes | One for each of the seven land cover groups |
| `<cover>_<n>_<code>` | number | no | Acres under one conservation practice |

The dashboard finds a practice column by its ending, not by its
number. `MixedPineSav_12_TPB` and `NatGrass_13_TPB` are both read as
tree planting. Do not change that rule without changing
`siteHasPractice` in `js/map.js`.

### What the endpoint must not return

Do not send a field the dashboard does not draw. A landowner name, a
telephone number, a contact address or a parcel number must not leave
the private system, even if no code reads it. A field that is sent is
public, whether or not it is drawn.

Send the true coordinates only for sites whose `ANCHOR_Ownership` is
`public`. Apply the offset to every other site before the response
leaves the server, and set `ANCHOR_LocationApproximate` to `true` on
each site you offset.

## Access control

Three options, from simplest to strongest.

### 1. Public endpoint, safe fields only

The endpoint is open. It returns only the fields listed above, with
private locations already offset. No login.

This is the least work and it fits a public dashboard. Anybody may see
the map, which is the point of the map.

**Choose this unless the client says the site list itself is not
public.**

### 2. Session cookie

The endpoint refuses a request with no session. The dashboard sits
behind a login on the same origin.

Set `credentials: "include"` in `js/config.js`. Nothing else in the
browser code changes.

This suits an internal tool. It does not suit a public dashboard.

### 3. Signed short-lived URL

A small server signs a URL that expires after a few minutes. The page
asks for the URL, then fetches the data from it.

This is the most work and it stops nobody who is looking at the page.
Do not use it unless a specific rule requires it.

## Caching

Site data changes slowly. Set `Cache-Control: public, max-age=300` on
a public endpoint. This keeps the dashboard fast and keeps the load on
the server low.

Do not cache a private endpoint in a shared cache. Use
`Cache-Control: private, no-store`.

## CORS

If the endpoint is on a different host from the dashboard, it must
send `Access-Control-Allow-Origin` with the dashboard's origin. Do not
send `*` on a private endpoint.

## How to test

1. Point `sitesUrl` at the new endpoint.
2. Load the dashboard. The footer must show the same site count and
   acreage as the endpoint holds.
3. Open the browser network tab. Look at the response. Confirm that no
   field holds personal information.
4. Confirm that every site with `ANCHOR_Ownership` other than `public`
   has `ANCHOR_LocationApproximate` set to `true`.
5. Confirm that the dashboard does not offset those sites a second
   time. Compare a coordinate in the response with the marker
   position.

## Open questions

1. Where will this endpoint run? Does the Landscape Partnership have
   a server, or must one be provided?
2. Which of the three access options does the client want? Is the list
   of ANCHOR sites public information?
3. Which system is the source of truth for site data today? Is it
   ArcGIS, a spreadsheet, or something else? See
   [arcgis-integration.md](arcgis-integration.md).
4. Who updates the data, and how often?
5. Must the dashboard keep working if the endpoint is down? A cached
   copy is possible, but a cached copy is a public copy again.
