"use strict"

// --------------------------------------------------------------------------
// Cached DOM references (queried once for performance & clarity)
// --------------------------------------------------------------------------

export const content = document.getElementById("content");

let userScrolling = false, scrollTop = 0;

// When the user scroll, especially when the chat content is being generated.
content.addEventListener("scroll", () => {
  const totalHeight = content.scrollHeight;       // Total content height
  const scrolledFromTop = content.scrollTop;      // Pixels hidden at top
  const visibleHeight = content.clientHeight;     // Visible height of box

  // Distance remaining to the bottom
  const distanceToBottom = totalHeight - scrolledFromTop - visibleHeight;

  // Logic: "If less than 20px from bottom, do something"
  if (distanceToBottom < 20 && scrollTop <= scrolledFromTop) {
    userScrolling = false;
  } else if (scrollTop && scrollTop > scrolledFromTop ) {
    userScrolling = true;
  }

  // Update scrollTop.
  scrollTop = scrolledFromTop;
});

// When the chat content changes.
export const onContentchange = () => {
  const length = content.childNodes.length;
  if (length) {
    // Get the top.
    let node = content.childNodes[0];
    const start = node.offsetTop;

    // Get the bottom.
    node = content.childNodes[length - 1];
    const end = node.offsetTop + node.offsetHeight;

    // Get the maximum width.
    let width = 0;
    for (let i = 0; i !== length; ++i) {
      width = Math.max(width, content.childNodes[i].offsetWidth);
    }

    // Get the content inside size, and its percentage.
    const height = end - start, threshold = content.offsetHeight * 0.4;
    const windowWidth = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
 
    // Blur background image if needed.
    if (height > threshold || (windowWidth < 1180 && width > Math.min(window.innerWidth - 500, 500))) {
      document.body.setAttribute("blured", "");
    } else {
      document.body.removeAttribute("blured");
    }

    // Smoothly scroll to the bottom
    userScrolling || content.scrollTo({
      top: content.scrollHeight,
      behavior: "smooth"
    });
  }
}

// Progressive text display.
export const displayTextContent = (text, container = content, delay) => {
  let i = 0, l = text.length, timeoutId;
  userScrolling = false, scrollTop = 0;
  (delay === undefined || delay === null) && (
    delay = Math.round(Math.max(200 - text.length, 0) * 0.20 + 5)
  );
  const breakTimeout = () => clearTimeout(timeoutId);
  const f = () => {
    container.innerHTML += text.charAt(i);
    requestAnimationFrame(() => (
      onContentchange(),
      ++i < l && (timeoutId = setTimeout(f, delay))
    ));
  }
  f();
  return breakTimeout;
}