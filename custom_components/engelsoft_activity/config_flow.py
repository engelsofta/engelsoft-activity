"""Configure one Activity panel without duplicating entities."""
from homeassistant import config_entries
from .const import DOMAIN

class ActivityConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Set up Activity through the native integrations dialog."""
    VERSION = 1

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Engelsoft Activity", data={})
        return self.async_show_form(step_id="user")
