# Accessibility

## What is done

Branch `feature/accessibility-pass`.

An axe-core run against WCAG 2.1 level A and AA found four faults on
the prototype, two of them critical. Testing by keyboard found three
more that no automatic tool reports. All seven are fixed.

axe now reports nothing at 1440, 768 and 320 pixels wide.

### Fixed

| Fault | Level | Fix |
| --- | --- | --- |
| Four panels declared `role="listbox"` and held checkboxes | critical | They are groups, named by the label above each one |
| The export button had no name at all | critical | It says what it does |
| "of 50" had a contrast of 1.4 to 1 | serious | `--grey-500`, 4.5 to 1 |
| "No data recorded" had 4.48 to 1 against a 4.5 requirement | serious | `--grey-600`, 7.4 to 1 |
| The markers took no keyboard focus | — | Each is a button in reading order, with a name, opened by Enter or Space |
| Focus was lost when the details closed | — | Focus returns to the marker it came from; Escape closes |
| A filter change was silent | — | A live region states the number of matching sites |

## What is NOT done

**This is one automatic pass and one keyboard pass by a sighted
developer. It is not an audit.**

axe finds about a third of the faults that matter. It cannot judge
whether a name is useful, whether a reading order makes sense, or
whether a person can actually complete a task. Those need a person.

The following still needs doing.

### 1. Test with real assistive technology

Test with, at minimum:

- VoiceOver on macOS with Safari
- NVDA on Windows with Firefox
- VoiceOver on iOS with Safari

For each, complete these tasks with the screen reader alone:

1. Find out how many ANCHOR sites there are.
2. Filter to public sites only, and learn the result.
3. Open one site and read its acreage and its land cover.
4. Learn that a private site's position is approximate.
5. Turn the NLCD layer on.
6. Export the map.

Any task that cannot be finished is a fault, whatever axe says.

### 2. Judge the marker names

Every marker is now a button with a name. The names have not been
judged by a screen reader user.

Open questions:

- 29 markers in the tab order is a lot. Is a way to skip them needed?
- A cluster says "4 ANCHOR sites. Activate to zoom in and separate
  them." Is that clear without seeing the map?
- ", approximate location" is appended to a private site's name. Is
  that enough, or does it need explaining at that point?

### 3. The map has no text alternative

The map is the main content, and to a screen reader it is nothing. The
footer gives totals, and the filters give counts, but there is no way
to read the network as a list.

Consider a text alternative: a list of sites, grouped by state, giving
the name, ownership, acreage and land cover of each. It can be hidden
from view and reachable by a link at the top of the page. This would
be the largest single improvement left, and it is a real piece of work.

### 4. Zoom and reflow

WCAG 1.4.10 requires content to work at 400 percent zoom with no
two-directional scrolling. The layout was designed from 1440 down to
320 pixels wide, which is a good start, but 400 percent zoom is not
the same as a narrow window. Test it.

WCAG 1.4.4 requires text to resize to 200 percent. The layout uses
`rem` for type, which should hold, but the map controls are sized in
pixels. Test it.

### 5. Contrast of things that are not text

WCAG 1.4.11 requires 3 to 1 for a control's boundary and for a
graphic a reader needs to understand. Not yet checked:

- The navy markers against the beige basemap.
- The new dashed uncertainty circle, which is deliberately faint. It
  may be too faint to pass. If it is, it needs a stronger stroke.
- The grey faded markers against the basemap.
- The colours in the land cover bar chart in the details panel.

The chart is a particular worry. It carries meaning in colour alone.
It has a legend, which helps, but the segments have no other
difference between them. A pattern or a label may be needed.

### 6. Motion

The map animates when it moves to a site or opens a cluster. WCAG
2.3.3 asks that motion from an interaction can be turned off. Add a
`prefers-reduced-motion` rule that sets the animation duration to 0.
This is a small change and it is not made yet.

### 7. Colour is the only signal in places

- A faded marker means "does not match the filter". The only
  difference is colour.
- A selected marker means "its details are open". The only difference
  is colour.

Both need a second signal, for example a change of shape or an
outline.

## Suggested order

1. `prefers-reduced-motion` — small, and clearly needed.
2. Non-text contrast — measurement, then a decision.
3. Real assistive technology testing — this will find the real faults.
4. A text alternative for the map — the largest remaining piece.
5. A second signal beside colour for the marker states.

## Open questions

1. Which conformance level is the target? The work so far aims at AA.
   Confirm that is what the client needs.
2. Is there a legal requirement? A dashboard funded by a federal grant
   may fall under Section 508, which is stricter in places.
3. Who will do the audit? This needs somebody who uses assistive
   technology, not a developer running a tool.
4. Is a text alternative for the map wanted? It is the largest piece
   of work left and it is the one that most changes what a blind
   reader can do.
5. Is there a budget for testing with disabled users? An expert audit
   is good. Testing with users is better.
