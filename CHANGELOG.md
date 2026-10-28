# Changelog

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
