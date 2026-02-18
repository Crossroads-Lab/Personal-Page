"use strict"

let node = null;

export const createThinkingNode = (text = "Thinking…") => (
  node || (
    (node = document.createElement("span")).innerHTML = `<span class=\"thinking-loader\"><b>●</b> ${text}</span>`
  ),
  node.cloneNode(true)
);