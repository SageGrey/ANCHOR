//* ARCGIS.JS *//
//
// Reads the ANCHOR sites from the Survey123 intake form's own
// FeatureServer, and returns the same GeoJSON shape the bundled file
// has. Nothing downstream of this file knows which source it got.
//
// The browser loads this file as a plain script. scripts/ can load the
// same file with require(), so a data preparation step and the
// dashboard always talk to the service in one way.
//
// WHY THE SERVICE NEEDS A TRANSLATION STEP
//
// Three differences between the service and what the dashboard reads:
//
//   Geometry. The survey records a site as one or more polygons — the
//   tracts the person drew. The dashboard draws one marker per site.
//   The query asks the server for the centroid and for no geometry at
//   all, so the browser never receives a boundary. See the note on
//   privacy below, which is the main reason it is done this way.
//
//   Envelope. A FeatureServer answers with Esri JSON: attributes, and
//   a centroid as {x, y}. The dashboard reads GeoJSON properties and
//   coordinates. esriToGeoJson does that conversion.
//
//   Ownership. The service has no ownership column, because the intake
//   form does not ask. main.js fills that in from a separate file. See
//   plans/ownership-data.md.
//
// PRIVACY
//
// Asking for returnCentroid instead of the polygons is a privacy
// decision, not an optimisation. A boundary is a parcel. Sending the
// boundary of private land to every reader would publish the exact
// thing plans/location-privacy.md says must not be published, and the
// display offset in jitter.js could not undo it — the true outline
// would sit in the network tab.
//
// A centroid is still an exact point. It is offset before it is drawn,
// exactly as the bundled file's points are. That protects what a
// reader sees and no more. It does not protect what the browser
// downloads, and this service is a public one: anyone can query the
// polygons directly. Real protection needs the endpoint in
// plans/data-api.md, which serves already-offset points and nothing
// else.
//
// See plans/arcgis-integration.md.

(function (root) {
    "use strict";

    // The service answers at most maxRecordCount rows per request and
    // sets exceededTransferLimit when there are more. 1000 is under
    // every default, so one page holds the whole survey today and the
    // loop below is there for the day it does not.
    const DEFAULT_PAGE_SIZE = 1000;

    // Fields to return.
    //
    // Every field, deliberately. The dashboard finds a site's
    // conservation practices by matching column names by suffix
    // ({prefix}_{n}_{code} in map.js), because the numeric part is not
    // consistent across land covers — MixedPineSav_12_TPB against
    // NatGrass_13_TPB, and so on. A hand-written field list would
    // silently drop a practice the first time the survey renumbers a
    // column, and the map would show fewer practices with no error.
    //
    // The cost is that the response carries survey columns the
    // dashboard never reads, including the name of the person who
    // filled in each form. That is acceptable against a public service
    // that already serves them to anyone. It is not acceptable in
    // production: the endpoint in plans/data-api.md must return only
    // the columns the dashboard uses.
    const OUT_FIELDS = "*";

    // Builds one page request.
    //
    // returnGeometry=false with returnCentroid=true is the pair that
    // keeps boundaries out of the browser. outSR=4326 asks for degrees,
    // which is what Mapbox and the state boundary test both want.
    function buildSiteQueryUrl(settings, offset) {
        const layerId = settings.layerId == null ? 0 : settings.layerId;
        const pageSize = settings.pageSize || DEFAULT_PAGE_SIZE;

        const parameters = new URLSearchParams({
            where: "1=1",
            outFields: OUT_FIELDS,
            returnGeometry: "false",
            returnCentroid: "true",
            outSR: "4326",
            // Without an order the server may page inconsistently, and
            // a site could arrive twice or not at all.
            orderByFields: "objectid",
            resultOffset: String(offset),
            resultRecordCount: String(pageSize),
            f: "json",
        });

        const base = settings.featureServerUrl.replace(/\/+$/, "");
        return `${base}/${layerId}/query?${parameters}`;
    }

    // Turns one Esri JSON feature into one GeoJSON feature.
    //
    // A row with no centroid keeps a null geometry rather than being
    // dropped here. The dashboard already filters those out in one
    // place (map.js), and a row that reaches that filter can be
    // counted and reported. The survey holds one such row.
    function esriToGeoJson(features) {
        return features.map((feature) => {
            const centroid = feature.centroid;
            return {
                type: "Feature",
                properties: feature.attributes || {},
                geometry: centroid == null ||
                        centroid.x == null ||
                        centroid.y == null
                    ? null
                    : { type: "Point", coordinates: [centroid.x, centroid.y] },
            };
        });
    }

    /**
     * Reads every site from the FeatureServer.
     *
     * @param {object} settings - ANCHOR_CONFIG.data.arcgis
     * @param {string} settings.featureServerUrl - the FeatureServer URL
     * @param {number} [settings.layerId] - layer index, 0 by default
     * @param {number} [settings.pageSize] - rows per request
     * @returns {Promise<object>} a GeoJSON FeatureCollection of points
     */
    async function fetchArcgisSites(settings) {
        if (!settings || !settings.featureServerUrl) {
            throw new Error(
                "ANCHOR_CONFIG.data.arcgis.featureServerUrl is not set.",
            );
        }

        const features = [];
        let offset = 0;

        // Bounded so that a server that always sets
        // exceededTransferLimit cannot spin here for ever.
        for (let page = 0; page < 50; page += 1) {
            const response = await fetch(buildSiteQueryUrl(settings, offset));
            if (!response.ok) {
                throw new Error(
                    `ANCHOR site query failed: HTTP ${response.status}`,
                );
            }

            const body = await response.json();

            // A FeatureServer reports its own errors inside a 200
            // response, so the status code above is not enough.
            if (body.error) {
                throw new Error(
                    `ANCHOR site query failed: ${body.error.message}`,
                );
            }

            const pageFeatures = body.features || [];
            features.push(...esriToGeoJson(pageFeatures));

            if (!body.exceededTransferLimit || pageFeatures.length === 0) {
                break;
            }
            offset += pageFeatures.length;
        }

        return { type: "FeatureCollection", features };
    }

    const api = { fetchArcgisSites, esriToGeoJson, buildSiteQueryUrl };

    // Browser: attach to the global object. Node: export.
    Object.assign(root, api);
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
