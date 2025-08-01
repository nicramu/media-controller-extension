(() => {
  if (window.__mediaHooked) return;
  window.__mediaHooked = true;

  if (!window.listeners) {
    window.listeners = {};
    ["play", "pause", "volumechange", "loopChanged", "durationchange"].forEach((type) => {
      window.listeners[type] = async () => {
        const media = window.$media;
        if (!media) return;

        const message = { type };
        if (type === "volumechange") {
          message.volume = media.muted ? 0 : media.volume;
        }
        if (type === "loopChanged") {
          media.loop = !media.loop;
          message.loop = media.loop;
        }
        if (type === "durationchange") {
          //probably new song, change media volume to ui one in background.js
        }
        await browser.runtime.sendMessage(message);
      };
    });
  }
  hookMedia();

  async function waitForMedia(selector = "[mcx-media]", timeout = 5000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error("Timeout waiting for [mcx-media]"));
      }, timeout);
    });
  }


  async function hookMedia() {
    //console.log("hooking")
    try {
      unhookMedia();

      const media = await waitForMedia();
      window.$media = media;

      //console.log("adding listeners to:", media);
      for (const [type, listener] of Object.entries(window.listeners)) {
        if (typeof listener !== "function") {
          //console.warn(`listener for ${type} is not a function`, listener);
          continue;
        }
        media.addEventListener(type, listener);
      }

      media.addEventListener("timeupdate", onTimeUpdate);

      await browser.runtime.sendMessage({
        type: "@hook",
        media: {
          paused: media.paused,
          volume: media.volume,
          loop: media.loop,
          muted: media.muted,
          duration: media.duration,
        },
      });

      //console.log("media hooked:", media);
    } catch (err) {
      //console.error("error during hookMedia:", err);
    }
  }

  function unhookMedia() {
    const media = window.$media;
    if (!media) return;

    for (const [type, listener] of Object.entries(window.listeners)) {
      media.removeEventListener(type, listener);
    }
    media.removeEventListener("timeupdate", onTimeUpdate);
    media.removeAttribute("mcx-media");
    window.$media = null;

    //console.log("media unhooked");
  }

  function onTimeUpdate() {
    const media = window.$media;
    if (!media) return;
    const { currentTime, duration } = media;
    if (duration - currentTime <= 1) {
      browser.runtime.sendMessage({ type: "close_to_end", currentTime });
    }
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg === "@unhook") {
      unhookMedia();
      window.__mediaHooked = false;
    }
  });
})();