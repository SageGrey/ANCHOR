//* LAYERS.JS *//
//
// Reference layers the reader can draw under the ANCHOR points.
//
// The prototype had three options in the Layers panel and none of them
// did anything. The panel is now built from this list, and only an
// entry with a `source` becomes an option. If no entry has a source,
// the Layers button does not appear at all.
//
// This is the answer to "connect it or hide it". Each entry is either
// connected or it is not offered. The reader never sees a control that
// does nothing.
//
// TO ADD A LAYER: give the entry a `source` in the form Mapbox GL
// expects. Nothing else has to change.
//
// TO REMOVE ONE BEFORE LAUNCH: delete the entry, or set its source to
// null and keep the note that says why.

const MAP_LAYERS = [
    {
        id: "nlcd-landcover",
        label: "NLCD Land Cover",

        // National Land Cover Database, from the MRLC WMS service.
        // Checked against the service capabilities: 2021 is the newest
        // year published for the lower 48 as NLCD_20xx_Land_Cover_L48.
        // The map is Web Mercator, so the tiles are requested in
        // EPSG:3857 and Mapbox fills in {bbox-epsg-3857} per tile.
        //
        // This is a live third-party service with no service level
        // promise to this project. See plans/map-layers.md before
        // launch: a slow or missing MRLC makes the panel look broken.
        source: {
            type: "raster",
            tiles: [
                "https://www.mrlc.gov/geoserver/mrlc_display/wms" +
                "?service=WMS&version=1.1.1&request=GetMap" +
                "&layers=NLCD_2021_Land_Cover_L48" +
                "&styles=&format=image/png&transparent=true" +
                "&srs=EPSG:3857&width=256&height=256" +
                "&bbox={bbox-epsg-3857}",
            ],
            tileSize: 256,
            attribution:
                '<a href="https://www.mrlc.gov/">MRLC NLCD 2021</a>',
        },

        // NLCD colours are strong. At full strength they hide the
        // basemap and fight the navy ANCHOR markers.
        opacity: 0.6,
    },

    {
        id: "protected-areas",
        label: "Protected Areas",
        source: null,
        note:
            "PAD-US, the usual source, is served from gis1.usgs.gov. Every " +
            "request to that server returned HTTP 502 while this was built, " +
            "including the service list itself, so no endpoint could be " +
            "confirmed. Check it again before launch. If it stays down, ask " +
            "the client whether to host a cut of PAD-US for the ANCHOR " +
            "states instead of depending on the live service.",
    },

    {
        id: "critical-habitat",
        label: "Critical Habitat",
        source: null,
        note:
            "The USFWS Critical Habitat service is up, but it publishes a " +
            "FeatureServer only. It has no map image or tile service, so " +
            "there is nothing to point a raster layer at. Drawing it needs " +
            "the polygons pulled as GeoJSON and added as a vector layer, " +
            "which is more work than the other two and needs a decision " +
            "about how much of the country to load. See plans/map-layers.md.",
    },
];

// The layers that can actually be drawn.
function availableMapLayers() {
    return MAP_LAYERS.filter((layer) => layer.source);
}
