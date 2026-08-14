//* MAP.JS *//

// Default map extent: continental US (excludes AK/HI). Set in
// config.js, which is the one file a deployment has to change.
const CONUS_BOUNDS = ANCHOR_CONFIG.bounds;

// Pointy-top regular hexagon path, centered at the origin, given the
// center-to-vertex radius (d3-shape has no built-in hexagon symbol type)
function hexagonPath(radius) {
    let points = d3.range(6).map((i) => {
        let angle = (Math.PI / 3) * i - Math.PI / 2;
        return [radius * Math.cos(angle), radius * Math.sin(angle)];
    });
    return `${d3.line()(points)}Z`;
}

// Center-to-vertex radius for a single ANCHOR point vs. a cluster
// (cluster radius grows with point count, clamped to a sane max)
const POINT_RADIUS = 8;
const CLUSTER_STROKE_OFFSET = 3;
function anchorRadius(d) {
    if (!d.properties.cluster) return POINT_RADIUS;
    return Math.min(30, 12 + Math.sqrt(d.properties.point_count) * 3);
}

// Non-matching (faded) sites stay hidden below this zoom level
const FADED_MIN_ZOOM = 9;

// A standalone (data-URI) copy of the SVG overlay has no access to our
// external stylesheet or its custom properties, so a clone destined for
// export needs the relevant rules re-declared with resolved (non-var())
// values. Used by MapVis#getUnfilteredSvgSnapshot.
function buildInlineSvgStyles() {
    let root = getComputedStyle(document.documentElement);
    let value = (name) => root.getPropertyValue(name).trim();

    return `
        .anchor__approx {
            fill: ${value("--brand-navy")};
            fill-opacity: 0.08;
            stroke: ${value("--brand-navy")};
            stroke-width: 1px;
            stroke-opacity: 0.35;
            stroke-dasharray: 3 3;
        }
        .anchor__fill { fill: ${value("--brand-navy")}; }
        .anchor__stroke {
            fill: none;
            stroke: ${value("--brand-navy")};
            stroke-width: 2px;
        }
        .anchor__count {
            font: ${value("--utility")};
            fill: ${value("--grey-50")};
            text-anchor: middle;
            dominant-baseline: central;
        }
        .state-fill { fill: ${value("--grey-50")}; stroke: none; opacity: 0.3; }
        .state-outline {
            fill: none;
            stroke: ${value("--blue-900")};
            stroke-width: 0.65px;
            stroke-dasharray: 4 2;
        }
    `;
}

//* FILTER MATCHING *//

// Land cover prefixes as used by both the {prefix}_EstAcres columns and
// the practice columns ({prefix}_{n}_{code}). Matches the dropdown
// option values in index.html.
const LANDCOVER_PREFIXES = [
    "NatGrass",
    "PollHabMilkweed",
    "PollHabNectPlants",
    "NatLongSav",
    "MixedPineSav",
    "GrazLandswCP",
    "CroplandwCP",
];

// The three ownership classes the dashboard knows. Any other value in
// the data is a mistake and gets reported (see getOwnership).
const OWNERSHIP_CLASSES = ["public", "private", "non-profit"];

// Ownership comes from the data, not from this file. The prototype
// classified sites here in JavaScript; that table now lives in
// scripts/set-ownership.mjs, which writes ANCHOR_Ownership into the
// GeoJSON. In production the ANCHOR intake form must collect the class
// directly, and the script goes away.
//
// The map treats this field as authoritative. It does not guess. A
// site with no class is drawn, but it is excluded from every ownership
// filter and shows "Unknown" in its details.
function getOwnership(feature) {
    let value = feature.properties.ANCHOR_Ownership;
    if (value == null) return null;

    value = String(value).trim().toLowerCase();
    if (OWNERSHIP_CLASSES.includes(value)) return value;

    console.warn(
        `Unknown ANCHOR_Ownership "${feature.properties.ANCHOR_Ownership}" ` +
            `on site "${feature.properties.ANCHOR_SiteName}". ` +
            `Expected one of: ${OWNERSHIP_CLASSES.join(", ")}.`,
    );
    return null;
}

//* LOCATION PRIVACY *//
//
// Public land is shown where it is. The public already knows where a
// Corps of Engineers reservoir or an Army depot is, and an exact point
// is what makes the map useful.
//
// Every other site is moved. Private landowners did not agree to have
// their parcel published, and a non-profit preserve can hold the same
// risk when the land is not open to visitors. So the rule is: show the
// exact point only when the class is "public".
//
// A site with no class is also moved. An unknown owner is treated as
// private until somebody confirms otherwise.
function isLocationApproximate(feature) {
    if (feature.properties.ANCHOR_LocationApproximate === true) return true;
    return getOwnership(feature) !== "public";
}

// Where to draw the site.
//
// ANCHOR_LocationApproximate means the data arrived already offset —
// see jitter.js and scripts/jitter-locations.mjs. In that case the
// coordinates are used as they are. Offsetting them a second time
// would move the site outside the circle the map draws around it, and
// the circle is the promise that the true point is inside.
//
// statePolygons is optional. When it is given, the offset point must
// fall in the same state as the true point. Several ANCHOR sites sit
// within the offset radius of a state line — Guthrie Wet Prairie is
// about 1 km south of the Kentucky line — and the dashboard counts and
// outlines states, so a marker on the wrong side would contradict its
// own footer. The map has no boundaries at first paint, so it draws
// once without the test and again once they arrive.
function displayCoordinates(feature, statePolygons) {
    const coordinates = feature.geometry.coordinates;
    if (feature.properties.ANCHOR_LocationApproximate === true) {
        return coordinates;
    }
    if (!isLocationApproximate(feature)) return coordinates;

    const name = feature.properties.ANCHOR_SiteName;
    const trueState = statePolygons
        ? statePolygons.find((state) => d3.geoContains(state, coordinates))
        : null;

    try {
        return jitterCoordinates(coordinates, name, {
            isAllowed: trueState
                ? (candidate) => d3.geoContains(trueState, candidate)
                : null,
        });
    } catch (err) {
        // No position inside the state was found. Privacy comes first,
        // so keep the offset and give up the state test.
        console.warn(
            `Could not keep "${name}" inside its state after the privacy ` +
                `offset. Showing it offset anyway. ${err.message}`,
        );
        return jitterCoordinates(coordinates, name);
    }
}

//* KEYBOARD ACCESS TO THE MARKERS *//

// The markers are SVG groups. A browser gives no keyboard access to
// those, so before this the whole map could be used with a mouse only.
// A keyboard user could reach the filters, see the counts change, and
// never open one site.
//
// Each marker becomes a button: it takes focus in reading order, it
// says what it is, and Enter or Space does what a click does.
//
// A cluster reports how many sites it holds and that it opens them. A
// single site reports its name, and says the position is approximate
// when it is, because that fact is otherwise carried only by a circle.
function anchorAccessibleName(d) {
    if (d.properties.cluster) {
        return `${d.properties.point_count} ANCHOR sites. ` +
            `Activate to zoom in and separate them.`;
    }
    let name = d.properties.ANCHOR_SiteName;
    let suffix = isLocationApproximate(d) ? ", approximate location" : "";
    return `${name}${suffix}. Activate for details.`;
}

function makeAnchorOperable(selection, activate) {
    selection
        .attr("tabindex", 0)
        .attr("role", "button")
        .on("keydown", function (event, d) {
            if (event.key !== "Enter" && event.key !== " ") return;
            // Space scrolls the page by default.
            event.preventDefault();
            activate(d);
        });
}

// A parallel set of features that carry the shown position. The
// properties object is shared with the true feature, not copied, so a
// filter gives the same answer against either set.
//
// Everything the reader sees is built from these. Everything counted —
// the acreage and site totals, and which states get an outline — is
// built from the true features. The offset must not change a number.
function toDisplayFeatures(features, statePolygons) {
    return features.map((feature) => ({
        type: "Feature",
        properties: feature.properties,
        geometry: {
            type: "Point",
            coordinates: displayCoordinates(feature, statePolygons),
        },
    }));
}

// A site "has" a land cover type if its EstAcres column is a positive
// number
function siteHasLandCover(feature, prefix) {
    let value = feature.properties[`${prefix}_EstAcres`];
    return typeof value === "number" && value > 0;
}

// A site "has" a practice if ANY land-cover group's column for that
// practice code is a positive number. The numeric index in these column
// names ({prefix}_{n}_{code}) isn't consistent across land-cover
// groups, so matching is done by suffix rather than a fixed index.
function siteHasPractice(feature, practiceCode) {
    return LANDCOVER_PREFIXES.some((prefix) => {
        let key = Object.keys(feature.properties).find(
            (k) => k.startsWith(prefix) && k.endsWith(`_${practiceCode}`),
        );
        let value = key ? feature.properties[key] : null;
        return typeof value === "number" && value > 0;
    });
}

// AND across the three filter categories; OR within a category's
// selected values. A category with no selections matches everything.
function siteMatchesFilters(feature, activeFilters) {
    if (
        activeFilters.owner.length > 0 &&
        !activeFilters.owner.includes(getOwnership(feature))
    ) {
        return false;
    }
    if (
        activeFilters.landcover.length > 0 &&
        !activeFilters.landcover.some((prefix) =>
            siteHasLandCover(feature, prefix),
        )
    ) {
        return false;
    }
    if (
        activeFilters.practices.length > 0 &&
        !activeFilters.practices.some((code) =>
            siteHasPractice(feature, code),
        )
    ) {
        return false;
    }
    return true;
}

//* SITE POPUP *//

// Human-readable labels + chart colors per land-cover prefix. Colors
// drawn from the existing green/brown/orange ramps rather than new
// hex values. Labels match the landcover-filter dropdown in index.html.
const LANDCOVER_INFO = {
    NatGrass: { label: "Native Grassland", color: "var(--green-600)" },
    NatLongSav: { label: "Native Long Savanna", color: "var(--green-300)" },
    MixedPineSav: { label: "Mixed Pine Savanna", color: "var(--green-800)" },
    GrazLandswCP: { label: "Grazing Lands", color: "var(--brown-500)" },
    CroplandwCP: { label: "Cropland", color: "var(--brown-700)" },
    PollHabMilkweed: {
        label: "Pollinator Habitat: Milkweed",
        color: "var(--orange-400)",
    },
    PollHabNectPlants: {
        label: "Pollinator Habitat: Nectar",
        color: "var(--orange-600)",
    },
};

// Matches the practices-filter dropdown in index.html
const PRACTICE_LABELS = {
    NWVC: "Chemical Veg. Control",
    MMNWVC: "Mechanical/Manual Veg. Control",
    BMM: "Mechanical Brush Mgmt.",
    MH: "Mowing / Haying",
    NGFP: "Native Grass / Forb Plantings",
    PB: "Prescribed Burning",
    TT: "Timber Thinning",
    TPB: "Tree Planting",
};

const OWNERSHIP_LABELS = {
    public: "Public",
    private: "Private",
    "non-profit": "Non-Profit",
};

// Land cover breakdown (with each type's share of the site's total
// recorded acreage, for the popup's proportional bar chart) and the
// list of conservation practices present on a site.
function describeSite(feature) {
    let properties = feature.properties;

    let landCover = LANDCOVER_PREFIXES.map((prefix) => ({
        prefix,
        ...LANDCOVER_INFO[prefix],
        acres: properties[`${prefix}_EstAcres`],
    })).filter((d) => typeof d.acres === "number" && d.acres > 0);

    let totalAcres = landCover.reduce((sum, d) => sum + d.acres, 0);
    landCover.forEach((d) => {
        d.percent = totalAcres > 0 ? (d.acres / totalAcres) * 100 : 0;
    });

    let practices = Object.keys(PRACTICE_LABELS).filter((code) =>
        siteHasPractice(feature, code),
    );

    // The survey's own total, not the sum of the land-cover columns
    // above — the two often disagree (a site can report a total with no
    // per-cover breakdown at all), and the total is what the footer
    // stats and the map export are built from.
    let acresTotal = properties.Calculation_ANCHOR_ACRES_TOTAL;

    return {
        name: properties.ANCHOR_SiteName,
        ownership: getOwnership(feature),
        acresTotal: typeof acresTotal === "number" && acresTotal > 0
            ? acresTotal
            : null,
        approximate: isLocationApproximate(feature),
        landCover,
        practices,
    };
}

// Builds the site popup's inner HTML. Data comes from our own bundled
// GeoJSON, not user input, so template interpolation without escaping
// is fine here.
function siteInfoHTML(feature) {
    let info = describeSite(feature);

    let chart = info.landCover.length
        ? `<div class="site-popup__chart">${info.landCover
              .map(
                  (d) =>
                      `<span class="site-popup__chart-segment" style="width:${d.percent}%;background:${d.color}"></span>`,
              )
              .join("")}</div>
            <ul class="site-popup__legend">${info.landCover
                .map(
                    (d) =>
                        `<li><span class="site-popup__swatch" style="background:${d.color}"></span>${d.label}</li>`,
                )
                .join("")}</ul>`
        : `<p class="site-popup__empty">No data recorded</p>`;

    let practices = info.practices.length
        ? `<ul class="site-popup__practices">${info.practices
              .map((code) => `<li>${PRACTICE_LABELS[code]}</li>`)
              .join("")}</ul>`
        : `<p class="site-popup__empty">No data recorded</p>`;

    let acres = info.acresTotal !== null
        ? `<p class="site-popup__field">
            <span class="site-popup__acres">${Math.round(
                info.acresTotal,
            ).toLocaleString()}</span> acres
        </p>`
        : `<p class="site-popup__empty">No data recorded</p>`;

    return `
        <button type="button" class="site-popup__close" aria-label="Close">
            <i data-lucide="x"></i>
        </button>
        <h2 class="site-popup__title">${info.name}</h2>
        ${
        info.approximate
            ? `<p class="site-popup__approx">
                    Approximate location. Exact location not shown for
                    privacy.
                </p>`
            : ""
    }
        <p class="site-popup__label">Ownership</p>
        <p class="site-popup__field">
            ${OWNERSHIP_LABELS[info.ownership] || "Unknown"}
        </p>
        <p class="site-popup__label">Total Acres</p>
        ${acres}
        <p class="site-popup__label">Land Cover</p>
        ${chart}
        <p class="site-popup__label">Conservation Practices</p>
        ${practices}
    `;
}

// Fetch US state boundaries (same source the old dashboard used).
// Returns both the raw topology (needed for merge/mesh) and the
// decoded GeoJSON polygons (needed for point-in-polygon resolution).
async function loadStateBoundaries() {
    let topo = await fetch(
        "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json",
    ).then((r) => r.json());
    return {
        topo,
        statePolygons: topojson.feature(topo, topo.objects.states).features,
    };
}

// Resolve each ANCHOR site to the state polygon that actually contains
// its submitted coordinates, rather than trusting the sparsely-filled
// "what state" survey field
function resolveAnchorStates(features, statePolygons) {
    let activeStates = new Set();
    features.forEach((feature) => {
        let match = statePolygons.find((state) =>
            d3.geoContains(state, feature.geometry.coordinates)
        );
        if (match) activeStates.add(match.properties.name);
    });
    return activeStates;
}

/**
 * Draws the Mapbox basemap plus the SVG overlay (ANCHOR hexagons, state
 * outlines) on top of it.
 *
 * @param {string} mapParentElement - id of the parent element where the map is drawn
 * @param {array} dataLayerArray - data layers to load/draw on the map
 * @param {object} eventHandler - shared pub/sub event handler (see main.js)
 */
class MapVis {
    // Constructor
    constructor(mapParentElement, dataLayerArray, eventHandler) {
        this.mapParentElement = mapParentElement;
        this.dataLayerArray = dataLayerArray;
        this.eventHandler = eventHandler;

        // Call initVis
        this.initVis();
    }

    initVis() {
        let vis = this;

        // Account credentials come from config.js — see the TODO there
        // about moving to a Ferguson Lynch / Landscape Partnership
        // account before launch.
        mapboxgl.accessToken = ANCHOR_CONFIG.mapbox.accessToken;

        // ANCHOR sites with a recorded location. These keep the true
        // coordinates. Use them for every count and for the state
        // outlines, never to draw a marker.
        vis.features = vis.dataLayerArray[0].features.filter(
            (d) => d.geometry,
        );

        // The same sites at the position the reader sees. Private and
        // non-profit sites are offset here; public sites are not.
        vis.displayFeatures = toDisplayFeatures(vis.features);

        // No active filters yet: everything matches
        vis.matchingFeatures = vis.features;
        vis.displayMatching = vis.displayFeatures;
        vis.displayNonMatching = [];
        vis.activeFilters = { owner: [], landcover: [], practices: [] };

        // Update which filters are active and re-render whenever a
        // header dropdown changes (see initHeaderFilters in main.js)
        vis.eventHandler.bind("filtersChanged", (event) => {
            let { id, values } = event.detail;
            if (id === "owner-filter") vis.activeFilters.owner = values;
            else if (id === "landcover-filter")
                vis.activeFilters.landcover = values;
            else if (id === "practices-filter")
                vis.activeFilters.practices = values;

            vis.applyFilters();
        });

        // Create new mapbox map
        vis.map = new mapboxgl.Map({
            container: vis.mapParentElement, // container ID
            style: ANCHOR_CONFIG.mapbox.style, // ANCHOR custom basemap style
            bounds: CONUS_BOUNDS, // default to the continental US extent
            fitBoundsOptions: { padding: 40 },
            projection: "mercator",
            attributionControl: false, // replaced below with a compact control
            // Without this, the WebGL buffer can be cleared right after
            // each render for performance, so reading the canvas later
            // (Export Map) can come back blank — needed for drawImage()
            // to reliably capture the current frame.
            preserveDrawingBuffer: true,
        });

        vis.map.addControl(new mapboxgl.NavigationControl());

        // Required Mapbox/OSM attribution, collapsed to a small icon
        // instead of the full inline text
        vis.map.addControl(new mapboxgl.AttributionControl({ compact: true }));

        vis.container = vis.map.getCanvasContainer();

        // Sized via the .overlay CSS class (100%/100%), not measured
        // pixels, so it tracks the container on any future layout change.
        // No explicit z-index: position:absolute alone paints above the
        // non-positioned map canvas already, without creating a stacking
        // context that would block mix-blend-mode on children.
        vis.svg = d3.select(vis.container)
            .append("svg")
            .attr("class", "overlay")
            .style("position", "absolute");

        // d3.geoPath needs a stream-based projection; individual markers
        // are positioned directly via pointProject instead (see
        // positionByCoordinates), which is simpler for a single point.
        vis.projection = function (lon, lat) {
            let point = vis.map.project(new mapboxgl.LngLat(lon, lat));
            this.stream.point(point.x, point.y);
        };

        vis.pointProject = function (d) {
            return vis.map.project(new mapboxgl.LngLat(d[0], d[1]));
        };

        vis.unproject = function (d) {
            return vis.map.unproject(d);
        };

        vis.transform = d3.geoTransform({ point: vis.projection });
        vis.path = d3.geoPath().projection(vis.transform);

        // Reproject the overlay on every map move/zoom
        vis.map.on("viewreset", () => {
            vis.moveVis();
        });
        vis.map.on("move", () => {
            vis.moveVis();
        });
        vis.map.on("moveend", () => {
            vis.moveVis();
        });

        // Group that will hold the ANCHOR point/cluster hexagons
        vis.anchorsGroup = vis.svg.append("g").attr("class", "anchors");

        // Build the spatial cluster index from the currently-matching
        // ANCHOR features (everything matches, until a filter is applied)
        // Clusters are built from the shown positions, so a cluster
        // sits where its markers are drawn.
        vis.clusterIndex = new Supercluster({ radius: 50, maxZoom: 16 }).load(
            vis.displayMatching,
        );

        // Recompute clusters, and re-check the faded sites' zoom
        // threshold, whenever the zoom level settles
        vis.map.on("zoomend", () => {
            vis.renderClusters();
            vis.renderFadedSites();
            vis.updateSelectedHighlight();
        });

        vis.renderClusters();
        vis.renderFadedSites();

        // Load state boundaries, resolve which states actually have
        // ANCHOR sites (from the sites' own coordinates), and draw the
        // outline layer once ready
        loadStateBoundaries()
            .then(({ topo, statePolygons }) => {
                vis.stateTopo = topo;
                vis.statePolygons = statePolygons;

                // Now that the boundaries are here, work out the shown
                // positions again with the state test applied. The
                // first pass had no boundaries to test against, so a
                // site near a line could have landed on the wrong side.
                vis.rebuildDisplayFeatures();
                vis.updateStateLayer(vis.matchingFeatures);
            })
            .catch((err) => {
                console.error("State boundary load/resolve failed:", err);
            });
    }

    // Draws or removes one reference layer from js/layers.js.
    //
    // The layer goes on top of the basemap. The ANCHOR markers are not
    // in the basemap — they are an SVG element above the map canvas —
    // so they stay visible whatever is turned on here.
    //
    // Mapbox rejects a layer added before the style has loaded, and the
    // reader can reach the panel before that happens, so the work waits
    // for the style when it has to.
    setOverlayLayer(layerId, isOn) {
        let vis = this;

        if (!vis.map.isStyleLoaded()) {
            vis.map.once("styledata", () => vis.setOverlayLayer(layerId, isOn));
            return;
        }

        let layer = MAP_LAYERS.find((entry) => entry.id === layerId);
        if (!layer || !layer.source) return;

        let mapId = `overlay-${layerId}`;

        if (!isOn) {
            if (vis.map.getLayer(mapId)) vis.map.removeLayer(mapId);
            if (vis.map.getSource(mapId)) vis.map.removeSource(mapId);
            return;
        }

        if (vis.map.getLayer(mapId)) return;

        vis.map.addSource(mapId, layer.source);
        vis.map.addLayer({
            id: mapId,
            type: "raster",
            source: mapId,
            paint: {
                "raster-opacity": layer.opacity == null ? 1 : layer.opacity,
            },
        });
    }

    // Works out every shown position again and redraws. Called once,
    // when the state boundaries arrive, so that the privacy offset can
    // be held inside each site's own state.
    rebuildDisplayFeatures() {
        let vis = this;

        vis.displayFeatures = toDisplayFeatures(vis.features, vis.statePolygons);

        // applyFilters rebuilds displayMatching, displayNonMatching and
        // the cluster index from the new positions, then redraws.
        vis.applyFilters();
    }

    // Recompute which states contain the given features, redraw the
    // outline layer, and notify listeners (the footer's state count) of
    // the new result. Called on initial load and again on every filter
    // change, once the state boundary data has loaded.
    updateStateLayer(features) {
        let vis = this;
        if (!vis.statePolygons) return;

        vis.activeStates = resolveAnchorStates(features, vis.statePolygons);

        // Raw topology geometries for just the active states
        let activeGeometries = vis.stateTopo.objects.states.geometries.filter(
            (g) => vis.activeStates.has(g.properties.name),
        );

        // Fill: one dissolved shape, no seams between adjacent active
        // states (topojson.feature() would give each its own ring,
        // double-drawing any shared border)
        vis.stateFillShape = topojson.merge(vis.stateTopo, activeGeometries);

        // Stroke: deduped border network — each arc (including ones
        // shared between two active states) drawn exactly once, so
        // individual state outlines still show without doubling on
        // shared edges
        vis.stateMeshShape = topojson.mesh(
            vis.stateTopo,
            vis.stateTopo.objects.states,
            (a, b) =>
                vis.activeStates.has(a.properties.name) ||
                vis.activeStates.has(b.properties.name),
        );

        vis.renderStateOutlines();
        vis.eventHandler.trigger("statesResolved", {
            states: vis.activeStates,
        });
    }

    // Re-split features by the current filters, rebuild the cluster
    // index from just the matches (so cluster counts reflect only
    // matches), re-render the faded non-matches, and refresh the state
    // outline layer + footer stats to match.
    applyFilters() {
        let vis = this;

        let hasActiveFilters =
            vis.activeFilters.owner.length > 0 ||
            vis.activeFilters.landcover.length > 0 ||
            vis.activeFilters.practices.length > 0;

        let matches = (f) => siteMatchesFilters(f, vis.activeFilters);

        // True positions, for the counts and the state outlines.
        vis.matchingFeatures = hasActiveFilters
            ? vis.features.filter(matches)
            : vis.features;

        // Shown positions, for the markers. The two sets stay in step
        // because they share one properties object per site.
        vis.displayMatching = hasActiveFilters
            ? vis.displayFeatures.filter(matches)
            : vis.displayFeatures;
        vis.displayNonMatching = hasActiveFilters
            ? vis.displayFeatures.filter((f) => !matches(f))
            : [];

        vis.clusterIndex = new Supercluster({ radius: 50, maxZoom: 16 }).load(
            vis.displayMatching,
        );

        vis.renderClusters();
        vis.renderFadedSites();
        vis.updateStateLayer(vis.matchingFeatures);

        // If the site behind an open popup no longer matches the active
        // filters, its popup no longer applies — close it
        if (
            vis.activePopupSite &&
            !vis.matchingFeatures.some(
                (f) => f.properties.ANCHOR_SiteName === vis.activePopupSite,
            )
        ) {
            vis.closeSitePopup();
        }
        vis.updateSelectedHighlight();

        vis.eventHandler.trigger("filteredFeaturesChanged", {
            features: vis.matchingFeatures,
        });
    }

    // Returns a serialized, self-contained snapshot of the SVG overlay
    // showing every ANCHOR site — ignoring whatever's currently
    // filtered on screen. Used by Export Map, which per spec always
    // shows the full network, never the active filter state. Swaps to
    // an unfiltered render, captures it, then restores the real view —
    // all synchronously, so the live map never visibly flickers.
    getUnfilteredSvgSnapshot() {
        let vis = this;

        let savedMatching = vis.matchingFeatures;
        let savedDisplayMatching = vis.displayMatching;
        let savedDisplayNonMatching = vis.displayNonMatching;
        let savedClusterIndex = vis.clusterIndex;

        vis.matchingFeatures = vis.features;
        vis.displayMatching = vis.displayFeatures;
        vis.displayNonMatching = [];
        vis.clusterIndex = new Supercluster({
            radius: 50,
            maxZoom: 16,
        }).load(vis.displayFeatures);
        vis.renderClusters();
        vis.renderFadedSites();

        let rect = vis.svg.node().getBoundingClientRect();
        let svgNode = vis.svg.node().cloneNode(true);
        svgNode.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svgNode.setAttribute("width", rect.width);
        svgNode.setAttribute("height", rect.height);
        svgNode.removeAttribute("style");

        let styleEl = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "style",
        );
        styleEl.textContent = buildInlineSvgStyles();
        svgNode.insertBefore(styleEl, svgNode.firstChild);

        let markup = new XMLSerializer().serializeToString(svgNode);

        vis.matchingFeatures = savedMatching;
        vis.displayMatching = savedDisplayMatching;
        vis.displayNonMatching = savedDisplayNonMatching;
        vis.clusterIndex = savedClusterIndex;
        vis.renderClusters();
        vis.renderFadedSites();

        return markup;
    }

    // Draw the states that actually contain an ANCHOR site: one dissolved
    // fill shape plus a deduped border network, so shared edges between
    // adjacent active states aren't double-drawn. Called again on every
    // filter change, so the group/paths are created once and reused —
    // not re-inserted each time.
    renderStateOutlines() {
        let vis = this;

        if (!vis.statesGroup) {
            // Insert as the first child so it sits below the anchors group
            vis.statesGroup = vis.svg
                .insert("g", ":first-child")
                .attr("class", "states");
            vis.stateFill = vis.statesGroup
                .append("path")
                .attr("class", "state-fill");
            vis.stateOutline = vis.statesGroup
                .append("path")
                .attr("class", "state-outline");
        }

        vis.stateFill.datum(vis.stateFillShape).attr("d", vis.path);
        vis.stateOutline.datum(vis.stateMeshShape).attr("d", vis.path);
    }

    // Query the cluster index for the current zoom level and (re)join
    // the resulting points/clusters as hexagon groups
    renderClusters() {
        let vis = this;

        let zoom = Math.round(vis.map.getZoom());
        let clusters = vis.clusterIndex.getClusters([-180, -85, 180, 85], zoom);

        vis.anchors = vis.anchorsGroup
            // Faded (non-matching) elements also carry the base "anchor"
            // class — excluding them here keeps this selection from
            // stealing/mis-binding their DOM nodes on every re-render
            .selectAll(".anchor:not(.anchor--faded)")
            .data(
                clusters,
                (d) =>
                    d.properties.cluster
                        ? `cluster-${d.properties.cluster_id}`
                        : d.properties.ANCHOR_SiteName,
            )
            .join((enter) => {
                let g = enter
                    .append("g")
                    .attr("class", "anchor")
                    .attr(
                        "data-site-name",
                        (d) => d.properties.ANCHOR_SiteName,
                    )
                    .on("click", (event, d) =>
                        d.properties.cluster
                            ? vis.zoomToCluster(d)
                            : vis.showSitePopup(d),
                    );
                makeAnchorOperable(g, (d) =>
                    d.properties.cluster
                        ? vis.zoomToCluster(d)
                        : vis.showSitePopup(d)
                );
                // First child, so the hexagon paints on top of it.
                g.append("circle").attr("class", "anchor__approx");
                g.append("path").attr("class", "anchor__stroke");
                g.append("path").attr("class", "anchor__fill");
                g.append("text").attr("class", "anchor__count");
                return g;
            });

        // The name has to be reset on every render, not only on enter:
        // a group can change from a cluster of 4 to a cluster of 7, and
        // its bound datum changes under the same DOM node.
        vis.anchors.attr("aria-label", anchorAccessibleName);

        // Size each hexagon (fill + offset stroke ring) and label clusters
        vis.anchors.each(function (d) {
            let radius = anchorRadius(d);
            let g = d3.select(this);

            g.select(".anchor__fill").attr("d", hexagonPath(radius));
            g.select(".anchor__stroke").attr(
                "d",
                hexagonPath(radius + CLUSTER_STROKE_OFFSET),
            );
            g.select(".anchor__count").text(
                d.properties.cluster ? d.properties.point_count : null,
            );
        });

        vis.moveVis();
    }

    // Sites that don't match the active filters stay hidden below
    // FADED_MIN_ZOOM (decluttered while zoomed out), and are hidden
    // entirely regardless of zoom if the active filters have zero real
    // matches (nothing to show faded sites "against").
    renderFadedSites() {
        let vis = this;

        let showFaded =
            vis.matchingFeatures.length > 0 &&
            vis.map.getZoom() >= FADED_MIN_ZOOM;
        let visibleFeatures = showFaded ? vis.displayNonMatching : [];

        vis.fadedAnchors = vis.anchorsGroup
            .selectAll(".anchor--faded")
            .data(visibleFeatures, (d) => d.properties.ANCHOR_SiteName)
            .join((enter) => {
                let g = enter
                    .append("g")
                    .attr("class", "anchor anchor--faded")
                    .attr(
                        "data-site-name",
                        (d) => d.properties.ANCHOR_SiteName,
                    )
                    .on("click", (event, d) => vis.showSitePopup(d));
                makeAnchorOperable(g, (d) => vis.showSitePopup(d));
                g.append("circle").attr("class", "anchor__approx");
                g.append("path")
                    .attr("class", "anchor__stroke")
                    .attr(
                        "d",
                        hexagonPath(POINT_RADIUS + CLUSTER_STROKE_OFFSET),
                    );
                g.append("path")
                    .attr("class", "anchor__fill")
                    .attr("d", hexagonPath(POINT_RADIUS));
                return g;
            });

        vis.fadedAnchors.attr("aria-label", anchorAccessibleName);

        vis.positionByCoordinates(vis.fadedAnchors);
    }

    // Removes any currently-open site popup, if there is one.
    //
    // Focus goes back to the marker that opened the popup. Without
    // that, closing with the keyboard drops focus onto the page body
    // and the reader has to tab in from the top again.
    closeSitePopup() {
        let vis = this;
        if (!vis.activePopup) return;

        let returnTo = vis.popupOpenedFrom;

        vis.activePopup.remove();
        vis.activePopup = null;
        vis.activePopupSite = null;
        vis.popupOpenedFrom = null;
        vis.updateSelectedHighlight();

        // The marker may have been redrawn or removed while the popup
        // was open, so check it is still on the page.
        if (returnTo && document.contains(returnTo)) returnTo.focus();
    }

    // Marks whichever site's popup is currently open with
    // .anchor--selected. Re-run after any re-render that rebuilds the
    // anchor selections (zoom change, filter change), since those
    // create fresh DOM nodes that wouldn't otherwise carry the class.
    updateSelectedHighlight() {
        let vis = this;
        let isSelected = (d) =>
            !d.properties.cluster &&
            d.properties.ANCHOR_SiteName === vis.activePopupSite;

        if (vis.anchors) vis.anchors.classed("anchor--selected", isSelected);
        if (vis.fadedAnchors) {
            vis.fadedAnchors.classed("anchor--selected", isSelected);
        }
    }

    // Clicking a cluster fits the map to the extent of all of its
    // underlying ANCHOR sites, revealing them. Clicking an individual
    // (already-expanded) point is a no-op.
    zoomToCluster(d) {
        let vis = this;

        if (!d.properties.cluster) return;

        vis.closeSitePopup();

        let leaves = vis.clusterIndex.getLeaves(
            d.properties.cluster_id,
            Infinity,
        );
        let bounds = new mapboxgl.LngLatBounds();
        leaves.forEach((leaf) => bounds.extend(leaf.geometry.coordinates));

        // cameraForBounds computes what fitBounds would use without
        // moving the map, so we can back off a couple zoom levels from
        // it — a tight cluster (e.g. 2 sites a few meters apart)
        // would otherwise compute an extreme zoom past the basemap's
        // comfortable range. Never zoom out past the current level,
        // though — a click should always feel like "in," never "out."
        //
        // Both the padding and the pullback below are tuned against
        // desktop's wide canvas. On a narrow mobile viewport the same
        // 60px padding eats a much bigger share of the available
        // width, so cameraForBounds already fits a lower zoom than it
        // would on desktop — pulling back 2 more levels on top of
        // that was leaving clusters still merged instead of breaking
        // apart. Scale both down when the map is narrow.
        let isNarrow = vis.map.getContainer().clientWidth < 600;
        let camera = vis.map.cameraForBounds(bounds, {
            padding: isNarrow ? 30 : 60,
            maxZoom: 18,
        });
        if (!camera) return;

        vis.map.easeTo({
            center: camera.center,
            zoom: Math.max(camera.zoom - (isNarrow ? 0 : 2), vis.map.getZoom()),
            duration: 250,
        });
    }

    // Clicking an individual (non-cluster) site shows its details —
    // ownership type, land cover breakdown, conservation practices — in
    // a Mapbox popup anchored to its coordinates.
    showSitePopup(feature) {
        let vis = this;

        // Remember the marker that had focus, so the popup can hand
        // focus back to it when it closes. Read it before
        // closeSitePopup, which clears the record.
        let openedFrom = document.activeElement &&
                document.activeElement.classList &&
                document.activeElement.classList.contains("anchor")
            ? document.activeElement
            : null;

        vis.closeSitePopup();
        vis.popupOpenedFrom = openedFrom;
        vis.activePopupSite = feature.properties.ANCHOR_SiteName;
        vis.updateSelectedHighlight();

        // Visual half-height of the hexagon marker, including its
        // offset stroke ring (the actual outer visible boundary)
        let hexHalfHeight = POINT_RADIUS + CLUSTER_STROKE_OFFSET;
        let popupGap = 5;

        // closeOnClick: false — it defaults to true and registers a
        // "close on any map click" listener immediately, which fires for
        // the same click that opened the popup (our hexagons are a
        // custom SVG overlay, not Mapbox's Marker class, which
        // coordinates this automatically) and closes it instantly.
        // anchor/offset push the popup straight down, clearing the
        // hexagon by its half-height + gap. closeButton: false — using
        // our own Lucide-icon button in siteInfoHTML instead of Mapbox's
        // plain "×" glyph.
        vis.activePopup = new mapboxgl.Popup({
            className: "site-popup",
            closeOnClick: false,
            closeButton: false,
            anchor: "top",
            offset: [0, hexHalfHeight + popupGap],
        })
            .setLngLat(feature.geometry.coordinates)
            .setHTML(siteInfoHTML(feature))
            .addTo(vis.map);

        // Render the close button's Lucide icon (setHTML() inserts raw
        // markup, so it isn't picked up by the one-time createIcons()
        // call in index.html) and wire it up
        lucide.createIcons();

        let popupElement = vis.activePopup.getElement();
        popupElement
            .querySelector(".site-popup__close")
            .addEventListener("click", () => vis.closeSitePopup());

        // The details are a dialog raised by the marker, so name them
        // with the site name and let Escape close them from anywhere
        // inside.
        let content = popupElement.querySelector(".mapboxgl-popup-content");
        content.setAttribute("role", "dialog");
        content.setAttribute(
            "aria-label",
            `${feature.properties.ANCHOR_SiteName} details`,
        );
        content.addEventListener("keydown", (event) => {
            if (event.key === "Escape") vis.closeSitePopup();
        });

        // Focus moves into the popup only when the marker was reached
        // by keyboard. A mouse user who clicks a marker should not have
        // focus jump, but a keyboard user needs to land on the content
        // they just opened.
        if (openedFrom) popupElement.querySelector(".site-popup__close").focus();

        let containerHeight = vis.map.getContainer().clientHeight;
        let isMobile = vis.map.getContainer().clientWidth < 1000;

        let centerOffsetY;
        if (isMobile) {
            // The map area is short on mobile (most of the viewport's
            // height goes to header/stats/filters/footer chrome), so
            // there's rarely room to center the marker+popup as one
            // unit. Anchoring the marker near the top instead gives
            // the popup (which opens downward) the most possible room
            // to read before its own internal scroll kicks in.
            let topInset = 20;
            centerOffsetY = -(containerHeight / 2 - topInset);

            // .main clips anything extending past the map's own box
            // (needed for the canvas/SVG), so a flat CSS max-height
            // isn't enough — if it's taller than what's actually left
            // below the marker, the excess gets silently cut off by
            // that clipping instead of becoming reachable via scroll.
            // Compute the real remaining space and set it directly,
            // overriding style.css's max-height on this popup instance.
            let popupTopOffset = hexHalfHeight + popupGap;
            let bottomMargin = 20;
            let maxPopupHeight =
                containerHeight - topInset - popupTopOffset - bottomMargin;
            vis.activePopup
                .getElement()
                .querySelector(".mapboxgl-popup-content")
                .style.maxHeight = `${maxPopupHeight}px`;
        } else {
            // Recenter so the marker and the full popup both fit in the
            // viewport when possible. If together they're taller than
            // the viewport, fall back to centering on the marker itself
            // so it's the point (not the popup) that stays fully visible.
            let popupHeight = vis.activePopup
                .getElement()
                .getBoundingClientRect().height;
            let contentHeight = hexHalfHeight * 2 + popupGap + popupHeight;
            centerOffsetY = contentHeight <= containerHeight
                ? -(popupGap + popupHeight) / 2
                : 0;
        }

        // Zoom 5 is a floor, not a fixed target — if already zoomed in
        // past it, stay there rather than zooming back out to 5.
        vis.map.easeTo({
            center: feature.geometry.coordinates,
            zoom: Math.max(vis.map.getZoom(), 5),
            offset: [0, centerOffsetY],
            duration: 250,
        });
    }

    // Shared helper: position a selection of anchor <g> elements from
    // their bound feature's coordinates
    positionByCoordinates(selection) {
        let vis = this;
        selection.attr("transform", (d) => {
            let p = vis.pointProject(d.geometry.coordinates);
            return `translate(${p.x},${p.y})`;
        });
    }

    // Screen pixels for a distance on the ground, at the current zoom
    // and the given latitude. Standard Web Mercator: one pixel covers
    // less ground as you zoom in, and less again as you move away from
    // the equator.
    groundMetresToPixels(metres, latitude) {
        let vis = this;
        let metresPerPixel = (156543.03392 *
            Math.cos((latitude * Math.PI) / 180)) /
            Math.pow(2, vis.map.getZoom());
        return metres / metresPerPixel;
    }

    // Sizes the circle that says "the site is somewhere in here".
    //
    // The offset moves a site by up to JITTER_RADIUS_M, and the circle
    // has that same radius around the shown point. The true point is
    // therefore always inside the circle.
    //
    // Rules:
    //   - Exact sites get no circle.
    //   - Clusters get no circle. A cluster can hold both exact and
    //     offset sites, so one circle around it would state something
    //     the map cannot support.
    //   - A circle smaller than the marker is dropped. At continental
    //     zoom 750 m is well under one pixel, and a faint dot under
    //     each hexagon reads as a rendering fault, not as a message.
    sizeApproximateCircles(selection) {
        let vis = this;
        let minRadius = POINT_RADIUS + CLUSTER_STROKE_OFFSET;

        selection.select(".anchor__approx").attr("r", function (d) {
            if (d.properties.cluster || !isLocationApproximate(d)) return 0;
            let radius = vis.groundMetresToPixels(
                JITTER_RADIUS_M,
                d.geometry.coordinates[1],
            );
            return radius < minRadius ? 0 : radius;
        });
    }

    moveVis() {
        let vis = this;

        vis.positionByCoordinates(vis.anchors);
        vis.sizeApproximateCircles(vis.anchors);
        if (vis.fadedAnchors) {
            vis.positionByCoordinates(vis.fadedAnchors);
            vis.sizeApproximateCircles(vis.fadedAnchors);
        }

        if (vis.stateFill) {
            vis.stateFill.attr("d", vis.path);
            vis.stateOutline.attr("d", vis.path);
        }
    }
}
