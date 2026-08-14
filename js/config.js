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
    // A relative path here reads the bundled file. In production this
    // becomes the URL of an endpoint that returns the same GeoJSON
    // shape, so that member records never sit in a public repository.
    // See plans/data-api.md for what that endpoint must return.
    data: {
        sitesUrl: "data/ANCHOR_sites.geojson",

        // Sent with the sites request. A cookie-based session needs
        // "include"; a fully public file needs nothing. Kept here so
        // that switching to a private API does not touch main.js.
        credentials: "same-origin",
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
