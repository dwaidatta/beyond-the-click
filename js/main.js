/* =========================================================
   Page glue: checkbox <-> Game Boy console <-> game input
   ========================================================= */
(function () {
  "use strict";

  var game = window.SunfruitGame;

  var checkbox = document.getElementById("human-check");
  var verifyLabel = document.querySelector(".verify-checkbox");
  var statusEl = document.getElementById("verify-status");
  var overlay = document.getElementById("switch-overlay");
  var canvas = document.getElementById("game-canvas");
  var screenFrame = document.querySelector(".gb-screen-frame");
  var consoleEl = document.getElementById("gameboy-console");
  var hintEl = document.querySelector(".console-hint");
  var powerBtn = document.getElementById("power-switch");
  var selectBtn = document.getElementById("select-btn");
  var selectIcon = document.getElementById("select-icon");
  var startBtn = document.getElementById("start-btn");
  var previewCanvas = document.getElementById("preview-canvas");
  var bgmBtn = document.getElementById("bgm-toggle");
  var bgmIcon = document.getElementById("bgm-icon");

  var STATUS_DEFAULT = "Press to begin.";
  var STATUS_VERIFIED = "Verified — you're wonderfully human.";
  var MUTE_KEY = "sunfruit-muted";

  var music = game.music;
  var muted = false;
  var verified = false;
  var pausedByTab = false;

  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) {}

  game.init(canvas);
  game.onVerified = function () {
    verified = true;
    checkbox.checked = true;
    statusEl.textContent = STATUS_VERIFIED;
    setTimeout(closeConsole, 3400);
  };

  /* -------------------- sound & background music --------------------
     One switch drives both the SFX and the music loop, and both
     buttons that flip it. Browsers refuse to start audio before a
     user gesture, so the loop arms itself on the first interaction
     anywhere on the page and the choice is remembered from there. */
  function syncSound() {
    game.setMuted(muted);
    selectIcon.className = muted ? "bi bi-volume-mute-fill" : "bi bi-volume-up-fill";
    if (bgmIcon) bgmIcon.className = muted ? "bi bi-volume-mute-fill" : "bi bi-music-note-beamed";
    if (bgmBtn) {
      bgmBtn.classList.toggle("is-muted", muted);
      bgmBtn.setAttribute("aria-pressed", muted ? "false" : "true");
      bgmBtn.setAttribute("aria-label", muted ? "Turn music on" : "Turn music off");
    }
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e) {}
  }

  function setMuted(next) {
    muted = next;
    syncSound();
    if (!muted) music.start();
  }

  function armAudio() {
    game.unlockAudio();
    if (!muted) music.start();
  }
  document.addEventListener("pointerdown", armAudio);
  document.addEventListener("keydown", armAudio);

  // never leave music playing in a tab nobody is looking at
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (music.isPlaying()) { pausedByTab = true; music.stop(0.25); }
    } else if (pausedByTab) {
      pausedByTab = false;
      if (!muted) music.start();
    }
  });

  if (bgmBtn) {
    bgmBtn.addEventListener("click", function () { setMuted(!muted); });
  }
  syncSound();

  /* -------------------- fitting the hardware to the viewport --------------------
     Every dimension inside .gameboy is expressed in `em` of the
     custom property --gbu, so the whole shell has one fixed aspect
     ratio. Measure it once at a known unit, then pick the largest
     unit that still fits the viewport: the console always lands
     fully on screen, never scrolls, and never gets cropped.      */
  var BASE_U = 10;
  var GAP_X = 14, GAP_Y = 14;

  function fitConsole() {
    if (!consoleEl || overlay.hidden) return;
    consoleEl.style.setProperty("--gbu", BASE_U + "px");
    // offsetWidth/Height, not getBoundingClientRect: the shell animates in
    // with a scale() transform and the rect would be measured mid-pop.
    var wPerU = consoleEl.offsetWidth / BASE_U;
    var hPerU = consoleEl.offsetHeight / BASE_U;
    if (!wPerU || !hPerU) return;

    var hintH = hintEl ? hintEl.offsetHeight + 10 : 0;
    var availW = overlay.clientWidth - GAP_X * 2;
    var availH = overlay.clientHeight - GAP_Y * 2 - hintH;
    var u = Math.min(availW / wPerU, availH / hPerU);
    u = Math.max(4.5, Math.min(u, 26));

    consoleEl.style.setProperty("--gbu", u + "px");
    fitCanvas();
  }

  /* The screen frame is locked to 320:288, so the canvas can simply
     fill it edge to edge. Its backing store is sized in real device
     pixels and the game scales its 320x288 world onto that — full
     bleed, no letterbox, no blurry upscale. */
  function fitCanvas() {
    if (!screenFrame) return;
    var cssW = screenFrame.offsetWidth;   // layout width, ignoring the pop transform
    if (!cssW) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var w = Math.max(320, Math.round(cssW * dpr));
    var h = Math.round(w * 288 / 320);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    game.setViewport(w, h);
  }

  window.addEventListener("resize", fitConsole);
  window.addEventListener("orientationchange", fitConsole);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitConsole);

  /* -------------------- open / close -------------------- */
  function openConsole() {
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    fitConsole();
    requestAnimationFrame(fitConsole);
    game.unlockAudio();
    music.start();                 // in case nothing else armed it yet
    music.setMode("quest");        // same loop, drums and lead join in
    game.start();
  }

  function closeConsole() {
    overlay.hidden = true;
    document.body.style.overflow = "";
    music.setMode("calm");
    game.stop();
  }

  /* -------------------- the checkbox --------------------
     The box is never toggled by the browser: every activation is
     intercepted and `checked` is only ever set from JS once the
     quest is actually finished.                                */
  function activateCheckbox() {
    if (!verified) {
      openConsole();
      return;
    }
    verified = false;
    checkbox.checked = false;
    game.reset();
    statusEl.textContent = STATUS_DEFAULT;
  }

  verifyLabel.addEventListener("click", function (e) {
    e.preventDefault();
    activateCheckbox();
  });

  checkbox.addEventListener("keydown", function (e) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      activateCheckbox();
    }
  });

  // belt and braces: nothing the user does may toggle the box directly
  checkbox.addEventListener("click", function (e) { e.preventDefault(); });

  powerBtn.addEventListener("click", closeConsole);

  overlay.addEventListener("mousedown", function (e) {
    if (e.target === overlay) closeConsole();
  });

  document.addEventListener("keydown", function (e) {
    if (overlay.hidden) return;
    if (e.key === "Escape") { closeConsole(); return; }
    handleKey(e.key, true, e);
  });
  document.addEventListener("keyup", function (e) {
    if (overlay.hidden) return;
    handleKey(e.key, false, e);
  });

  var KEY_DIR = {
    ArrowUp: "up", w: "up", W: "up",
    ArrowDown: "down", s: "down", S: "down",
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right"
  };
  var KEY_ACTION = { " ": 1, Enter: 1, z: 1, Z: 1 };

  function handleKey(key, down, e) {
    if (KEY_DIR[key]) {
      e.preventDefault();
      game.input[KEY_DIR[key]] = down;
    } else if (KEY_ACTION[key]) {
      e.preventDefault();
      if (down && !e.repeat) game.pressAction();
    }
  }

  /* -------------------- touch / pointer controls -------------------- */
  function bindHold(el, onDown, onUp) {
    var active = false;
    function down(e) {
      e.preventDefault();
      if (active) return;
      active = true;
      el.classList.add("pressed");
      onDown();
    }
    function up() {
      if (!active) return;
      active = false;
      el.classList.remove("pressed");
      if (onUp) onUp();
    }
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  Array.prototype.forEach.call(document.querySelectorAll(".dpad-btn[data-dir]"), function (btn) {
    var dir = btn.getAttribute("data-dir");
    bindHold(btn,
      function () { game.input[dir] = true; },
      function () { game.input[dir] = false; }
    );
  });

  Array.prototype.forEach.call(document.querySelectorAll(".round-btn"), function (btn) {
    bindHold(btn, function () { game.pressAction(); }, null);
  });

  canvas.addEventListener("pointerdown", function () { game.pressAction(); });

  /* -------------------- select / start -------------------- */
  selectBtn.addEventListener("click", function () {
    setMuted(!muted);
  });

  startBtn.addEventListener("click", function () {
    game.reset();
  });

  /* -------------------- landing page teaser screen -------------------- */
  if (previewCanvas) {
    var pctx = previewCanvas.getContext("2d");
    var pW = 0, pH = 0;

    function fitPreview() {
      // offsetWidth/Height, not getBoundingClientRect: the teaser screen sits
      // at a slight tilt and the rect would report the rotated bounding box.
      pW = previewCanvas.offsetWidth || 150;
      pH = previewCanvas.offsetHeight || 150;
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      previewCanvas.width = Math.round(pW * dpr);
      previewCanvas.height = Math.round(pH * dpr);
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.imageSmoothingEnabled = false;
    }
    fitPreview();
    window.addEventListener("resize", fitPreview);

    var pt = 0;
    var pLast = performance.now();
    requestAnimationFrame(function previewLoop(ts) {
      var dt = Math.min(0.05, (ts - pLast) / 1000);
      pLast = ts;
      pt += dt * 1000;
      if (overlay.hidden) game.renderPreview(pctx, pt, pW, pH);
      requestAnimationFrame(previewLoop);
    });
  }
})();
