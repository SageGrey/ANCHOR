# Reference layers on the map

## The request

> The UI for loading additional layers to the map (e.g. NLCD) has been
> built but not connected to data sources. Determine if this is needed
> for launch and either connect or hide the button.

## What is built

Branch `feature/map-layers`.

`js/layers.js` holds one entry per layer. The panel is built from that
list. An entry with a `source` becomes an option. An entry without one
is not shown. If no entry has a source, the whole Layers button is
removed.

So the rule is now automatic: **a layer is connected, or it is not
offered.** The reader never meets a control that does nothing.

## Current state

| Layer | State | Reason |
| --- | --- | --- |
| NLCD Land Cover | Connected | MRLC WMS, confirmed working |
| Protected Areas | Not offered | The service is down |
| Critical Habitat | Not offered | The service has no raster output |

### NLCD Land Cover — connected

Served by the MRLC WMS at `www.mrlc.gov/geoserver/mrlc_display/wms`.
The layer name `NLCD_2021_Land_Cover_L48` was taken from the service's
own capabilities document. 2021 is the newest year published for the
lower 48.

It draws at 60 percent, which leaves the basemap and the navy ANCHOR
markers readable through it.

**Risk to settle before launch.** This is a live service run by a
federal agency. It gives this project no service level promise. If it
is slow, the layer is slow. If it is down, the option is there and
nothing appears, which reads as a fault in the dashboard.

Three ways to handle that:

1. Accept it. Least work. A federal service being down is a visible
   problem for the reader.
2. Detect a failure and say so. Mapbox raises an error event for a
   tile that fails. Catch it, untick the box, and show a short message.
   Moderate work, and much better behaviour.
3. Host the tiles. Most work, most control, and a cost. Only worth it
   if NLCD is important to the dashboard's purpose.

**Recommend option 2.**

### Protected Areas — not offered

PAD-US is the standard source. It is served from `gis1.usgs.gov`.
Every request to that host returned HTTP 502 while this was built,
including the service list itself, so no endpoint could be confirmed.

The whole server was down, not one service, so this is likely to be
temporary. Check it again before launch.

If it is still down, or if its reliability is a worry, take a cut of
PAD-US for the states that hold ANCHOR sites and host it. That is a
much smaller file than the national data set, and it removes the
dependency.

### Critical Habitat — not offered

The USFWS Critical Habitat service responds. It publishes a
FeatureServer only, holding "Final Critical Habitat Features" and
"Proposed Critical Habitat Features" as polygons. There is no map
image service and no tile service, so there is nothing for a raster
layer to point at.

Drawing it needs the polygons fetched as GeoJSON and added as a vector
layer. That raises a question the other two do not: how much of the
country to load. The national data set is large, and loading it all
would make the dashboard slow to start.

Options:

1. Load only the area the reader is looking at, and refetch as they
   move. Best behaviour, most work.
2. Load only the states that hold ANCHOR sites, once. Simpler, and it
   makes the layer wrong if the reader looks elsewhere.
3. Leave it out.

**This layer needs the most work of the three. Ask whether it is
wanted before building it.**

## Is any of this needed for launch?

The dashboard's purpose is to show the ANCHOR network. The reference
layers are context, not the point.

**Recommendation: launch with NLCD alone.** It is connected, it works,
and it gives a reader useful context for a grassland site. Add the
other two after launch, when the client has said whether they are
wanted and the services have been checked again.

The panel handles this by itself. Nothing needs hiding by hand.

## How to add a layer later

Give the entry in `js/layers.js` a `source` in the form Mapbox GL
expects, and an `opacity` if the default of 1 is too strong. Nothing
else changes. The option appears.

## Open questions

1. Do Protected Areas and Critical Habitat have to launch, or can the
   dashboard launch with NLCD alone?
2. Is a live federal service acceptable, or should the tiles be
   hosted? (See the NLCD risk above.)
3. Is NLCD 2021 the right year? Newer annual products exist under
   other names, and the client's other work may already use a
   particular year.
4. For Critical Habitat, does the reader need final habitat, proposed
   habitat, or both?
5. Should more than one layer be allowed at once? The panel allows it
   today. Two raster layers on top of each other are hard to read.
