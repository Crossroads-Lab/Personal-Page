"use strict"

import { content, displayTextContent } from "./content.js";
import { createThinkingNode } from "./createThinkingNode.js";
import { ask } from "./api.js";

// --------------------------------------------------------------------------
// Cached DOM references (queried once for performance & clarity)
// --------------------------------------------------------------------------

const input = document.getElementById("chat-input");
const form = document.getElementById("chat-input-form");
const chatContainer = document.getElementById("chat-input-container");
const menuButton = document.getElementById("chat-menu-button");
const leftActions = document.getElementById("chat-input-left-buttons");
const rightActions = document.getElementById("chat-input-right-buttons");
const share = document.getElementById("chat-menu-share-profile");

form.onclick =
  event => event.stopPropagation();

// In-flight request, so the stop button can actually cancel it rather than
// just hiding a response that still arrives and costs money.
let inFlight = null;

// Interrupt thinking.
const stopThinking = () => (
  document.body.removeAttribute("thinking"),
  content.innerHTML = "",
  typeof stopDisplay === "function" && stopDisplay()
);

// Start thinking.
const startThinking = text => (
  // Set the thinking state.
  document.body.setAttribute("thinking", ""),
  content.innerHTML = "",
  content.appendChild(createThinkingNode(text))
);

// Check if thinking.
const isThinking = () => document.body.hasAttribute("thinking");

// Stop current thinking.
document.getElementById("stop").onclick = event => {
  event.stopPropagation();

  inFlight?.abort();
  inFlight = null;
  stopThinking();
  stopDisplay = displayTextContent(
    "If there's anything else you want to know, ask away!",
    endDisplay,
    content.appendChild(document.createElement("span"))
  );
}

// Options toggle.
menuButton.onclick = event => {
  event.stopPropagation();
  chatContainer.hasAttribute("menu-visible", "") ?
    chatContainer.removeAttribute("menu-visible")
    : chatContainer.setAttribute("menu-visible", "");
}

document.body.onclick = 
form.onclick = () => {
  chatContainer.removeAttribute("menu-visible");
}

// Options buttons.
if (typeof navigator.share === "function") {
  share.onclick = event => {
    event.stopPropagation();
    navigator.share({
      title: "William Brendel's webpage",
      text: "View a summary of my professional experience, download my resume and connect on LinkedIn",
      url: window.location.href || document.URL || "william-brendel.com"
    });
  }
} else {
  share.style.display = "none";
}

// --------------------------------------------------------------------------
// Textarea resize + layout logic
// Handles:
// - enabling/disabling send button
// - switching to multiline layout
// - auto-growing textarea height
// --------------------------------------------------------------------------

const resize = () => {
  // Toggle "empty" state:
  // Send button should only activate when text or files exist
  input.value
    ? form.removeAttribute("empty")
    : form.setAttribute("empty", "");

  // Enable multiline layout if content exceeds one line
  input.scrollHeight > input.clientHeight &&
    form.classList.add("multiline");

  // Collapse back to single-line layout when text fits again
  (input.value.length * 12 <
    form.clientWidth -
    leftActions.clientWidth -
    rightActions.clientWidth -
    16) &&
    form.classList.remove("multiline");

  // Auto-resize textarea height to fit content
  input.style.height = "auto";                 // Reset first
  input.style.height = input.scrollHeight + "px"; // Then grow
};

// Resize dynamically while typing
input.addEventListener("input", resize);

// Re-evaluate layout on viewport resize (mobile rotation, etc.)
window.addEventListener("resize", resize);

// Initial layout sync after first paint
requestAnimationFrame(() => (
  input.setAttribute("rows", input.getAttribute("rows") || 1),
  resize()
));

// --------------------------------------------------------------------------
// Keyboard behavior
// Enter sends, Shift+Enter inserts newline
// --------------------------------------------------------------------------

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.dispatchEvent(new Event("submit"));
  }
});

// --------------------------------------------------------------------------
// Form submission handler
// --------------------------------------------------------------------------
let stopDisplay, endDisplay = () => stopDisplay = null;
form.addEventListener("submit", async event => {
  event.preventDefault();

  const message = input.value.trim();
  if (!message) return;

  resetForm();
  startThinking();

  const controller = new AbortController();
  inFlight = controller;

  const { text, followUps, aborted } = await ask(message, controller.signal);

  // The user hit stop, or started another question while this was running.
  // Either way this response is stale — the newer request owns the screen.
  if (aborted || inFlight !== controller) return;
  inFlight = null;
  if (!isThinking()) return;

  stopThinking();

  stopDisplay = displayTextContent(
    text,
    () => {
      endDisplay();
      renderFollowUps(followUps);
    },
    content.appendChild(document.createElement("span"))
  );
});

/**
 * Render follow-up questions as clickable prompts. Clicking one asks it,
 * which is the cheapest way to show a visitor what else the corpus covers.
 */
const renderFollowUps = (questions) => {
  if (!questions?.length) return;

  const list = document.createElement("div");
  list.className = "follow-ups";

  for (const question of questions) {
    const button = document.createElement("button");
    button.type = "button";
    // liquid-glass so a chip reads as the same material as the input bar,
    // which is where clicking one puts the question anyway.
    button.className = "follow-up liquid-glass";
    // textContent, not innerHTML — these strings come from the model.
    button.textContent = question;
    button.onclick = (event) => {
      event.stopPropagation();
      input.value = question;
      resize();
      form.dispatchEvent(new Event("submit"));
    };
    list.appendChild(button);
  }

  content.appendChild(list);
};

const resetForm = () => {
  // Reset input.
  input.value = "";
  resize();

  // Clear file state.
  form.setAttribute("empty", "");
}