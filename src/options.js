async function saveOptions(e) {
  e.preventDefault();
  await browser.storage.local.set({
    isLiveSeconds: document.querySelector("#isLiveSeconds").value,
    showImg: document.querySelector("#showImg").checked,
    showSettings: document.querySelector("#showSettings").checked
  });
}

async function restoreOptions() {
  const result = await browser.storage.local.get(['isLiveSeconds', 'showImg', 'showSettings']);
  document.querySelector("#isLiveSeconds").value = result.isLiveSeconds || 360000;
  document.querySelector("#showImg").checked = result.showImg ?? true;
  document.querySelector("#showSettings").checked = result.showSettings ?? true;
}

async function restoreDefaults() {
  await browser.storage.local.clear()
  restoreOptions()
}

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  document.querySelector("form").addEventListener("submit", saveOptions);
  document.querySelector("#reset").addEventListener("click", restoreDefaults);
  document.querySelector("#shortcuts").addEventListener("click", ()=>browser.commands.openShortcutSettings());

});

