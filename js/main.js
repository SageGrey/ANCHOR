//* MAIN.JS *//

let myMapVis;

// dataLayerArray[0] — this index is relied on directly in map.js and export.js
let promises = [
    d3.json("data/ANCHOR_sites.geojson"),
];

Promise.all(promises)
    .then(function (data) {
        initMainPage(data);
    })
    .catch(function (err) {
        console.error(err);
    });

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
    updateFooterStats(dataArray[0].features);
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
});

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

// Updates one desktop dropdown's button text ("Dropdown" /
// "Public" / "Public +2"). filterId matches a .filter-group's id
// (e.g. "owner-filter") and doubles as the filtersChanged event id.
function updateDesktopFilterLabel(filterId, values) {
    const group = document.getElementById(filterId);
    if (!group) return;
    const valueLabel = group.querySelector(".filter-group__value");

    if (values.length === 0) {
        valueLabel.textContent = "Dropdown";
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

    function closeDrawer() {
        drawer.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", () => {
        const isOpen = drawer.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", isOpen);
    });

    closeBtn.addEventListener("click", closeDrawer);

    document.addEventListener("click", (event) => {
        if (!event.target.closest(containerSelector)) {
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
    const toggle = document.getElementById("toggle-layers-btn");
    const panel = document.getElementById("layers-panel");
    const clearBtn = document.getElementById("clear-layers-btn");

    function closePanel() {
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
    }

    clearBtn.addEventListener("click", () => {
        panel
            .querySelectorAll('input[type="checkbox"]')
            .forEach((checkbox) => {
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
