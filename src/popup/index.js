import Icons from "./icons.js";
import { getAccessibleColor } from "./color.js";

//change bg color on trigger based on current theme
let textColor = await browser.theme.getCurrent().then((theme) => {
  const isDarkTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
  if (theme.colors) {
    document.body.style.backgroundColor = theme.colors.popup;
    return theme.colors.icons
  } else {
    if (isDarkTheme) {
      document.body.style.backgroundColor = "black"
      return "white"
    } else {
      document.body.style.backgroundColor = "white"
      return "black"
    }
  }
}).catch((error) => {
  //console.error("Error retrieving theme:", error);
});

let background;

const options = await browser.storage.local.get(['isLiveSeconds', 'showImg', 'showSettings']);
options.isLiveSeconds = options.isLiveSeconds || 360000
options.showImg = options.showImg ?? true;
options.showSettings = options.showSettings ?? true;

const $main = document.querySelector("main");

$main.innerHTML = `
<div id="settingsDiv" style="${options.showSettings ? "" : "display:none;"}">
  <button title="Settings" id="settings" style="color:${textColor}">
      ${Icons.settings}
  </button>
  <button title="Reload" id="reload" style="color:${textColor}">
      ${Icons.reload}
  </button>
  </div>
  `
$main.querySelector("#settings").onclick = () => {
  browser.runtime.openOptionsPage();
};
$main.querySelector("#reload").onclick = () => {
  browser.runtime.reload();
};


const $tab = (tab) => {
  if (!tab.media) {
    browser.tabs.executeScript(tab.id, { file: "../inject.js" });
  }

  tab.isSpotify = tab.hostname.includes("spotify");
  if (tab.isSpotify) {
    return createSpotifyTab(tab);
  } else {

    const $ = document.createElement("div");
    $.className = "tab";
    $.dataset.tid = tab.id;

    const isLive = tab.media?.duration > options.isLiveSeconds

    const color = getAccessibleColor(tab.color);
    $.style = `background-color: rgba(${tab.color.join(",")}); color: ${color};`
    $.innerHTML = `
  <div class="tab-meta" style="">
    <div class="tab-meta-info">
      <div class="tab-meta-info-url">
        <img src="${tab.favicon}" width="16px" height="16px" />
        <span>${tab.hostname} ${isLive ? "(live)" : ""}</span>
      </div>
      <div class="tab-meta-info-title">
        <span title="${tab.title}">${tab.title}</span>
      </div>
    </div>
    <div class="tab-meta-controls" style="visibility: ${tab.media === null ? "hidden" : "visible"};">
    <div class="tab-meta-controls-main">
      <button title="Seek Backward" class="control-backward" style="color: ${color};display: ${isLive && "none"}">
        ${Icons.backward}
      </button>
      <button title="${tab.media?.paused ? "Play" : "Pause"}" class="control-playpause" style="color: ${color};">
        ${tab.media?.paused ? Icons.play : Icons.pause}
      </button>
      <button title="Seek Forward" class="control-forward" style="color: ${color};display: ${isLive && "none"}">
        ${Icons.forward}
      </button>
      <button title="${"Loop: " + tab.media?.loop}" class="control-loop" style="color: ${color}; display: ${isLive && "none"}">
        ${tab.media?.loop ? Icons.loopFilled : Icons.loop}
      </button>
      </div>
      <div class="tab-meta-controls-second">
            <button title="${tab.media?.muted ? "Unmute" : "Mute"}" class="control-mute" style="color: ${color};">
        ${tab.media?.muted ? Icons.muted : Icons.unmuted}
      </button>
      <style>
      div.tab[data-tid="${tab.id}"] .control-volume::-moz-range-thumb {
        background: ${color};
        box-shadow: -100px 0 15px 96px ${color};
        border:0;
      }
      </style>
      <input type="range" min="0.00" max="1.00" value="${tab.media?.volume}" step="0.01" class="control-volume">
      </div>
      </div>
    <div class="tab-meta-life">
    <button title="Share" class="life-share" style="color: ${color};">
        ${Icons.link}
      </button>
      <button title="Remove from List" class="life-remove" style="color: ${color};">
        ${Icons.remove}
      </button>
      <button title="Close Tab" class="life-close" style="color: ${color};">
        ${Icons.close}
      </button>
    </div>
  </div>
  <div class="tab-thumbnail" style="${tab.thumbnail && options.showImg ? "" : "display:none;"}">
    ${tab.thumbnail ? `<img src="${tab.thumbnail}" />` : ""}
  </div>
  `;

    $.querySelector("div.tab-meta-info-title").onclick = () => {
      browser.tabs.update(tab.id, { active: true });
      browser.windows.update(tab.wid, { focused: true });
    };
    $.querySelector("button.control-playpause").onclick = () => {
      browser.tabs.executeScript(tab.id, {
        code: `
  (() => {
    const isSoundCloud = location.hostname.includes("soundcloud");
    const soundCloudButton = document.querySelector(".playControl");
    const media = window.$media || document.querySelector("audio, video");

    if (isSoundCloud && soundCloudButton) {
      soundCloudButton.click();
    } else if (media) {
      if (media.paused) {
        media.play();
      } else {
        media.pause();
      }
    }
  })();
        `,
      })
    };
    $.querySelector("button.control-loop").onclick = async () => {
      // trigger event on loop change
      await browser.tabs.executeScript(tab.id, {
        code: "document.querySelector('[mcx-media]').dispatchEvent(new Event('loopChanged'));"
      });
    };
    $.querySelector("button.control-backward").onclick = () => {
      browser.tabs.executeScript(tab.id, {
        code: "window.$media.fastSeek(Math.max(window.$media.currentTime-5, 0));",
      });
    };
    $.querySelector("button.control-forward").onclick = () => {
      browser.tabs.executeScript(tab.id, {
        code: "window.$media.fastSeek(window.$media.currentTime+5);",
      });
    };
    $.querySelector("button.control-mute").onclick = () => {
      browser.tabs.executeScript(tab.id, {
        code: "window.$media.muted = !window.$media.muted;",
      });
    };
    $.querySelector("input.control-volume").addEventListener('change', function (event) {
      browser.tabs.executeScript(tab.id, {
        code: `window.$media.volume=${event.target.value}
        if (window.$media.muted && ${event.target.value}> 0) {
          window.$media.muted = false;
        }`,
      })
    });
    $.querySelector("button.life-share").onclick = async () => {
      $main.scrollHeight < 250 ? $main.style.height = "250px" : null
      let [tabURL] = await browser.tabs.executeScript(tab.id, {
        code: "document.URL;",
      });
      navigator.clipboard.writeText(tabURL)
      $main.insertAdjacentHTML("afterbegin", `
      <div id='qrcode' 
      style="">
      <p>Link copied to your clipboard!</p>
      </div>
      `)
      new QRCode(document.getElementById('qrcode'), {
        text: tabURL,
        width: 128,
        height: 128,
        correctLevel: QRCode.CorrectLevel.L,
      });
    };
    $.querySelector("button.life-remove").onclick = () => {
      if (background.__tabs__.has(tab.id)) {
        background.unregister(tab.id);
      }
    };
    $.querySelector("button.life-close").onclick = () => {
      browser.tabs.remove(tab.id);
    };
    var slider = $.querySelector(".control-volume");
    slider.addEventListener("wheel", function (e) {
      if (e.deltaY < 0) {
        slider.valueAsNumber += 0.1;
      } else {
        slider.value -= 0.1;
      }
      e.preventDefault();
      e.stopPropagation();
      slider.dispatchEvent(new Event("change"))
    })
    return $;
  }
};

window["add"] = async function (tab) {
  if ($main.querySelector(`div[data-tid="${tab.id}"]`) === null) {
    $main.prepend($tab(tab));
  }
};

window["del"] = async function (tid) {
  $main.querySelector(`div[data-tid="${tid}"]`)?.remove();
  if ($main.querySelectorAll("div.tab").length === 0) {
    window.close(); // close popup when the only tab is removed
  }
};

window["update"] = async function (tab) {
  $main.querySelector(`div[data-tid="${tab.id}"]`)?.replaceWith($tab(tab));
};

(async () => {
  background = await browser.runtime.getBackgroundPage();
  const tabs = Array.from(background.__tabs__.values()).reverse();

  for (const tab of tabs) {
    window["add"](tab);
  }
})();


//spotify workaround part
function createSpotifyTab(tab) {

  const $ = document.createElement("div");
  $.className = "tab";
  $.dataset.tid = tab.id;

  const color = getAccessibleColor(tab.color);
  $.style = `background-color: rgba(${tab.color.join(",")}); color: ${color};`
  $.innerHTML = `
  <div class="tab-meta" style="">
    <div class="tab-meta-info">
      <div class="tab-meta-info-url">
        <img src="${tab.favicon}" width="16px" height="16px" />
        <span>${tab.hostname} (it's buggy)</span>
      </div>
      <div class="tab-meta-info-title">
        <span title="${tab.title}">${tab.title}</span>
      </div>
    </div>
    <div class="tab-meta-controls">
    <div class="tab-meta-controls-main">
      <button title="${tab.media?.paused ? "Play" : "Pause"}" class="control-playpause" style="color: ${color};">
        ${!tab.media?.paused ? Icons.play : Icons.pause}
      </button>
      <button title="${"Loop: " + tab.media?.loop}" class="control-loop" style="color: ${color};">
        ${tab.media?.loop ? Icons.loopFilled : Icons.loop}
      </button>
      </div>
      <div class="tab-meta-controls-second">
            <button title="${tab.media?.muted ? "Unmute" : "Mute"}" class="control-mute" style="color: ${color};">
        ${tab.media?.muted ? Icons.muted : Icons.unmuted}
      </button>
      <style>
      div.tab[data-tid="${tab.id}"] .control-volume::-moz-range-thumb {
        background: ${color};
        box-shadow: -100px 0 15px 96px ${color};
        border:0;
      }
      </style>
      <input type="range" min="0.00" max="1.00" value="${tab.media?.volume}" step="0.01" class="control-volume">
      </div>
      </div>
    <div class="tab-meta-life">
    <button title="Share" class="life-share" style="color: ${color};">
        ${Icons.link}
      </button>
      <button title="Remove from List" class="life-remove" style="color: ${color};">
        ${Icons.remove}
      </button>
      <button title="Close Tab" class="life-close" style="color: ${color};">
        ${Icons.close}
      </button>
    </div>
  </div>
  <div class="tab-thumbnail" style="${tab.thumbnail && options.showImg ? "" : "display:none;"}">
    ${tab.thumbnail ? `<img src="${tab.thumbnail}" />` : ""}
  </div>
  `;

  $.querySelector("div.tab-meta-info-title").onclick = () => {
    browser.tabs.update(tab.id, { active: true });
    browser.windows.update(tab.wid, { focused: true });
  };
  $.querySelector("button.control-playpause").onclick = async () => {
    browser.tabs.executeScript(tab.id, {
      code: `${tab.media.paused ? "window.$media.play();" : "window.$media.pause();"}`,
    });
    await browser.tabs.executeScript(tab.id, {
      code: `document.querySelector('button[data-testid="control-button-playpause"]').click()`,
    });
  }
  $.querySelector("button.control-loop").onclick = async () => {
    await browser.tabs.executeScript(tab.id, {
      code: `
        (async function() {
        const button = document.querySelector('button[data-testid="control-button-repeat"]');
        if (!button) return;

        let ariaChecked = button.getAttribute('aria-checked');
        const loopEnabled = ${tab.media.loop}

        let attempts = 0;
        const maxAttempts = 10;

        while (
        (loopEnabled && ariaChecked !== 'false') ||
        (!loopEnabled && ariaChecked !== 'mixed')
        ) {
        button.click();
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 200));
        ariaChecked = button.getAttribute('aria-checked');

        if (attempts >= maxAttempts) {
        break;
        }
        }
        })();
    `
    });
    await browser.tabs.executeScript(tab.id, {
      code: "document.querySelector('[mcx-media]').dispatchEvent(new Event('loopChanged'));"
    });
  };
  $.querySelector("button.control-mute").onclick = async () => {
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
  };
  $.querySelector("input.control-volume").addEventListener('change', function (event) {
    browser.tabs.executeScript(tab.id, {
      code: `
      (function(){
        const slider = document.querySelector("div[data-testid='volume-bar'] input[type='range']");
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

        nativeInputValueSetter.call(slider, ${event.target.value});
        slider.dispatchEvent(new Event('input', { bubbles: true }));

        window.$media.volume=${event.target.value}
        if (window.$media.muted && ${event.target.value}> 0) {
          nativeInputValueSetter.call(slider, ${event.target.value});
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          window.$media.muted = false;
        }
      })()
        `,
    })
  });
  $.querySelector("button.life-share").onclick = async () => {
    $main.scrollHeight < 250 ? $main.style.height = "250px" : null
    let [tabURL] = await browser.tabs.executeScript(tab.id, {
      code: "document.URL;",
    });
    navigator.clipboard.writeText(tabURL)
    $main.insertAdjacentHTML("afterbegin", `
      <div id='qrcode' 
      style="">
      <p>Link copied to your clipboard!</p>
      </div>
      `)
    new QRCode(document.getElementById('qrcode'), {
      text: tabURL,
      width: 128,
      height: 128,
      correctLevel: QRCode.CorrectLevel.L,
    });
  };
  $.querySelector("button.life-remove").onclick = () => {
    if (background.__tabs__.has(tab.id)) {
      background.unregister(tab.id);
    }
  };
  $.querySelector("button.life-close").onclick = () => {
    browser.tabs.remove(tab.id);
  };
  var slider = $.querySelector(".control-volume");
  slider.addEventListener("wheel", function (e) {
    if (e.deltaY < 0) {
      slider.valueAsNumber += 0.1;
    } else {
      slider.value -= 0.1;
    }
    e.preventDefault();
    e.stopPropagation();
    slider.dispatchEvent(new Event("change"))
  })
  return $;
}