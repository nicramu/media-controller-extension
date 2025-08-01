window.__tabs__ = new Map();

function applyPopupViews(func, args) {
  const views = browser.extension.getViews({ type: "popup" });
  for (const view of views) {
    view[func].apply(view, args);
  }
}

async function init(tab) {
  if (typeof tab === "number") {
    tab = await browser.tabs.get(tab);
  }

  const url = new URL(tab.url);
  const thumbnail = await (async () => {
    if (url.hostname.match(/^(www|music)\.youtube\.com$/)) {
      const vid = tab.url.match(/\/(?:watch\?v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/)?.[1];
      return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
    }

    if (url.hostname.includes("twitch")) {
      const [imgSrc] = await browser.tabs.executeScript(tab.id, {
        code: `
      (function() {
        const name = document.querySelector("h1")?.textContent?.trim();
        const img = Array.from(document.querySelectorAll("img.tw-image-avatar"))
          .find(el => el.alt?.trim() === name);
        return img?.src.replace("70x70","300x300") || null;
      })();
    `,
      });
      return imgSrc;
    }

    if (url.hostname.includes("soundcloud")) {
      const [imgSrc] = await browser.tabs.executeScript(tab.id, {
        code: `
        document.querySelector('.playControls span.sc-artwork-4x[aria-role="img"]')?.getAttribute("style").split('url("')[1]?.split('")')[0] || null;
    `,
      });
      return imgSrc;
    }

    if (url.hostname.includes("spotify")) {
      const [imgSrc] = await browser.tabs.executeScript(tab.id, {
        code: `
    document.querySelector('img[data-testid="cover-art-image"]').src
    `,
      });
      return imgSrc.replace("4851", "1e02");
    }


    return (
      await browser.tabs.executeScript(tab.id, {
        code: `document.querySelector("meta[property='og:image']")?.getAttribute("content");`,
      })
    )[0];
  })();

  const color = await (async (src) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        canvas.width = image.width;
        canvas.height = image.height;
        context.drawImage(image, 0, 0, 1, 1);
        resolve(context.getImageData(0, 0, 1, 1).data);
      };
      image.src = src;
    });
  })(thumbnail || tab.favIconUrl);

  return {
    id: tab.id,
    wid: tab.windowId,
    media: null,
    title: tab.title,
    favicon: tab.favIconUrl,
    hostname: url.hostname.replace("www.", ""),
    thumbnail,
    color,
  };
}

async function register(tid) {
  const tabInfo = await init(tid);
  window.__tabs__.set(tid, tabInfo);
  applyPopupViews("add", [tabInfo]);

  await browser.browserAction.enable();
  await browser.browserAction.setBadgeText({ text: String(window.__tabs__.size) });

  await browser.tabs.executeScript(tid, { file: "inject.js" });
  // await new Promise(r => setTimeout(r, 500)); // allow inject.js to finish
  await browser.tabs.executeScript(tid, { file: "hook.js" });
}

async function unregister(tid) {
  window.__tabs__.delete(tid);
  applyPopupViews("del", [tid]);
  const size = window.__tabs__.size;
  size === 0 && (await browser.browserAction.disable());
  await browser.browserAction.setBadgeText({
    text: size > 0 ? String(size) : null,
  });
  await browser.tabs.sendMessage(tid, "@unhook");
}

browser.browserAction.disable();
browser.browserAction.setBadgeTextColor({ color: "white" });
browser.browserAction.setBadgeBackgroundColor({ color: "gray" });

browser.tabs.query({ audible: true, status: "complete" }).then(async (tabs) => {
  for (const { id } of tabs) await register(id);
});

browser.tabs.onUpdated.addListener(
  async (tid, { audible }) => {
    if (audible && !window.__tabs__.has(tid)) await register(tid);
  },
  { properties: ["audible"] }
);

browser.tabs.onUpdated.addListener(
  async (tid, changeInfo) => {
    if (window.__tabs__.has(tid)) {
      await unregister(tid);
      await new Promise((r) => setTimeout(r, 4500));
      const tab = await browser.tabs.get(tid);
      if (tab.audible) await register(tid);
    }
  },
  { properties: ["url", "status"] }
);

browser.tabs.onUpdated.addListener(
  async (tid, changeInfo) => {
    if (window.__tabs__.has(tid)) {
      // 1. Update title
      const tabInfo = window.__tabs__.get(tid);
      tabInfo.title = changeInfo.title;

      // 2. Re-extract thumbnail and color
      const tab = await browser.tabs.get(tid);
      const newInfo = await init(tab); // reuse init to get fresh thumbnail & color

      // 3. Update stored tab info fields
      tabInfo.thumbnail = newInfo.thumbnail;
      tabInfo.color = newInfo.color;
      applyPopupViews("update", [tabInfo]);
    }
  },
  { properties: ["title"] }
);

browser.tabs.onUpdated.addListener(
  async (tid, { discarded }) => {
    if (discarded && window.__tabs__.has(tid)) {
      await unregister(tid);
    }
  },
  { properties: ["discarded"] }
);

browser.tabs.onRemoved.addListener(async (tid) => {
  if (window.__tabs__.has(tid)) await unregister(tid);
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  const tid = sender.tab?.id;
  const tab = window.__tabs__.get(tid);

  if (!tab) {
    // console.warn("Received message for unknown tab", tid);
    return;
  }
  // console.log("message of type", message.type)
  if (message.type === "@hook") {
    tab.media = message.media;
    // console.log(`media hooked for tab ${tid}:`, tab.media, tab.title);
  } else if (message.type === "play") {
    tab.media.paused = false;
  } else if (message.type === "pause") {
    tab.media.paused = true;
  } else if (message.type === "volumechange") {
    tab.media.volume = message.volume;
    tab.media.muted = message.volume === 0;
  } else if (message.type === "close_to_end") {
    if (tab.media.loop) {
      await browser.tabs.executeScript(tid, {
        code: "document.querySelector('[mcx-media]').currentTime = 0",
      });
    }
  } else if (message.type === "loopChanged") {
    tab.media.loop = message.loop;
  } else if (message.type === "durationchange") {
    //probably next song keep volume as set in UI
    await browser.tabs.executeScript(tid, {
      code: `document.querySelector('[mcx-media]').volume = ${tab.media.volume}`,
    });
  }

  applyPopupViews("update", [tab]);
});

browser.commands.onCommand.addListener((command) => {
  if (command === "open_popup") {
    browser.browserAction.openPopup();
  }
  if (command === "mute_all") {
    browser.tabs.query({ audible: true, status: "complete" }).then(async (tabs) => {
      for (const tab of tabs) {
        if (tab.url.includes("spotify")) {
          await browser.tabs.executeScript(tab.id, {
            code: `
        (function(){

        const slider = document.querySelector("div[data-testid='volume-bar'] input[type='range']");
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

        nativeInputValueSetter.call(slider, window.$media.muted ? window.$media.volume : 0);

        slider.dispatchEvent(new Event('input', { bubbles: true }));
        window.$media.muted = !window.$media.muted;
        })()
      `
          });
          continue
        }
        browser.tabs.executeScript(tab.id, {
          code: "window.$media && (window.$media.muted = !window.$media.muted)",
        });
      };
    });
  }
});
