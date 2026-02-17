"use strict"

import { content, displayTextContent } from "./content.js";

// --------------------------------------------------------------------------
// Cached DOM references (queried once for performance & clarity)
// --------------------------------------------------------------------------

const input = document.getElementById("chat-input");
const form = document.getElementById("chat-input-form");
const chatContainer = document.getElementById("chat-input-container");
const optionsButton = document.getElementById("options");
const leftActions = document.getElementById("chat-input-left-buttons");
const rightActions = document.getElementById("chat-input-right-buttons");
const share = document.getElementById("chat-options-share-profile");

form.onclick =
  event => event.stopPropagation();

// Interrupt thinking.
const stopThinking = reset => {
  document.body.removeAttribute("thinking");
  content.innerHTML = "";
}

// Start thinking.
const startThinking = () => {
  // Set the thinking state.
  document.body.setAttribute("thinking", "");
  content.innerHTML = "<span class=\"pulse\"><b>●</b> Thinking…</span>";
}

// Stop current thinking.
document.getElementById("stop").onclick = () => {
  stopThinking();
  // More action to be defined below...
}

// Options toggle.
optionsButton.onclick = event => {
  event.stopPropagation();
  chatContainer.hasAttribute("options-on", "") ?
    chatContainer.removeAttribute("options-on")
    : chatContainer.setAttribute("options-on", "");
}

document.body.onclick = 
form.onclick = () => {
  chatContainer.removeAttribute("options-on");
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

form.addEventListener("submit", event => {
  event.preventDefault();

  const message = input.value.trim();

  if (message) {
    console.log("Sending message:", message);
    startThinking();

    // Simulate query.
    setTimeout(() => {
      // Reset form.
      resetForm();

      // Stop thinking.
      stopThinking();

      // Fill content.
      const dummyText = `When I was a PM at Snap, one of my engineers wanted to ship a “beauty score” based group AR filter. You’d take a selfie with your friends and it would put a crown on the most beautiful person in the shot. The tech was already built. I raised concerns due to risks for teens. Instead of blocking, I brought it to design for feedback, and later we repurpose the tech for ad targeting instead. We avoided a PR crisis and my engineer got promoted along the way.`;
      
      displayTextContent(
        dummyText,
        content.appendChild(document.createElement("span"))
      );
      
    }, 3000);
  }
});

const resetForm = () => {
  // Reset input.
  input.value = "";
  resize();

  // Clear file state.
  form.setAttribute("empty", "");
}