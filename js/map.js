//* MAP.JS *//

// Default map extent: continental US (excludes AK/HI)
const CONUS_BOUNDS = [
    [-125.0, 24.396308], // southwest
    [-66.93457, 49.384358], // northeast
];

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

// Ownership classification — the data has no clean "who owns this
// site" field. AgencyOrPartner_FillingForm/ManagingPartner are free-text
// org names, and ManagingPartner is often a conservation nonprofit
// (e.g. Southeastern Grasslands Institute) assisting a private
// landowner, not the actual owner. Classified by hand from those two
// fields — a best guess pending client review (see plan doc for the
// full table with confidence notes). Keyed by trimmed ANCHOR_SiteName.
const SITE_OWNERSHIP = {
    "MOTSU": "public",
    "Bobwhite Quail Focus Area": "public",
    "Melvern Lake": "public",
    "Tipover and North Coves": "public",
    "North Shore": "public",
    "Melrose Air Force Range": "public",
    "Rathbun Lake": "public",
    "Stockton Lake (Masters and Hawker Point South)": "public",
    "Wilson Lake Admin Grazing": "public",
    "Kanopolis Lake": "public",
    "Spring Creek Prairie": "non-profit",
    "Dunbar Cave Prairie": "public",
    "Guthrie Wet Prairie": "non-profit",
    "Barnett Woods and Prairie State Natural Area": "non-profit",
    "Cornelia Fort": "public",
    "King Savanna": "private",
    "Morgan Farm": "private",
    "Best Hope Farm": "private",
    "Kansas Hills": "private",
    "Van Hook Savanna": "private",
    "Lytle Bend Meadow": "public",
    "Old Town Meadow": "private", // low confidence — ambiguous org name
    "Bask": "private", // medium confidence — could be nonprofit
    "Lambrecht": "private",
    "Eagleville Wet Prairie": "non-profit",
    "Penn Prairie": "non-profit", // medium confidence — private university
    "Eyheralde Savanna": "private",
    "Arnold Prairie": "private",
    "Frog Valley": "private",
};

function getOwnership(feature) {
    let name = (feature.properties.ANCHOR_SiteName || "").trim();
    return SITE_OWNERSHIP[name] || null;
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

    return {
        name: properties.ANCHOR_SiteName,
        ownership: getOwnership(feature),
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

    return `
        <button type="button" class="site-popup__close" aria-label="Close">
            <i data-lucide="x"></i>
        </button>
        <h2 class="site-popup__title">${info.name}</h2>
        <p class="site-popup__label">Ownership</p>
        <p class="site-popup__field">
            ${OWNERSHIP_LABELS[info.ownership] || "Unknown"}
        </p>
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

        // Connect access token
        // TODO: Swap FL or TLP token
        mapboxgl.accessToken =
            "pk.eyJ1IjoibXBraGluZGEiLCJhIjoiY21zMGdtZHF2MHZkYTJ4cTM5c2NubHFyZSJ9.gG5sUYWXM0l2xnKoVZZ8kA";

        // ANCHOR sites with a recorded location
        vis.features = vis.dataLayerArray[0].features.filter(
            (d) => d.geometry,
        );

        // No active filters yet: everything matches
        vis.matchingFeatures = vis.features;
        vis.nonMatchingFeatures = [];
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
            // TODO: Swap FL or TLP style link
            style: "mapbox://styles/mpkhinda/cmqfdz5sa000c01s73elr0usm", // ANCHOR custom basemap style
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
        vis.clusterIndex = new Supercluster({ radius: 50, maxZoom: 16 }).load(
            vis.matchingFeatures,
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
                vis.updateStateLayer(vis.matchingFeatures);
            })
            .catch((err) => {
                console.error("State boundary load/resolve failed:", err);
            });
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

        vis.matchingFeatures = hasActiveFilters
            ? vis.features.filter((f) =>
                  siteMatchesFilters(f, vis.activeFilters),
              )
            : vis.features;
        vis.nonMatchingFeatures = hasActiveFilters
            ? vis.features.filter(
                  (f) => !siteMatchesFilters(f, vis.activeFilters),
              )
            : [];

        vis.clusterIndex = new Supercluster({ radius: 50, maxZoom: 16 }).load(
            vis.matchingFeatures,
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
        let savedNonMatching = vis.nonMatchingFeatures;
        let savedClusterIndex = vis.clusterIndex;

        vis.matchingFeatures = vis.features;
        vis.nonMatchingFeatures = [];
        vis.clusterIndex = new Supercluster({
            radius: 50,
            maxZoom: 16,
        }).load(vis.features);
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
        vis.nonMatchingFeatures = savedNonMatching;
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
                g.append("path").attr("class", "anchor__stroke");
                g.append("path").attr("class", "anchor__fill");
                g.append("text").attr("class", "anchor__count");
                return g;
            });

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
        let visibleFeatures = showFaded ? vis.nonMatchingFeatures : [];

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

        vis.positionByCoordinates(vis.fadedAnchors);
    }

    // Removes any currently-open site popup, if there is one
    closeSitePopup() {
        let vis = this;
        if (vis.activePopup) {
            vis.activePopup.remove();
            vis.activePopup = null;
            vis.activePopupSite = null;
            vis.updateSelectedHighlight();
        }
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

        vis.closeSitePopup();
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
        vis.activePopup
            .getElement()
            .querySelector(".site-popup__close")
            .addEventListener("click", () => vis.closeSitePopup());

        // Recenter so the marker and the full popup both fit in the
        // viewport when possible. If together they're taller than the
        // viewport, fall back to centering on the marker itself so
        // it's the point (not the popup) that stays fully visible.
        let popupHeight = vis.activePopup
            .getElement()
            .getBoundingClientRect().height;
        let containerHeight = vis.map.getContainer().clientHeight;
        let contentHeight = hexHalfHeight * 2 + popupGap + popupHeight;
        let centerOffsetY =
            contentHeight <= containerHeight
                ? -(popupGap + popupHeight) / 2
                : 0;

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

    moveVis() {
        let vis = this;

        vis.positionByCoordinates(vis.anchors);
        if (vis.fadedAnchors) vis.positionByCoordinates(vis.fadedAnchors);

        if (vis.stateFill) {
            vis.stateFill.attr("d", vis.path);
            vis.stateOutline.attr("d", vis.path);
        }
    }
}
