//* MAIN.JS *//

let myMapVis;

// dataLayerArray[0] — this index is relied on directly in map.js and export.js
let promises = [loadSites()];

Promise.all(promises)
    .then(function (data) {
        initMainPage(data);
    })
    .catch(function (err) {
        console.error(err);
    });

// Reads the sites from whichever source config.js names and returns one
// GeoJSON FeatureCollection either way. Everything downstream — map.js,
// export.js — sees the same shape from both.
async function loadSites() {
    const settings = ANCHOR_CONFIG.data;

    const sites = settings.source === "arcgis"
        ? await fetchArcgisSites(settings.arcgis)
        : await d3.json(settings.sitesUrl, {
            credentials: settings.credentials,
        });

    await applyOwnership(sites, settings.ownershipUrl);
    return sites;
}

// Fills in ANCHOR_Ownership from the side file named in config.js.
//
// The dashboard does not classify sites — see the note above
// getOwnership in map.js — and neither does this function. It copies a
// recorded class onto a feature that has no class yet, and it never
// overwrites one that arrived with the data. So a source that grows an
// ownership column of its own takes over on that day with no code
// change, and the side file becomes dead weight that can be deleted.
async function applyOwnership(sites, ownershipUrl) {
    if (!ownershipUrl) return;

    let bySite;
    try {
        const response = await fetch(ownershipUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        bySite = await response.json();
    } catch (err) {
        // A missing side file is not fatal. Every site then reads
        // "Unknown" and every site is offset, which is the safe way to
        // fail: it shows less and hides more.
        console.warn(
            `Could not read ownership from ${ownershipUrl}. Every site ` +
                `will read "Unknown" and be drawn at an offset position.`,
            err,
        );
        return;
    }

    const unmatched = [];

    for (const feature of sites.features) {
        if (feature.properties.ANCHOR_Ownership != null) continue;

        const name = String(feature.properties.ANCHOR_SiteName || "").trim();
        const entry = bySite[name];

        if (!entry) {
            // A record with no location never reaches the map, so it
            // needs no class and is not worth reporting.
            if (feature.geometry) unmatched.push(name);
            continue;
        }

        feature.properties.ANCHOR_Ownership = entry.ownership;
        feature.properties.ANCHOR_OwnershipConfidence = entry.confidence;
    }

    if (unmatched.length > 0) {
        console.warn(
            `No recorded ownership for ${unmatched.length} site(s). They ` +
                `read "Unknown" and are drawn at an offset position:\n  ` +
                unmatched.join("\n  "),
        );
    }
}

// Shared pub/sub bus — main.js and map.js both bind/trigger events on this
let eventHandler = {
    bind: (eventName, handler) => {
        document.body.addEventListener(eventName, handler);
    },
    trigger: (eventName, extraParameters) => {
        document.body.dispatchEvent(
            new CustomEvent(eventName, {
                detail: extraParameters,
            }),
        );
    },
};

function initMainPage(dataArray) {
    myMapVis = new MapVis("map-vis", dataArray, eventHandler);

    // Count the sites the map can actually show, which is what MapVis
    // reports from here on. The raw array also holds records with no
    // location. Counting those at load and dropping them at the first
    // filter change made the total fall on its own and never come back.
    updateFooterStats(myMapVis.features);
}

// Populate and update the footer stat tiles
function updateFooterStats(features) {
    const totalAcres = features.reduce(
        (sum, f) => sum + (f.properties.Calculation_ANCHOR_ACRES_TOTAL || 0),
        0,
    );

    document.getElementById("stat-acres").textContent = Math.round(
        totalAcres,
    ).toLocaleString();
    document.getElementById("stat-sites").textContent = features.length;
    // #stat-states is filled in once MapVis resolves states for the
    // current feature set — see the "statesResolved" binding below.
}

// MapVis resolves ANCHOR sites to states via point-in-polygon against
// real state boundaries (more reliable than the sparsely-filled "what
// state" survey field) and fires this whenever that resolution
// (re)runs — on initial load and on every filter change.
eventHandler.bind("statesResolved", function (event) {
    document.getElementById("stat-states").textContent =
        event.detail.states.size;
});

// MapVis fires this whenever the active filters change, with the
// current matching feature set — keeps acres/sites in sync with what's
// actually shown (at full opacity) on the map.
eventHandler.bind("filteredFeaturesChanged", function (event) {
    updateFooterStats(event.detail.features);
    announceFilterResult(event.detail.features.length);
});

// Says out loud what a filter change did.
//
// The map and the stat tiles both show the result, and neither reaches
// a person using a screen reader: the map is a canvas, and a number
// that changes on screen raises no event. This writes the result into
// a live region, which is read out as soon as it changes.
//
// Zero matches matters most. On screen an empty map is obvious. With
// no announcement it is silence, which reads as "nothing happened".
function announceFilterResult(count) {
    const status = document.getElementById("filter-status");
    if (!status) return;

    status.textContent = count === 0
        ? "No ANCHOR sites match the selected filters."
        : `${count} ANCHOR site${count === 1 ? "" : "s"} match ` +
            `the selected filters.`;
}

//* HEADER FILTER DROPDOWNS *//
//
// Desktop's 3 dropdowns and the mobile accordion (see MOBILE FILTERS
// below) are separate DOM trees showing the same underlying filter
// state, so a selection made in one stays visible if the window is
// later resized past the breakpoint. Every checkbox that represents a
// real filter (not the Layers panel, which reuses the same
// .filter-group__option styling) carries a shared .filter-checkbox
// class, which is what lets the helpers below treat both trees as one
// pool of controls without caring which layout is currently visible.

// Copies a checkbox's checked state onto its counterpart(s) elsewhere
// in the DOM (values are unique across all 3 filter categories, so
// matching on value alone is enough — no need to also match category).
function mirrorFilterCheckbox(checkbox) {
    document
        .querySelectorAll(
            `.filter-checkbox[value="${CSS.escape(checkbox.value)}"]`,
        )
        .forEach((twin) => {
            twin.checked = checkbox.checked;
        });
}

// Distinct selected values across all 3 categories (dedupes the
// desktop/mobile mirrored pairs automatically, since it counts values
// rather than checked elements).
function countActiveFilters() {
    return new Set(
        Array.from(document.querySelectorAll(".filter-checkbox:checked"))
            .map((c) => c.value),
    ).size;
}

// Per-category default text, shown when nothing's selected — matches
// the initial value baked into each dropdown's markup in index.html.
const FILTER_DEFAULT_TEXT = {
    "owner-filter": "All Owners",
    "landcover-filter": "All Types",
    "practices-filter": "All Practices",
};

// Updates one desktop dropdown's button text ("All Owners" /
// "Public" / "Public +2"). filterId matches a .filter-group's id
// (e.g. "owner-filter") and doubles as the filtersChanged event id.
function updateDesktopFilterLabel(filterId, values) {
    const group = document.getElementById(filterId);
    if (!group) return;
    const valueLabel = group.querySelector(".filter-group__value");

    if (values.length === 0) {
        valueLabel.textContent = FILTER_DEFAULT_TEXT[filterId];
    } else {
        const firstOption = group
            .querySelector(`.filter-checkbox[value="${CSS.escape(values[0])}"]`)
            .closest(".filter-group__option")
            .textContent.trim();
        valueLabel.textContent = values.length === 1
            ? firstOption
            : `${firstOption} +${values.length - 1}`;
    }
}

// Updates the mobile accordion's single button text with a total
// count across all 3 categories, since it has no per-category button
// of its own to show a category-specific value in.
function updateMobileFiltersSummary() {
    const valueLabel = document.querySelector(".mobile-filters__value");
    if (!valueLabel) return;
    const count = countActiveFilters();
    valueLabel.textContent = count === 0
        ? "All Filters"
        : `${count} Filter${count === 1 ? "" : "s"} Active`;
}

// Enable/disable the shared #clear-filters-btn (same physical button,
// repositioned by CSS on mobile — see the MOBILE (<=900px) block in
// style.css).
function updateClearButtonState() {
    document.getElementById("clear-filters-btn").disabled =
        countActiveFilters() === 0;
}

// Unchecks every filter checkbox (both layouts), resets both layouts'
// button text, and dispatches filtersChanged with an empty selection
// for all 3 categories.
function clearAllFilters() {
    document.querySelectorAll(".filter-checkbox").forEach((checkbox) => {
        checkbox.checked = false;
    });

    ["owner-filter", "landcover-filter", "practices-filter"].forEach(
        (filterId) => {
            updateDesktopFilterLabel(filterId, []);
            eventHandler.trigger("filtersChanged", { id: filterId, values: [] });
        },
    );

    updateMobileFiltersSummary();
    updateClearButtonState();
}

// Wire up open/close + multi-select behavior for the header filter dropdowns.
// Dispatches a "filtersChanged" event (detail: {id, values}) that map.js
// binds to (see MapVis.initVis) to actually filter the map.
function initHeaderFilters() {
    const filterGroups = document.querySelectorAll(".filter-group");
    const clearBtn = document.getElementById("clear-filters-btn");

    function closeAllPanels() {
        filterGroups.forEach((group) => {
            group.querySelector(".filter-group__panel").hidden = true;
            group
                .querySelector(".filter-group__toggle")
                .setAttribute("aria-expanded", "false");
        });
    }

    filterGroups.forEach((group) => {
        const toggle = group.querySelector(".filter-group__toggle");
        const panel = group.querySelector(".filter-group__panel");
        const checkboxes = group.querySelectorAll(".filter-checkbox");

        toggle.addEventListener("click", () => {
            const isOpen = toggle.getAttribute("aria-expanded") === "true";
            closeAllPanels();
            if (!isOpen) {
                panel.hidden = false;
                toggle.setAttribute("aria-expanded", "true");
            }
        });

        checkboxes.forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                mirrorFilterCheckbox(checkbox);

                const values = Array.from(checkboxes)
                    .filter((c) => c.checked)
                    .map((c) => c.value);

                updateDesktopFilterLabel(group.id, values);
                updateMobileFiltersSummary();
                updateClearButtonState();

                eventHandler.trigger("filtersChanged", {
                    id: group.id,
                    values,
                });
            });
        });
    });

    clearBtn.addEventListener("click", () => {
        clearAllFilters();
        closeAllPanels();
    });

    // Close any open panel when clicking outside of it
    document.addEventListener("click", (event) => {
        if (!event.target.closest(".filter-group")) {
            closeAllPanels();
        }
    });

    // Close any open panel on Escape
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeAllPanels();
        }
    });
}

document.addEventListener("DOMContentLoaded", initHeaderFilters);

//* MOBILE FILTERS *//

// Mobile's equivalent of the 3 header dropdowns, collapsed into one
// button + one panel (see the mobile media query in style.css). The 3
// categories become accordion subsections inside that single panel
// instead of independent dropdowns — one open at a time, closing the
// others — since there's no room on a phone width for 3 separate
// floating panels. Checkbox values/handling mirror initHeaderFilters
// exactly; see mirrorFilterCheckbox for how the two stay in sync.
function initMobileFilters() {
    const container = document.getElementById("mobile-filters");
    const toggle = document.getElementById("mobile-filters-toggle");
    const panel = document.getElementById("mobile-filters-panel");
    const groups = container.querySelectorAll(".mobile-filters__group");

    function closePanel() {
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
    }

    function closeAllGroups() {
        groups.forEach((group) => {
            group.querySelector(".mobile-filters__group-panel").hidden = true;
            group
                .querySelector(".mobile-filters__group-toggle")
                .setAttribute("aria-expanded", "false");
        });
    }

    toggle.addEventListener("click", () => {
        const isOpen = toggle.getAttribute("aria-expanded") === "true";
        closePanel();
        if (!isOpen) {
            panel.hidden = false;
            toggle.setAttribute("aria-expanded", "true");
        }
    });

    groups.forEach((group) => {
        const groupToggle = group.querySelector(
            ".mobile-filters__group-toggle",
        );
        const groupPanel = group.querySelector(".mobile-filters__group-panel");
        const filterId = group.dataset.filterId;
        const checkboxes = group.querySelectorAll(".filter-checkbox");

        groupToggle.addEventListener("click", () => {
            const isOpen = groupToggle.getAttribute("aria-expanded") === "true";
            closeAllGroups();
            if (!isOpen) {
                groupPanel.hidden = false;
                groupToggle.setAttribute("aria-expanded", "true");
            }
        });

        checkboxes.forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                mirrorFilterCheckbox(checkbox);

                const values = Array.from(checkboxes)
                    .filter((c) => c.checked)
                    .map((c) => c.value);

                updateDesktopFilterLabel(filterId, values);
                updateMobileFiltersSummary();
                updateClearButtonState();

                eventHandler.trigger("filtersChanged", { id: filterId, values });
            });
        });
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest("#mobile-filters")) {
            closePanel();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closePanel();
        }
    });

    updateMobileFiltersSummary();
}

document.addEventListener("DOMContentLoaded", initMobileFilters);

//* LEARN MORE DRAWER *//

// Click toggles the (CSS-transitioned) drawer open/closed; clicking
// outside containerSelector or pressing Escape closes it.
function initDrawerToggle(toggleId, drawerId, containerSelector) {
    const toggle = document.getElementById(toggleId);
    const drawer = document.getElementById(drawerId);
    const closeBtn = drawer.querySelector(".drawer__close");
    const drawerHome = drawer.parentElement; // .learn-more — for restoring on desktop

    // iOS Safari has a known bug where position:fixed descendants of
    // an overflow:hidden ancestor (.main, needed for the map canvas)
    // don't reliably escape that ancestor's clipping on a real device
    // — even though desktop browsers, including a manually resized
    // window, render it correctly per spec. Rather than fight that
    // with more CSS, this moves the drawer to be a direct child of
    // <body> while mobile, sidestepping the ambiguity entirely (the
    // same technique most modal/portal libraries use). Restored back
    // inside .learn-more at desktop width, where its position:absolute
    // needs that ancestor to resolve against.
    function relocateDrawerForViewport() {
        const isMobile = getComputedStyle(drawer).position === "fixed";
        if (isMobile && drawer.parentElement !== document.body) {
            document.body.appendChild(drawer);
        } else if (!isMobile && drawer.parentElement !== drawerHome) {
            drawerHome.appendChild(drawer);
        }
    }

    // On mobile the drawer is position:fixed (see style.css) and
    // horizontally centered by CSS alone, but still needs to sit just
    // below the toggle button vertically — computed here from the
    // button's actual on-screen position rather than hardcoded, since
    // the topbar's height varies with how the tagline wraps. No-op on
    // desktop, where the drawer stays position:absolute and CSS alone
    // already positions it correctly relative to the button.
    function positionDrawerBelowToggle() {
        if (getComputedStyle(drawer).position !== "fixed") return;
        const rect = toggle.getBoundingClientRect();
        drawer.style.top = `${rect.bottom + 6}px`;
    }

    function closeDrawer() {
        drawer.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", () => {
        relocateDrawerForViewport();
        const isOpen = drawer.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", isOpen);
        if (isOpen) positionDrawerBelowToggle();
    });

    // Recompute if the viewport is resized/rotated while open, since
    // the button's position can shift (e.g. topbar reflow on rotate)
    // and mobile<->desktop can flip mid-session (e.g. rotating a
    // tablet across the 1000px breakpoint).
    window.addEventListener("resize", () => {
        relocateDrawerForViewport();
        if (drawer.classList.contains("is-open")) positionDrawerBelowToggle();
    });

    closeBtn.addEventListener("click", closeDrawer);

    // Checks both containerSelector (the toggle button) and the
    // drawer's own id — the drawer may currently live outside
    // containerSelector's subtree (see relocateDrawerForViewport).
    document.addEventListener("click", (event) => {
        if (
            !event.target.closest(containerSelector) &&
            !event.target.closest(`#${drawerId}`)
        ) {
            closeDrawer();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeDrawer();
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initDrawerToggle("learn-more-btn", "learn-more-drawer", ".learn-more");
});

//* LAYERS PANEL *//

// Same hidden-attribute open/close pattern as the header filter
// dropdowns, since it's styled to match them exactly.
function initLayersPanel() {
    const container = document.querySelector(".layers-toggle");
    const toggle = document.getElementById("toggle-layers-btn");
    const panel = document.getElementById("layers-panel");
    const clearBtn = document.getElementById("clear-layers-btn");

    // Build one option per layer that has a source (see js/layers.js).
    // A layer with no source is not offered, and if that leaves no
    // options at all the whole control goes away. A button that does
    // nothing is worse than no button.
    const layers = availableMapLayers();

    if (layers.length === 0) {
        container.hidden = true;
        return;
    }

    layers.forEach((layer) => {
        const option = document.createElement("label");
        option.className = "filter-group__option";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = layer.id;

        checkbox.addEventListener("change", () => {
            if (myMapVis) myMapVis.setOverlayLayer(layer.id, checkbox.checked);
        });

        option.append(checkbox, ` ${layer.label}`);
        panel.append(option);
    });

    function closePanel() {
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
    }

    // Clearing has to turn the layers off as well, not only clear the
    // boxes. Setting `checked` in script does not raise a change event.
    clearBtn.addEventListener("click", () => {
        panel
            .querySelectorAll('input[type="checkbox"]')
            .forEach((checkbox) => {
                if (checkbox.checked && myMapVis) {
                    myMapVis.setOverlayLayer(checkbox.value, false);
                }
                checkbox.checked = false;
            });
    });

    toggle.addEventListener("click", () => {
        const isOpen = toggle.getAttribute("aria-expanded") === "true";
        closePanel();
        if (!isOpen) {
            panel.hidden = false;
            toggle.setAttribute("aria-expanded", "true");
        }
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".layers-toggle")) {
            closePanel();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closePanel();
        }
    });
}

document.addEventListener("DOMContentLoaded", initLayersPanel);
