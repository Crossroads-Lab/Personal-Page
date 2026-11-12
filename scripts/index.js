import "./chat-input-form.js?v=85065b53";
import "./starter-chips.js?v=ade16575";
import "./quick-links.js?v=b0563e18";
import "./more.js?v=49ca4bd3";
import "./file-drop.js?v=dcf1269e";

// ?viewport prints what the viewport units actually resolve to on the
// device in hand. Nothing loads it otherwise. See scripts/viewport-probe.js.
// Date.now() rather than a stamped version: the probe is the thing you
// reach for when you do not trust what the page is doing, and a cached
// copy of it answering an older question is the last thing you want.
if (location.search.includes("viewport")) import(`./viewport-probe.js?t=${Date.now()}`);

requestAnimationFrame(() => document.body.removeAttribute("loading"));
