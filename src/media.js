(() => {
  //spotify has no video or audio element for media control. they use some fetch on the fly. we create here fake audio for UI control
  if (document.URL.includes("spotify")) {
    const audio = document.createElement('audio');
    document.body.appendChild(audio)
    audio.toggleAttribute("mcx-media", true);
    window.dispatchEvent(new Event("hook"));
    return;
  }

  if (document.querySelector("[mcx-media]") === null) {
    for (const $video of document.querySelectorAll("video")) {
      if (!$video.paused && !$video.muted) {
        $video.toggleAttribute("mcx-media", true);
        window.dispatchEvent(new Event("hook"));
        return;
      }
    }

    ["play", "pause"].forEach((method) => {
      const originalMethod = Audio.prototype[method];
      Audio.prototype[method] = function () {
        const value = originalMethod.apply(this, arguments);
        if (this.getAttribute("mcx-media") === null) {
          if (!document.contains(this)) {
            document.body.append(this);
          }
          this.toggleAttribute("mcx-media", true);
          window.dispatchEvent(new Event("hook"));
        }
        return value;
      };
    });
  }
})();
