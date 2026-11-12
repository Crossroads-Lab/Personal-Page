import "./chat-input-form.js?v=8bef9bb6";
import "./starter-chips.js?v=8c20435c";
import "./quick-links.js?v=b0563e18";
import "./more.js?v=3601da1d";
import "./file-drop.js?v=dcf1269e";

// ?viewport prints what the viewport units actually resolve to on the
// device in hand. Nothing loads it otherwise. See scripts/viewport-probe.js.
if (location.search.includes("viewport")) import("./viewport-probe.js");

requestAnimationFrame(() => document.body.removeAttribute("loading"));
