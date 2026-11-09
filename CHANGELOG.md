# Changelog

## 1.1.0 — 2026-11-09

**Even your light switches have character arcs.**

- See the previous and new state together, such as “Aus → Ein”, whenever both are present in the loaded timeline.
- Spot outages, unknown states, alarms, and low batteries with a slim row marker and a short label. Use **Hinweise** to focus on these events.
- Read MQTT, Matter, and other sources in a dedicated column on wider screens.
- Find hidden entities in the **Ausgeblendet** dropdown. Search the list and restore one entity or all of them.
- Removed duplicate repository icons. The integration package still includes both icon sizes.

After updating, restart Home Assistant and reload the browser.

## 1.0.0 — 2026-11-07

**Your home has gossip. We brought a timeline.**

Engelsoft Activity 1.0.0 is the first Marketplace-focused release of an alternative to Home Assistant's built-in Activity view.

Requires Home Assistant 2026.11 or newer. Install through the Marketplace link in the README, add Engelsoft Activity under Settings → Devices & services, and open Activity in the sidebar. After updating an existing installation, restart Home Assistant and reload the browser.

### Changes

- Open with the last hour selected.
- Simplified search and time navigation, with room/entity filters and favorites in a second row.
- Entity types and integrations grouped under Further filters; active selections can be removed individually or cleared together.
- Hidden entities are managed through Insights, with controls shown only when needed.
- Uniform event rows, neutral status text and icons, subtle separators and a quieter list background. Faults retain red text.
- Row actions appear on hover or keyboard focus; selected favorites and touch controls stay visible.
- Short Shelly button labels; original messages remain in event details and exports.
- Wallpaper fills the viewport even with short or empty timelines; footer text removed.
- Concise Marketplace installation instructions, runtime-only release archives and automated validation.

The interface currently uses German labels. Setup supports English and German. Preview images use fictional data; the integration does not include household configuration or telemetry.


## 0.1.18 — 2026-10-28

**Now with a face. Still knows what your lights did last night.**

- Added a new gold-and-olive Activity logo combining a house with an event pulse.
- Fixed Home Assistant integration-card branding: PNG icons now ship inside `custom_components/engelsoft_activity/brand/`, rather than only at the repository root.
- Included 256 px and 512 px icons in both HACS and manual-installation archives.
- Package validation checks the brand images' PNG signatures and exact dimensions.
- Home Assistant uses the square icon as the logo fallback in both themes.

## 0.1.17 — 2026-10-28

**Your home spills the tea. The dashboard serves champagne.**

This release collects the local improvements since the first public release (0.1.8).

### Added

- Original, locally served light-mode wallpaper with glass curves, sage tones and champagne accents.
- Collapsible mobile filters with individually removable active-filter chips.
- Reproducible light-mode README screenshot using entirely fictional rooms, devices and events.

### Improved

- Pearl glass cards, softer shadows, finer separators and restrained status backgrounds.
- Larger event names, timestamps and secondary information, with status closer to event names on desktop.
- Gold histogram bars; counts appear on hover, keyboard focus or selection. Accessible labels retain exact counts.
- Clearer metric labels: “Im Zeitraum”, “Nach Filterung” and “Hinweis-Ereignisse”. Hint totals count historical events, not currently faulty devices.
- Reset is enabled and highlighted only when filters are active.
- Rounded search-field focus styling and a compact mobile header.

### Fixed

- Quiet filter with zero hidden entities no longer appears active.
- Live history uses the Home Assistant server clock when available and retries once after an invalid stream start time.

### Packaging and validation

- Runtime archives include the new light wallpaper; documentation screenshots remain excluded.
- Synthetic model and browser checks cover history, live updates, responsive layouts, filters, details, theme switching and the quiet-filter indicator.

## 0.1.8

First public release of Engelsoft Activity.

- Responsive local HA logbook panel with timeline and live updates.
- Searchable multiple selection for rooms, entity types, integrations and entities.
- Favorites, browser-local mute list, activity histogram and entity rankings.
- Historical context details, state-aware colors and CSV export.
- Recent-first loading, deduplication and finite history completion independent of the live stream.
- Loading indicator integrated into the header without a layout shift.
- Runtime-only release archives and tests using synthetic data.
