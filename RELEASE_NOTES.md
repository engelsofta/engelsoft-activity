**Now with a face. Still knows what your lights did last night.**

Engelsoft Activity 0.1.18 introduces a new gold-and-olive house-and-pulse logo and fixes the missing icon under Settings → Devices & services.

The integration now bundles `brand/icon.png` (256 px) and `brand/icon@2x.png` (512 px) in the correct runtime folder. Both installation archives include these images, and packaging verifies their format and dimensions. Home Assistant falls back to the square icon when a separate wordmark is absent.

Update via HACS, or extract `Engelsoft-Activity-0.1.18.zip` into your HA configuration directory. Restart Home Assistant and fully reload the browser after updating so the new branding is discovered.

Branding is packaged and validated locally; its appearance in a running Home Assistant instance has not been verified as part of this release.