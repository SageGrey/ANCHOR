//* CONFIG.JS *//
//
// Every value that changes between the prototype and production lives
// here, so a deployment is a one-file swap rather than a hunt through
// map.js/main.js. Loaded before any other local script (see
// index.html), which is what lets those scripts read ANCHOR_CONFIG at
// their own load time.

const ANCHOR_CONFIG = {
    // ---- Mapbox account ----
    //
    // TODO (production): replace both values with a Ferguson Lynch or
    // Landscape Partnership account. The token below is a public
    // (pk.*) token on a personal development account, and the style is
    // owned by that same account — if the account goes away, so does
    // the basemap. A public token is safe to ship in client code, but
    // restrict it by URL in the Mapbox account settings so that only
    // the production domain can spend the account's tile quota.
    mapbox: {
        accessToken:
            "pk.eyJ1IjoibXBraGluZGEiLCJhIjoiY21zMGdtZHF2MHZkYTJ4cTM5c2NubHFyZSJ9.gG5sUYWXM0l2xnKoVZZ8kA",
        style: "mapbox://styles/mpkhinda/cmqfdz5sa000c01s73elr0usm",
    },

    // ---- ANCHOR site data ----
    //
    // Where the sites come from. Both sources give main.js the same
    // GeoJSON shape, so nothing else in the dashboard changes with
    // this value.
    //
    //   "arcgis" — query the Survey123 intake form's FeatureServer, so
    //              the map shows what the form holds right now.
    //   "file"   — read the bundled snapshot in data/. Use this to work
    //              offline, or to pin a demo to known data.
    //
    // Neither is the production answer. Both send the browser the exact
    // centre point of every site, private land included, and the
    // FeatureServer is a public one. See plans/data-api.md for the
    // endpoint that has to replace this, and plans/location-privacy.md
    // for why.
    data: {
        source: "arcgis",

        // ---- source: "arcgis" ----
        //
        // A public, query-only view of the Survey123 intake form,
        // published by the Landscape Partnership. Layer 0 is "survey".
        //
        // TODO (production): this URL belongs to whoever published the
        // view. Confirm with the Landscape Partnership that it is meant
        // to stay public and stay at this address before launch — the
        // dashboard now stops working if it moves.
        arcgis: {
            featureServerUrl:
                "https://services6.arcgis.com/FqSZYgvweBKv4NFt/arcgis/rest/services/Public_LIVE_ANCHOR_survey123_IntakeForm/FeatureServer",
            layerId: 0,
            pageSize: 1000,
        },

        // ---- source: "file" ----
        sitesUrl: "data/ANCHOR_sites.geojson",

        // Sent with the sites request. A cookie-based session needs
        // "include"; a fully public file needs nothing. Kept here so
        // that switching to a private API does not touch main.js.
        credentials: "same-origin",

        // Ownership per site, keyed by site name. Neither source has an
        // ownership column: the intake form does not ask. This file is
        // the prototype's stand-in, written by
        // scripts/set-ownership.mjs. When the form collects ownership,
        // delete the file, the script, and this setting.
        //
        // A site with no entry here is drawn, reads "Unknown", is left
        // out of the ownership filters, and — because the map cannot
        // confirm it is public land — has its position offset.
        ownershipUrl: "data/ANCHOR_ownership.json",
    },

    // ---- Default map extent ----
    //
    // Continental US. Excludes Alaska and Hawaii, neither of which has
    // an ANCHOR site yet.
    bounds: [
        [-125.0, 24.396308], // southwest
        [-66.93457, 49.384358], // northeast
    ],
};
