"""Native Home Assistant activity, presented by Engelsoft."""
from pathlib import Path
from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from .const import DOMAIN, PANEL, VERSION

async def async_setup(hass, config):
    """Initialize integration storage."""
    hass.data.setdefault(DOMAIN, {})
    return True

async def async_setup_entry(hass, entry):
    """Register the authenticated Activity panel."""
    bucket = hass.data.setdefault(DOMAIN, {})
    if not bucket.get("static_registered"):
        await hass.http.async_register_static_paths([
            StaticPathConfig(f"/{DOMAIN}/frontend", str(Path(__file__).parent / "frontend"), False)
        ])
        bucket["static_registered"] = True
    await panel_custom.async_register_panel(
        hass, frontend_url_path=PANEL,
        webcomponent_name="engelsoft-activity-panel",
        module_url=f"/{DOMAIN}/frontend/panel.js?v={VERSION}",
        sidebar_title="Activity", sidebar_icon="mdi:timeline-text-outline",
        require_admin=False, config_panel_domain=DOMAIN,
    )
    return True

async def async_unload_entry(hass, entry):
    """Remove the sidebar panel."""
    frontend.async_remove_panel(hass, PANEL)
    return True
