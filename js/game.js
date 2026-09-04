/* =========================================================
   SUNFRUIT QUEST
   A tiny pixel-art top-down adventure that powers the
   "verify you're human" checkbox. Pure canvas 2D, no assets.
   Exposes a small API on window.SunfruitGame.

   Internal resolution 320x288 = exactly 2x the original Game
   Boy's 160x144 (same 10:9 ratio), scaled up with CSS
   `image-rendering: pixelated` for a crisp retro look while
   staying legible.
   ========================================================= */
(function () {
  "use strict";

  var W = 320, H = 288;
  var GROUND_Y = 36;
  var PLAY_LEFT = 30, PLAY_RIGHT = W - 30;
  var PLAY_TOP = 46, PLAY_BOTTOM = H - 18;
  var ENTRY_Y = H - 30;
  var EXIT_Y = 56;
  var ATTACK_RANGE = 34; // reach of the wand swing

  var PAL = {
    skin: "#ffd9c2", skinShade: "#e8b593",
    hair: "#ff5fa8", hairShade: "#d63f8c", hairHi: "#ff9dc9",
    dress: "#8b4fc7", dressShade: "#5f2f96", dressHi: "#b07de8",
    stocking: "#4fe3ff", stockingShade: "#1fa8c9",
    shoe: "#2c2140",
    bag: "#e0a13d", bagShade: "#b9791f",
    scarf: "#4fe3ff", scarfShade: "#1fa8c9",
    wand: "#c9a15a", wandTip: "#fff7c2",
    eye: "#241433", eyeIris: "#7a45c9", brow: "#a0518c",
    blush: "#ff9fc7", petal: "#ffd7ea",
    slimeGreen: "#4be08f", slimeGreenShade: "#249a5b", slimeGreenHi: "#a8ffce",
    slimeBlue: "#5cc9ff", slimeBlueShade: "#1f86c9", slimeBlueHi: "#bdeeff",
    slimeRed: "#ff7a7a", slimeRedShade: "#c73e3e", slimeRedHi: "#ffc2c2",
    boss: "#c766ff", bossShade: "#7a2fce", bossHi: "#e8b8ff",
    gold: "#ffd23f", goldShade: "#e0a80f",
    leaf: "#4be08f",
    granHair: "#eef0f6", granShawl: "#e0567a", granShawlShade: "#b83a5a",
    shadow: "rgba(15,10,25,0.28)"
  };

  /* ---------------------------------------------------------
     Character art. The cast lives in assets/characters/ as pixel
     sprite sheets (one PNG per character, frames laid out left to
     right, every character standing on the bottom edge of its
     frame). assets/characters/build_sprites.py regenerates them.

     Each sheet is copied once into an offscreen canvas, which also
     gives us a white silhouette of it for hit flashes. Blits run
     with image smoothing off so the pixels stay hard-edged however
     far the console screen is scaled up.

     Until a sheet is ready — and if the files can't be fetched at
     all — every draw falls back to a neutral placeholder further
     down, so the game still plays and no half-loaded frame shows
     the wrong art.
  --------------------------------------------------------- */
  var ASSET_DIR = "assets/characters/";

  function Sheet(file, fw, fh, frames) {
    this.fw = fw; this.fh = fh; this.frames = frames;
    this.ready = false;
    this.sheet = null;
    this.flash = null;
    var self = this;
    var img = new Image();
    img.onload = function () { self.build(img); };
    img.src = ASSET_DIR + file;
  }

  Sheet.prototype.build = function (img) {
    var w = this.fw * this.frames, h = this.fh;
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var cx = c.getContext("2d");
    cx.imageSmoothingEnabled = false;
    try { cx.drawImage(img, 0, 0, w, h); } catch (e) { return; }

    // a pure-white silhouette of the same sheet, used for hit flashes
    var f = document.createElement("canvas");
    f.width = w; f.height = h;
    var fx = f.getContext("2d");
    fx.drawImage(c, 0, 0);
    fx.globalCompositeOperation = "source-in";
    fx.fillStyle = "#ffffff";
    fx.fillRect(0, 0, w, h);

    this.sheet = c;
    this.flash = f;
    this.ready = true;
  };

  /* cx = horizontal centre, baseY = the character's floor line */
  Sheet.prototype.draw = function (ctx, frame, cx, baseY, h, flash) {
    var src = flash ? this.flash : this.sheet;
    var w = h * (this.fw / this.fh);
    ctx.drawImage(src,
      frame * this.fw, 0, this.fw, this.fh,
      Math.round(cx - w / 2), Math.round(baseY - h), w, h);
  };

  var SPR = {
    hero:   new Sheet("hero.png", 40, 56, 4),
    granny: new Sheet("granny.png", 40, 56, 2),
    slimes: new Sheet("slimes.png", 28, 24, 3),
    boss:   new Sheet("boss.png", 48, 48, 1),
    fruit:  new Sheet("sunfruit.png", 28, 32, 1)
  };

  var HERO_H = 56;                 // heroine height in internal px
  var SLIME_FRAME = { green: 0, blue: 1, red: 2 };

  var STATE = {
    TITLE: "TITLE",
    DIALOGUE: "DIALOGUE",
    LEVEL_CARD: "LEVEL_CARD",
    PLAY: "PLAY",
    GAME_OVER: "GAME_OVER",
    RESULTS: "RESULTS",
    WIN: "WIN" // transient fallback between a finished dialogue and its follow-up state
  };

  /* ---------------------------------------------------------
     Level data — deliberately short: 2 mob screens + 1 boss.
     Player enters from the bottom and exits through the top,
     matching the "climb toward the summit" story beat.
  --------------------------------------------------------- */
  function makeLevels() {
    return [
      {
        name: "MEADOW OF BEGINNINGS",
        sky: ["#bdeaff", "#eafff3"],
        ground: "#8fe08a",
        groundShade: "#6fc46a",
        hillBack: "#6cc47f", hillFront: "#7ed48a",
        path: "#b8f0a8", tuft: "#6fc46a",
        deco: "flowers", ambient: "petals",
        monsters: [
          { type: "slime", color: "green", x: 110, y: 150, hp: 2, speed: 30 },
          { type: "slime", color: "green", x: 215, y: 190, hp: 2, speed: 34 }
        ]
      },
      {
        name: "WHISPERING WOODS",
        sky: ["#cbb6ff", "#7d5bd6"],
        ground: "#4f9a5b",
        groundShade: "#387543",
        hillBack: "#3d6f52", hillFront: "#468a58",
        path: "#6bb377", tuft: "#3f8a4c",
        deco: "trees", ambient: "fireflies",
        monsters: [
          { type: "slime", color: "blue", x: 95, y: 120, hp: 2, speed: 36 },
          { type: "slime", color: "red", x: 225, y: 150, hp: 2, speed: 40 },
          { type: "slime", color: "green", x: 160, y: 205, hp: 2, speed: 32 }
        ]
      },
      {
        name: "SUNPEAK SUMMIT",
        sky: ["#ffd6a5", "#ff8fb3"],
        ground: "#e0a15c",
        groundShade: "#b8793a",
        hillBack: "#b06a52", hillFront: "#c98a5c",
        path: "#f0c07f", tuft: "#c9954f",
        deco: "rocks", ambient: "motes",
        boss: { type: "boss", x: 160, y: 130, hp: 7, speed: 30 },
        fruitTree: { x: 160, y: 66 }
      }
    ];
  }

  /* ---------------------------------------------------------
     Tiny WebAudio SFX synth — no audio files needed.
  --------------------------------------------------------- */
  var Sound = (function () {
    var ctx = null, muted = false;
    function ensure() {
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { ctx = null; }
      }
      if (ctx && ctx.state === "suspended") ctx.resume();
    }
    function tone(freq, dur, type, vol, delay) {
      if (muted) return;
      ensure();
      if (!ctx) return;
      var t0 = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol || 0.12, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }
    return {
      unlock: ensure,
      setMuted: function (m) { muted = m; },
      blip: function () { tone(520, 0.06, "square", 0.08); },
      swing: function () { tone(300, 0.09, "sawtooth", 0.09); },
      hit: function () { tone(150, 0.08, "square", 0.12); },
      hurt: function () { tone(90, 0.18, "sawtooth", 0.14); },
      defeat: function () {
        tone(440, 0.07, "square", 0.1, 0);
        tone(330, 0.07, "square", 0.1, 0.07);
        tone(220, 0.1, "square", 0.1, 0.14);
      },
      gate: function () {
        tone(392, 0.09, "triangle", 0.1, 0);
        tone(523, 0.12, "triangle", 0.1, 0.09);
      },
      telegraph: function () { tone(220, 0.35, "sawtooth", 0.06); },
      gameOver: function () {
        [392, 330, 262, 196].forEach(function (f, i) {
          tone(f, 0.26, "triangle", 0.12, i * 0.18);
        });
      },
      win: function () {
        [523, 659, 784, 1046].forEach(function (f, i) {
          tone(f, 0.18, "square", 0.11, i * 0.14);
        });
      }
    };
  })();

  /* ---------------------------------------------------------
     Particles — a small pooled-free array used for hit sparks,
     death bursts, footstep dust and the win confetti.
  --------------------------------------------------------- */
  function makeParticles() {
    var list = [];
    return {
      spawn: function (x, y, count, opts) {
        opts = opts || {};
        for (var i = 0; i < count; i++) {
          var ang = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread || Math.PI * 2)
                                              : Math.random() * Math.PI * 2;
          var spd = (opts.minSpeed || 20) + Math.random() * (opts.speedRange || 40);
          list.push({
            x: x, y: y,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - (opts.lift || 0),
            gravity: opts.gravity === undefined ? 90 : opts.gravity,
            life: opts.life || 0.5, maxLife: opts.life || 0.5,
            size: (opts.size || 2) + Math.random() * (opts.sizeRange || 1),
            color: Array.isArray(opts.color) ? opts.color[(Math.random() * opts.color.length) | 0] : (opts.color || "#fff"),
            shape: opts.shape || "square"
          });
        }
      },
      update: function (dt) {
        for (var i = list.length - 1; i >= 0; i--) {
          var p = list[i];
          p.life -= dt;
          if (p.life <= 0) { list.splice(i, 1); continue; }
          p.vy += p.gravity * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      },
      render: function (ctx) {
        for (var i = 0; i < list.length; i++) {
          var p = list[i];
          var a = Math.max(0, p.life / p.maxLife);
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          var s = p.size * a + p.size * 0.3;
          if (p.shape === "circle") {
            ctx.beginPath();
            ctx.arc(p.x, p.y, s * 0.5, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
          }
        }
        ctx.globalAlpha = 1;
      },
      clear: function () { list.length = 0; }
    };
  }

  /* ---------------------------------------------------------
     Drawing helpers
  --------------------------------------------------------- */
  function skyGrad(ctx, colors) {
    var g = ctx.createLinearGradient(0, 0, 0, GROUND_Y + 40);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    return g;
  }

  function drawShadow(ctx, cx, cy, rx, ry) {
    ctx.fillStyle = PAL.shadow;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Drawn only in the moment before a sprite sheet has finished loading,
     or if the art is missing entirely: a neutral silhouette in roughly the
     right colours, so the game stays playable and nothing ever pops in
     wearing the wrong design. */
  function drawPlaceholder(ctx, cx, baseY, w, h, body, head) {
    drawShadow(ctx, cx, baseY, w * 0.55, w * 0.2);
    ctx.fillStyle = body;
    ctx.fillRect(cx - w / 2, baseY - h * 0.6, w, h * 0.6);
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(cx, baseY - h * 0.74, h * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBlob(ctx, cx, baseY, r, body, hi) {
    drawShadow(ctx, cx, baseY, r * 0.95, r * 0.3);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(cx, baseY - r * 0.8, r, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.32, baseY - r * 1.2, r * 0.26, r * 0.16, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------------------------------------------------------
     Sprite-backed cast. Each of these prefers its pixel sheet and
     falls back to the placeholder above until the sheet is ready.
  --------------------------------------------------------- */
  function heroFrame(walking, attacking, t) {
    if (attacking) return 3;
    if (!walking) return 0;
    var phase = Math.floor(t / 120) % 4;   // step, pass, step, pass
    return phase === 0 ? 1 : (phase === 2 ? 2 : 0);
  }

  function drawGirl(ctx, cx, cy, hFacing, walking, t, attacking, hurt, lungeAmt, scale) {
    scale = scale || 1;
    var lunge = attacking ? (lungeAmt || 0) : 0;

    if (!SPR.hero.ready) {
      drawPlaceholder(ctx, cx, cy, 20 * scale, HERO_H * scale, PAL.dress, PAL.skin);
      return;
    }

    drawShadow(ctx, cx, cy + 1, 9 * scale, 3 * scale);

    var bob = walking ? Math.abs(Math.sin(t * 0.012)) * -1.1 : Math.sin(t * 0.0032) * 0.7;
    ctx.save();
    ctx.translate(cx + (hFacing === "left" ? -lunge : lunge), cy + bob * scale);
    ctx.scale(hFacing === "left" ? -scale : scale, scale);
    if (hurt) ctx.rotate(Math.sin(t * 0.05) * 0.1);

    SPR.hero.draw(ctx, heroFrame(walking, attacking, t), 0, 0, HERO_H,
      hurt && Math.floor(t / 60) % 2 === 0);

    if (attacking) {
      var arcR = ATTACK_RANGE * 0.62;
      ctx.strokeStyle = "rgba(255,247,194,0.85)";
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(5, -28, arcR, -1.3, 0.8);
      ctx.stroke();
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(5, -28, arcR, -1.3, 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function slimePalette(name) {
    if (name === "blue") return { main: PAL.slimeBlue, hi: PAL.slimeBlueHi };
    if (name === "red") return { main: PAL.slimeRed, hi: PAL.slimeRedHi };
    return { main: PAL.slimeGreen, hi: PAL.slimeGreenHi };
  }

  function drawSlime(ctx, cx, cy, r, colorName, t, hurt) {
    if (!SPR.slimes.ready) {
      var c = slimePalette(colorName);
      drawBlob(ctx, cx, cy + r * 0.85, r, c.main, c.hi);
      return;
    }
    var base = cy + r * 0.85;
    drawShadow(ctx, cx, base, r * 0.95, r * 0.3);
    var squish = 1 + Math.sin(t * 0.006 + cx) * 0.08;
    ctx.save();
    ctx.translate(cx, base);
    ctx.scale(1 / squish, squish);
    SPR.slimes.draw(ctx, SLIME_FRAME[colorName] || 0, 0, 0, r * 2.6,
      hurt && Math.floor(t / 50) % 2 === 0);
    ctx.restore();
  }

  function drawBoss(ctx, cx, cy, r, t, hurt, telegraph) {
    if (!SPR.boss.ready) { drawBlob(ctx, cx, cy + r * 0.86, r, PAL.boss, PAL.bossHi); return; }
    var base = cy + r * 0.86;
    drawShadow(ctx, cx, base, r, r * 0.32);

    ctx.save();
    ctx.globalAlpha = telegraph ? (0.4 + Math.sin(t * 0.03) * 0.3) : 0.16;
    ctx.fillStyle = PAL.bossHi;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var squish = 1 + Math.sin(t * 0.005) * 0.05;
    ctx.save();
    ctx.translate(cx, base);
    ctx.scale(1 / squish, squish);
    SPR.boss.draw(ctx, 0, 0, 0, r * 2.5, hurt && Math.floor(t / 50) % 2 === 0);
    ctx.restore();
  }

  function drawFruit(ctx, cx, cy, t, particles, scale) {
    scale = scale || 1;
    if (!SPR.fruit.ready) { drawBlob(ctx, cx, cy + 12, 8 * scale, PAL.gold, "#fff7c2"); return; }
    var h = 30 * scale * (1 + Math.sin(t * 0.005) * 0.07);
    drawShadow(ctx, cx, cy + 12 * scale, 7 * scale, 2.4 * scale);
    SPR.fruit.draw(ctx, 0, cx, cy + h / 2, h, false);
    if (particles && Math.random() < 0.09) {
      particles.spawn(cx + (Math.random() - 0.5) * 16, cy + (Math.random() - 0.5) * 16, 1,
        { color: PAL.gold, life: 0.6, gravity: -10, minSpeed: 2, speedRange: 6, size: 1.4, shape: "circle" });
    }
  }

  function drawGranny(ctx, cx, cy, sick) {
    if (!SPR.granny.ready) {
      drawPlaceholder(ctx, cx, cy + 14, 18, 40, sick ? "#8fa79c" : PAL.granShawl, PAL.granHair);
      return;
    }
    drawShadow(ctx, cx, cy + 14, 9, 3);
    SPR.granny.draw(ctx, sick ? 0 : 1, cx, cy + 16, 54, false);
  }

  function drawDecoFlower(ctx, x, y, hue, t) {
    var sway = Math.sin(t * 0.0025 + x) * 1.2;
    ctx.strokeStyle = "#3a8a4a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + sway, y - 6);
    ctx.stroke();
    ctx.fillStyle = hue;
    ctx.beginPath();
    ctx.arc(x + sway, y - 7, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff7c2";
    ctx.beginPath();
    ctx.arc(x + sway, y - 7, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawDecoTree(ctx, x, y, t) {
    var sway = t !== undefined ? Math.sin(t * 0.0018 + x) * 1.4 : 0;
    ctx.fillStyle = "#3b2a1e";
    ctx.fillRect(x - 1.6, y - 6, 3.2, 9);
    ctx.fillStyle = "#2f6b3d";
    ctx.beginPath();
    ctx.moveTo(x - 10 + sway * 0.4, y - 6);
    ctx.lineTo(x + 10 + sway * 0.4, y - 6);
    ctx.lineTo(x + sway, y - 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#245030";
    ctx.beginPath();
    ctx.moveTo(x - 7.5 + sway * 0.6, y - 14);
    ctx.lineTo(x + 7.5 + sway * 0.6, y - 14);
    ctx.lineTo(x + sway, y - 27);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#4a9a5a";
    ctx.beginPath();
    ctx.ellipse(x - 2 + sway, y - 19, 2, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawGrassTuft(ctx, x, y, color, t) {
    var sway = Math.sin(t * 0.002 + x) * 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - 2.2 + sway, y - 5);
    ctx.moveTo(x, y); ctx.lineTo(x + sway * 0.6, y - 7.4);
    ctx.moveTo(x, y); ctx.lineTo(x + 2.4 + sway, y - 4.6);
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  /* Ground cover, scattered clear of the entry-to-exit path. */
  var TUFTS = [
    [46, 118], [92, 96], [126, 84], [198, 94], [244, 110], [286, 132],
    [62, 166], [104, 146], [214, 152], [266, 176], [40, 196], [84, 214],
    [124, 234], [198, 216], [240, 232], [288, 206], [56, 252], [136, 262],
    [230, 252], [292, 246], [74, 282], [190, 280], [262, 278], [110, 182],
    [136, 108], [186, 128], [232, 194], [38, 238]
  ];

  function drawDecoRock(ctx, x, y, s) {
    ctx.fillStyle = "#8a5a38";
    ctx.beginPath();
    ctx.ellipse(x - 1, y + 1, 5 * s, 2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a9744a";
    ctx.beginPath();
    ctx.ellipse(x, y, 5.6 * s, 3.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c99566";
    ctx.beginPath();
    ctx.ellipse(x - 1.6 * s, y - 1.2 * s, 1.8 * s, 1 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHills(ctx, back, front) {
    ctx.fillStyle = back;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 6);
    ctx.quadraticCurveTo(48, GROUND_Y - 22, 96, GROUND_Y + 4);
    ctx.quadraticCurveTo(150, GROUND_Y - 26, 208, GROUND_Y + 4);
    ctx.quadraticCurveTo(268, GROUND_Y - 20, W, GROUND_Y + 6);
    ctx.lineTo(W, GROUND_Y + 14);
    ctx.lineTo(0, GROUND_Y + 14);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = front;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 12);
    ctx.quadraticCurveTo(70, GROUND_Y - 8, 140, GROUND_Y + 12);
    ctx.quadraticCurveTo(220, GROUND_Y - 6, W, GROUND_Y + 12);
    ctx.lineTo(W, GROUND_Y + 20);
    ctx.lineTo(0, GROUND_Y + 20);
    ctx.closePath();
    ctx.fill();
  }

  function drawGate(ctx, x, y, open, t) {
    ctx.save();
    ctx.globalAlpha = open ? 1 : 0.35;
    ctx.fillStyle = "#6b5a8a";
    ctx.fillRect(x - 24, y - 4, 10, 26);
    ctx.fillRect(x + 14, y - 4, 10, 26);
    ctx.fillStyle = "#8877aa";
    ctx.beginPath();
    ctx.arc(x, y - 4, 24, Math.PI, 0);
    ctx.fill();
    if (open) {
      ctx.globalAlpha = 0.55 + Math.sin(t * 0.008) * 0.25;
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.ellipse(x, y + 8, 15, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------
     Text helpers
  --------------------------------------------------------- */
  function wrapText(ctx, text, maxWidth) {
    var words = text.split(" ");
    var lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var test = cur ? cur + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur);
        cur = words[i];
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /* ===========================================================
     Main game object
  =========================================================== */
  function Game() {
    this.canvas = null;
    this.ctx = null;
    this.running = false;
    this.raf = null;
    this.lastTs = 0;
    this.t = 0;

    this.input = { up: false, down: false, left: false, right: false };
    this.actionPressed = false;

    this.state = STATE.TITLE;
    this.levels = makeLevels();
    this.levelIndex = 0;
    this.level = null;

    this.player = null;
    this.monsters = [];
    this.gateOpen = false;
    this.fruitCollected = false;
    this.particles = makeParticles();
    this.shakeT = 0;
    this.shakeMag = 0;
    this.stepT = 0;
    this.ambientT = 0;

    this.dialogue = null; // {lines, index, onDone}
    this.levelCardTimer = 0;
    this.titleBob = 0;

    this.onVerified = null;
  }

  Game.prototype.init = function (canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.viewW = canvas.width || W;
    this.viewH = canvas.height || H;
  };

  /* The canvas backing store is sized to the console screen in real
     device pixels; the game keeps thinking in its own 320x288 space
     and render() scales the whole frame to fit exactly. Nothing is
     letterboxed and nothing is upscaled after the fact, so the screen
     stays crisp at any console size. */
  Game.prototype.setViewport = function (w, h) {
    this.viewW = w;
    this.viewH = h;
  };

  Game.prototype.setMuted = function (m) { Sound.setMuted(m); };
  Game.prototype.unlockAudio = function () { Sound.unlock(); };

  Game.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.lastTs = performance.now();
    var self = this;
    function loop(ts) {
      if (!self.running) return;
      var dt = Math.min(0.05, (ts - self.lastTs) / 1000);
      self.lastTs = ts;
      self.t += dt * 1000;
      self.update(dt);
      self.render();
      self.raf = requestAnimationFrame(loop);
    }
    this.raf = requestAnimationFrame(loop);
  };

  Game.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  };

  Game.prototype.reset = function () {
    this.state = STATE.TITLE;
    this.levelIndex = 0;
    this.fruitCollected = false;
    this.player = null;
    this.monsters = [];
    this.dialogue = null;
    this.particles.clear();
  };

  Game.prototype.pressAction = function () {
    this.actionPressed = true;
    Sound.unlock();
  };

  Game.prototype.shake = function (mag, dur) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, dur);
  };

  Game.prototype.showDialogue = function (lines, onDone) {
    this.state = STATE.DIALOGUE;
    this.dialogue = { lines: lines, index: 0, onDone: onDone };
  };

  Game.prototype.spawnLevel = function (index) {
    this.levelIndex = index;
    this.level = this.levels[index];
    var lives = this.level.boss ? 5 : 3; // the summit fight gets a bigger health bar
    this.player = {
      x: W / 2, y: ENTRY_Y,
      w: 12, h: 10,
      hp: lives, maxHp: lives,
      facing: "up", hFacing: "right",
      invuln: 0, attackTimer: 0, attackCd: 0,
      walking: false
    };
    this.monsters = (this.level.monsters || []).map(function (m) {
      return {
        type: "slime", color: m.color, x: m.x, y: m.y,
        hp: m.hp, maxHp: m.hp, speed: m.speed,
        r: 9, hurt: 0, dead: false, deadT: 0,
        wanderDir: Math.random() * Math.PI * 2, wanderT: 0
      };
    });
    if (this.level.boss) {
      var b = this.level.boss;
      this.monsters.push({
        type: "boss", x: b.x, y: b.y, hp: b.hp, maxHp: b.hp,
        speed: b.speed, r: 18, hurt: 0, dead: false, deadT: 0,
        wanderDir: 0, wanderT: 0,
        telegraphT: 2.5, dashT: 0
      });
    }
    this.gateOpen = false;
    this.fruitCollected = false;
    this.particles.clear();
    this.state = STATE.LEVEL_CARD;
    this.levelCardTimer = 1.6;
  };

  /* ------------------- story script ------------------- */
  Game.prototype.beginStory = function () {
    var self = this;
    Sound.unlock();
    this.showDialogue([
      { name: "GRANDMA", text: "Oh dearie... I haven't felt this weak in years.", who: "gran", home: true },
      { name: "YOU", text: "Don't worry, Gran! I'll fetch the Golden Sunfruit for you!", who: "girl", home: true },
      { name: "", text: "It grows atop Sunpeak, past meadow and forest...", who: "", home: true }
    ], function () { self.spawnLevel(0); });
  };

  Game.prototype.beginWin = function () {
    var self = this;
    Sound.win();
    this.shake(3, 0.4);
    this.showDialogue([
      { name: "YOU", text: "I found it! Hold on, Gran!", who: "girl" },
      { name: "GRANDMA", text: "You brave girl... I feel better already! Thank you!", who: "gran", home: true },
      { name: "", text: "VERIFICATION COMPLETE — you are wonderfully human.", who: "", home: true }
    ], function () {
      self.state = STATE.RESULTS;
      self.particles.clear();
      self.particles.spawn(W / 2, -10, 70, {
        color: [PAL.gold, PAL.hair, PAL.stocking, PAL.slimeGreen, "#ffffff"],
        angle: Math.PI / 2, spread: Math.PI * 0.9,
        minSpeed: 40, speedRange: 70, gravity: 40, life: 3.4, size: 2.6, sizeRange: 2
      });
      if (self.onVerified) self.onVerified();
    });
  };

  /* ------------------- update ------------------- */
  Game.prototype.update = function (dt) {
    this.particles.update(dt);
    if (this.shakeT > 0) this.shakeT -= dt;

    if (this.state === STATE.TITLE) {
      this.titleBob += dt;
      if (this.actionPressed) { this.actionPressed = false; this.beginStory(); }
      return;
    }

    if (this.state === STATE.DIALOGUE) {
      if (this.actionPressed) {
        this.actionPressed = false;
        Sound.blip();
        var d = this.dialogue;
        d.index++;
        if (d.index >= d.lines.length) {
          var onDone = d.onDone;
          this.dialogue = null;
          // safe idle fallback; onDone (e.g. spawnLevel) may override this
          this.state = STATE.WIN;
          if (onDone) onDone();
        }
      }
      return;
    }

    if (this.state === STATE.LEVEL_CARD) {
      this.levelCardTimer -= dt;
      if (this.levelCardTimer <= 0 || this.actionPressed) {
        this.actionPressed = false;
        this.state = STATE.PLAY;
      }
      return;
    }

    if (this.state === STATE.GAME_OVER) {
      if (this.actionPressed) {
        this.actionPressed = false;
        Sound.blip();
        this.respawn();
        this.state = STATE.PLAY;
      }
      return;
    }

    if (this.state === STATE.RESULTS || this.state === STATE.WIN) {
      this.actionPressed = false;
      return;
    }

    if (this.state === STATE.PLAY) this.updatePlay(dt);
  };

  Game.prototype.updatePlay = function (dt) {
    var p = this.player, self = this;
    this.updateAmbient(dt);
    var speed = 68; // px/sec in internal coords
    var dx = 0, dy = 0;
    if (this.input.left) { dx -= 1; p.facing = "left"; p.hFacing = "left"; }
    if (this.input.right) { dx += 1; p.facing = "right"; p.hFacing = "right"; }
    if (this.input.up) { dy -= 1; p.facing = "up"; }
    if (this.input.down) { dy += 1; p.facing = "down"; }
    p.walking = dx !== 0 || dy !== 0;
    if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
    p.x = Math.min(PLAY_RIGHT, Math.max(PLAY_LEFT, p.x + dx * speed * dt));
    p.y = Math.min(PLAY_BOTTOM, Math.max(PLAY_TOP, p.y + dy * speed * dt));

    if (p.walking) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.18;
        this.particles.spawn(p.x, p.y + 5, 1, {
          color: "rgba(255,255,255,0.5)", life: 0.3, gravity: 0,
          minSpeed: 4, speedRange: 6, size: 1.6, shape: "circle"
        });
      }
    }

    if (p.attackCd > 0) p.attackCd -= dt;
    if (p.attackTimer > 0) p.attackTimer -= dt;
    if (p.invuln > 0) p.invuln -= dt;

    if (this.actionPressed) {
      this.actionPressed = false;
      if (p.attackCd <= 0) {
        p.attackTimer = 0.2;
        p.attackCd = 0.3;
        Sound.swing();
        this.resolveAttack();
      }
    }

    // monsters
    var aliveCount = 0;
    this.monsters.forEach(function (m) {
      if (m.dead) { m.deadT += dt; return; }
      aliveCount++;
      if (m.hurt > 0) m.hurt -= dt;

      var toPx = p.x - m.x, toPy = p.y - m.y;
      var dist = Math.sqrt(toPx * toPx + toPy * toPy);
      var mvx = 0, mvy = 0;
      var curSpeed = m.speed;

      if (m.type === "boss") {
        m.telegraphT -= dt;
        if (m.dashT > 0) {
          m.dashT -= dt;
          curSpeed = m.speed * 2.6;
        } else if (m.telegraphT <= 0) {
          m.dashT = 0.5;
          m.telegraphT = 3.2 + Math.random() * 1.2;
          Sound.telegraph();
        }
      }

      if (dist < 90) {
        mvx = toPx / (dist || 1); mvy = toPy / (dist || 1);
      } else {
        m.wanderT -= dt;
        if (m.wanderT <= 0) { m.wanderDir = Math.random() * Math.PI * 2; m.wanderT = 1 + Math.random() * 1.4; }
        mvx = Math.cos(m.wanderDir); mvy = Math.sin(m.wanderDir);
      }
      m.x = Math.min(PLAY_RIGHT, Math.max(PLAY_LEFT, m.x + mvx * curSpeed * dt));
      m.y = Math.min(PLAY_BOTTOM, Math.max(PLAY_TOP, m.y + mvy * curSpeed * dt));

      // contact with player
      if (p.invuln <= 0) {
        var ddx = p.x - m.x, ddy = p.y - m.y;
        var rr = (m.r + 8);
        if (ddx * ddx + ddy * ddy < rr * rr) {
          p.hp -= 1;
          p.invuln = 1.1;
          Sound.hurt();
          self.shake(2.5, 0.25);
          self.particles.spawn(p.x, p.y - 10, 8, {
            color: ["#ff8fb3", "#ffffff"], life: 0.4, gravity: 60, minSpeed: 30, speedRange: 40
          });
          var kb = Math.atan2(ddy, ddx);
          p.x = Math.min(PLAY_RIGHT, Math.max(PLAY_LEFT, p.x + Math.cos(kb) * 14));
          p.y = Math.min(PLAY_BOTTOM, Math.max(PLAY_TOP, p.y + Math.sin(kb) * 14));
          if (p.hp <= 0) self.enterGameOver();
        }
      }
    });

    // gate / fruit logic
    if (this.level.boss) {
      if (aliveCount === 0 && !this.fruitCollected) {
        var ft = this.level.fruitTree;
        var fdx = p.x - ft.x, fdy = p.y - ft.y;
        if (fdx * fdx + fdy * fdy < 16 * 16) {
          this.fruitCollected = true;
          this.beginWin();
        }
      }
    } else {
      if (aliveCount === 0 && !this.gateOpen) {
        this.gateOpen = true;
        Sound.gate();
      }
      if (this.gateOpen) {
        var gdx = p.x - W / 2, gdy = p.y - EXIT_Y;
        if (gdy > -8 && gdy < 14 && Math.abs(gdx) < 20) {
          this.spawnLevel(this.levelIndex + 1);
        }
      }
    }
  };

  Game.prototype.resolveAttack = function () {
    var p = this.player;
    var range = ATTACK_RANGE;
    var ax = p.x, ay = p.y;
    if (p.facing === "right") ax += range * 0.62;
    else if (p.facing === "left") ax -= range * 0.62;
    else if (p.facing === "up") ay -= range * 0.62;
    else ay += range * 0.62;

    this.particles.spawn(ax, ay, 5, {
      color: [PAL.gold, "#fff7c2"], life: 0.25, gravity: 0,
      minSpeed: 10, speedRange: 30, size: 1.6, shape: "circle"
    });

    var self = this;
    this.monsters.forEach(function (m) {
      if (m.dead || m.hurt > 0) return;
      var ddx = ax - m.x, ddy = ay - m.y;
      var rr = range * 0.6 + m.r;
      if (ddx * ddx + ddy * ddy < rr * rr) {
        m.hp -= 1;
        m.hurt = 0.25;
        self.shake(1.5, 0.12);
        self.particles.spawn(m.x, m.y, 6, {
          color: ["#ffffff", PAL.gold], life: 0.35, gravity: 40, minSpeed: 30, speedRange: 40
        });
        if (m.hp <= 0) {
          m.dead = true;
          m.deadT = 0;
          Sound.defeat();
          self.shake(2.5, 0.2);
          var burstColor = m.type === "boss" ? [PAL.boss, PAL.bossHi, PAL.gold] : [PAL.gold, "#ffffff"];
          self.particles.spawn(m.x, m.y, m.type === "boss" ? 26 : 12, {
            color: burstColor, life: 0.7, gravity: 70, minSpeed: 30, speedRange: 60, size: 2.4, sizeRange: 2
          });
        } else {
          Sound.hit();
        }
      }
    });
  };

  Game.prototype.respawn = function () {
    var p = this.player;
    p.x = W / 2; p.y = ENTRY_Y;
    p.hp = p.maxHp; p.invuln = 1.4;
  };

  Game.prototype.enterGameOver = function () {
    this.state = STATE.GAME_OVER;
    this.shake(5, 0.35);
    this.particles.spawn(this.player.x, this.player.y - 12, 16, {
      color: ["#ff8fb3", "#ffffff", PAL.hair], life: 0.8, gravity: 90, minSpeed: 30, speedRange: 60, size: 2.4
    });
    Sound.gameOver();
  };

  Game.prototype.updateAmbient = function (dt) {
    this.ambientT -= dt;
    if (this.ambientT > 0) return;
    this.ambientT = 0.4;
    var x = PLAY_LEFT + Math.random() * (PLAY_RIGHT - PLAY_LEFT);
    var kind = this.level.ambient;
    if (kind === "petals") {
      this.particles.spawn(x, PLAY_TOP - 14, 1, {
        color: [PAL.petal, "#ffffff"], angle: Math.PI / 2, spread: 0.9,
        life: 4.5, gravity: 10, minSpeed: 5, speedRange: 8, size: 2, shape: "circle"
      });
    } else if (kind === "fireflies") {
      this.particles.spawn(x, PLAY_BOTTOM - Math.random() * 150, 1, {
        color: ["#fff7c2", "#c8ff9e"], angle: -Math.PI / 2, spread: 1.8,
        life: 3.4, gravity: -4, minSpeed: 2, speedRange: 6, size: 1.8, shape: "circle"
      });
    } else if (kind === "motes") {
      this.particles.spawn(x, PLAY_BOTTOM, 1, {
        color: ["#ffe9a8", "#ffffff"], angle: -Math.PI / 2, spread: 1.2,
        life: 3.2, gravity: -6, minSpeed: 3, speedRange: 7, size: 1.5, shape: "circle"
      });
    }
  };

  /* ------------------- render ------------------- */
  Game.prototype.render = function () {
    var ctx = this.ctx;
    var vw = this.viewW || this.canvas.width, vh = this.viewH || this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.setTransform(vw / W, 0, 0, vh / H, 0, 0);
    ctx.imageSmoothingEnabled = false;

    ctx.save();

    if (this.shakeT > 0) {
      var m = this.shakeMag;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    } else {
      this.shakeMag = 0;
    }

    if (this.state === STATE.TITLE) { this.renderTitle(); ctx.restore(); return; }
    if (this.state === STATE.RESULTS) { this.renderResults(); ctx.restore(); return; }

    var d = this.dialogue;
    var atHome = this.state === STATE.DIALOGUE &&
                 (!this.level || (d && d.lines[d.index] && d.lines[d.index].home));
    if (atHome) this.renderCottage(this.fruitCollected);
    else if (this.level) this.renderScene();

    if (this.state === STATE.LEVEL_CARD) this.renderLevelCard();
    if (this.state === STATE.DIALOGUE) this.renderDialogue();
    if (this.state === STATE.GAME_OVER) this.renderGameOver();

    ctx.restore();
  };

  Game.prototype.renderGameOver = function () {
    var ctx = this.ctx;
    var g = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, H * 0.8);
    g.addColorStop(0, "rgba(60,6,18,0.72)");
    g.addColorStop(1, "rgba(14,2,8,0.94)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.fillStyle = "#7a1028";
    ctx.font = "22px 'Press Start 2P', monospace";
    ctx.fillText("GAME OVER", W / 2 + 2, H / 2 - 16);
    ctx.fillStyle = "#ff4b6b";
    ctx.fillText("GAME OVER", W / 2, H / 2 - 18);

    ctx.fillStyle = "#ffd7e2";
    ctx.font = "12px Inter, sans-serif";
    ctx.fillText("Grandma is still waiting...", W / 2, H / 2 + 12);

    if (Math.floor(this.t / 420) % 2 === 0) {
      ctx.fillStyle = PAL.gold;
      ctx.font = "10px 'Press Start 2P', monospace";
      ctx.fillText("PRESS A TO CONTINUE", W / 2, H / 2 + 44);
    }
    ctx.textAlign = "left";
  };

  Game.prototype.renderResults = function () {
    var ctx = this.ctx;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#ffd6a5");
    g.addColorStop(0.55, "#ff9ec4");
    g.addColorStop(1, "#c86bd8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // sun burst behind the title
    ctx.save();
    ctx.globalAlpha = 0.5;
    var rays = 12;
    ctx.fillStyle = "#fff3c4";
    for (var i = 0; i < rays; i++) {
      var a = (i / rays) * Math.PI * 2 + this.t * 0.0004;
      ctx.beginPath();
      ctx.moveTo(W / 2, 96);
      ctx.lineTo(W / 2 + Math.cos(a) * 200, 96 + Math.sin(a) * 200);
      ctx.lineTo(W / 2 + Math.cos(a + 0.12) * 200, 96 + Math.sin(a + 0.12) * 200);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.textAlign = "center";
    ctx.fillStyle = "#7a3010";
    ctx.font = "16px 'Press Start 2P', monospace";
    ctx.fillText("QUEST", W / 2 + 2, 60);
    ctx.fillText("COMPLETE", W / 2 + 2, 84);
    ctx.fillStyle = "#fff7c2";
    ctx.fillText("QUEST", W / 2, 58);
    ctx.fillText("COMPLETE", W / 2, 82);

    drawFruit(ctx, W / 2, 130, this.t, this.particles, 1.8);

    drawGranny(ctx, W / 2 - 48, 200, false);
    drawGirl(ctx, W / 2 + 46, 214, "left", false, this.t, false, false, 0, 1.05);

    // verified stamp
    ctx.save();
    ctx.translate(W / 2, 250);
    ctx.rotate(-0.09);
    ctx.strokeStyle = "#1d7a45";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-78, -15, 156, 30);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(-76, -13, 152, 26);
    ctx.fillStyle = "#1d7a45";
    ctx.font = "11px 'Press Start 2P', monospace";
    ctx.fillText("VERIFIED", 0, 4);
    ctx.restore();

    this.particles.render(ctx);
    ctx.textAlign = "left";
  };

  /* A tiny idle scene used by the landing page teaser screen. */
  Game.prototype.renderPreview = function (ctx, t, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#2a1a4a");
    g.addColorStop(1, "#7b3fa0");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < 7; i++) {
      ctx.globalAlpha = 0.35 + 0.55 * Math.abs(Math.sin(t * 0.0012 + i * 1.7));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(12 + (i * 23) % (w - 20), 14 + ((i * 31) % (h * 0.45)), 1.6, 1.6);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.9, w * 0.42, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    drawGirl(ctx, w / 2, h * 0.92 + Math.sin(t * 0.002) * 1.5, "right", false, t, false, false, 0, h / 68);
  };

  /* Grandma's cottage. The quest opens and closes at her bedside, so
     the framing dialogue gets a room to sit in rather than a black
     screen — and the room itself changes with the story: night and
     washed-out greys while she is ailing, sunset and warm colour once
     the Sunfruit is home. */
  Game.prototype.renderCottage = function (healed) {
    var ctx = this.ctx, t = this.t, i;

    var wall = ctx.createLinearGradient(0, 0, 0, 200);
    wall.addColorStop(0, healed ? "#5e3c57" : "#3c2542");
    wall.addColorStop(1, healed ? "#42253e" : "#291731");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, 196);
    ctx.fillStyle = "rgba(255,255,255,0.028)";
    for (i = 0; i < W; i += 16) ctx.fillRect(i, 0, 7, 196);

    // window on the world she is too weak to walk into
    var wx = 24, wy = 36, ww = 72, wh = 60;
    ctx.fillStyle = "#7a4a30";
    ctx.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
    var sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
    if (healed) { sky.addColorStop(0, "#ffd6a5"); sky.addColorStop(1, "#ff9ec4"); }
    else { sky.addColorStop(0, "#232a63"); sky.addColorStop(1, "#553a89"); }
    ctx.fillStyle = sky;
    ctx.fillRect(wx, wy, ww, wh);
    if (!healed) {
      ctx.fillStyle = "#ffffff";
      for (i = 0; i < 7; i++) {
        ctx.globalAlpha = 0.35 + 0.55 * Math.abs(Math.sin(t * 0.0012 + i * 1.7));
        ctx.fillRect(wx + 6 + (i * 17) % (ww - 10), wy + 5 + (i * 13) % 26, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = healed ? "#fff3c4" : "#fdf6ff";
    ctx.beginPath();
    ctx.arc(wx + 52, wy + 18, healed ? 9 : 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = healed ? "#7ed48a" : "#2c3566";
    ctx.beginPath();
    ctx.moveTo(wx, wy + wh);
    ctx.quadraticCurveTo(wx + 20, wy + wh - 24, wx + 40, wy + wh - 7);
    ctx.quadraticCurveTo(wx + 58, wy + wh - 22, wx + ww, wy + wh - 5);
    ctx.lineTo(wx + ww, wy + wh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(wx, wy, ww, wh * 0.42);
    ctx.fillStyle = "#7a4a30";
    ctx.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
    ctx.fillRect(wx, wy + wh / 2 - 1.5, ww, 3);

    // preserve shelf
    ctx.fillStyle = "#7a4a30";
    ctx.fillRect(212, 68, 78, 5);
    ["#e0567a", "#4fe3ff", "#ffd23f", "#4be08f"].forEach(function (jar, k) {
      var jx = 218 + k * 18;
      ctx.fillStyle = jar;
      ctx.fillRect(jx, 55, 11, 13);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(jx + 1.6, 57, 2.6, 9);
      ctx.fillStyle = "#8a5a38";
      ctx.fillRect(jx - 1, 51.5, 13, 3.6);
    });

    // hanging lamp
    ctx.strokeStyle = "#6b452e";
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(162, 0); ctx.lineTo(162, 20); ctx.stroke();
    var lamp = ctx.createRadialGradient(162, 32, 2, 162, 32, 34);
    lamp.addColorStop(0, healed ? "rgba(255,226,122,0.5)" : "rgba(255,214,140,0.3)");
    lamp.addColorStop(1, "rgba(255,226,122,0)");
    ctx.fillStyle = lamp;
    ctx.beginPath(); ctx.arc(162, 32, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.moveTo(151, 31); ctx.lineTo(173, 31); ctx.lineTo(167, 20); ctx.lineTo(157, 20);
    ctx.closePath(); ctx.fill();

    // floorboards
    ctx.fillStyle = "#5a3a2a";
    ctx.fillRect(0, 196, W, H - 196);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 193, W, 4);
    ctx.strokeStyle = "rgba(0,0,0,0.16)";
    ctx.lineWidth = 1;
    for (i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(0, 206.5 + i * 18); ctx.lineTo(W, 206.5 + i * 18); ctx.stroke();
    }
    ctx.fillStyle = healed ? "#b8506f" : "#7d4258";
    ctx.beginPath(); ctx.ellipse(168, 224, 86, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = healed ? "#e0788f" : "#95536a";
    ctx.beginPath(); ctx.ellipse(168, 224, 66, 14, 0, 0, Math.PI * 2); ctx.fill();

    // rocking chair, Grandma, quilt
    ctx.fillStyle = "#7a4a30";
    ctx.beginPath();
    ctx.moveTo(98, 190); ctx.lineTo(98, 132);
    ctx.quadraticCurveTo(118, 122, 138, 132);
    ctx.lineTo(138, 190);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#9a6440";
    for (i = 0; i < 3; i++) ctx.fillRect(102, 138 + i * 11, 32, 4);

    drawGranny(ctx, 118, 162, !healed);

    ctx.fillStyle = healed ? "#ffc98f" : "#8fa79c";
    ctx.beginPath();
    ctx.moveTo(101, 178); ctx.lineTo(135, 178); ctx.lineTo(144, 191); ctx.lineTo(92, 191);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(94, 184, 48, 3);

    drawGirl(ctx, 212, 190, "left", false, t, false, false, 0, 0.95);

    if (healed) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(t * 0.004) * 0.2;
      ctx.fillStyle = "#ffe27a";
      for (i = 0; i < 5; i++) {
        var mx = 40 + ((i * 61 + t * 0.01) % (W - 80));
        ctx.fillRect(mx, 90 + ((i * 37) % 70), 1.8, 1.8);
      }
      ctx.restore();
    }

    var warm = ctx.createRadialGradient(W / 2, 110, 40, W / 2, 140, 200);
    warm.addColorStop(0, "rgba(255,200,120,0.06)");
    warm.addColorStop(1, healed ? "rgba(30,8,26,0.24)" : "rgba(12,4,20,0.42)");
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, W, H);
  };

  Game.prototype.renderTitle = function () {
    var ctx = this.ctx;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#2a1a4a");
    g.addColorStop(1, "#7b3fa0");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (var i = 0; i < 10; i++) {
      var tw = 0.4 + 0.6 * Math.abs(Math.sin(this.t * 0.001 + i));
      ctx.globalAlpha = tw;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(24 + (i * 53) % (W - 48), 14 + ((i * 37) % 60), 1.8, 1.8);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    ctx.fillStyle = PAL.gold;
    ctx.font = "22px 'Press Start 2P', monospace";
    ctx.fillText("SUNFRUIT", W / 2, 74);
    ctx.fillStyle = "#ff5fa8";
    ctx.font = "17px 'Press Start 2P', monospace";
    ctx.fillText("QUEST", W / 2, 100);

    drawGirl(this.ctx, W / 2, 214 + Math.sin(this.titleBob * 2) * 2.4, "right", true, this.t, false, false, 0, 1.35);

    ctx.fillStyle = "#fff";
    ctx.font = "12px Inter, sans-serif";
    var blink = Math.floor(this.t / 450) % 2 === 0;
    if (blink) ctx.fillText("PRESS A / TAP TO START", W / 2, 250);
    ctx.textAlign = "left";
  };

  Game.prototype.renderScene = function () {
    var ctx = this.ctx, lvl = this.level, self = this;
    ctx.fillStyle = skyGrad(ctx, lvl.sky);
    ctx.fillRect(0, 0, W, GROUND_Y + 50);

    // drifting clouds (parallax)
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (var c = 0; c < 3; c++) {
      var cx = ((this.t * 0.006 + c * 140) % (W + 80)) - 40;
      var cy = 9 + c * 8;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 16, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 12, cy + 2, 10, 5, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 12, cy + 2, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = lvl.ground;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    drawHills(ctx, lvl.hillBack, lvl.hillFront);
    ctx.fillStyle = lvl.groundShade;
    ctx.fillRect(0, GROUND_Y + 18, W, 3);

    // path guiding from entry to exit
    ctx.fillStyle = lvl.path;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 20, ENTRY_Y + 14);
    ctx.lineTo(W / 2 + 20, ENTRY_Y + 14);
    ctx.lineTo(W / 2 + 10, EXIT_Y + 10);
    ctx.lineTo(W / 2 - 10, EXIT_Y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // decorations
    for (var g = 0; g < TUFTS.length; g++) {
      drawGrassTuft(ctx, TUFTS[g][0], TUFTS[g][1], lvl.tuft, this.t);
    }

    if (lvl.deco === "flowers") {
      [[46, 90, "#ff8fb3"], [90, 230, "#ffd23f"], [270, 90, "#ff8fb3"], [180, 240, "#4fe3ff"],
       [60, 200, "#ffd23f"], [250, 200, "#ff8fb3"], [116, 72, "#ffd23f"], [226, 118, "#4fe3ff"],
       [72, 148, "#ff8fb3"], [246, 262, "#ffd23f"], [34, 260, "#4fe3ff"], [294, 168, "#ff8fb3"],
       [128, 276, "#ffd23f"], [204, 72, "#ff8fb3"]]
        .forEach(function (f) { drawDecoFlower(ctx, f[0], f[1], f[2], self.t); });
    } else if (lvl.deco === "trees") {
      [[42, 250], [280, 240], [36, 130], [288, 150], [64, 190], [260, 112], [96, 278], [236, 280]]
        .forEach(function (p) { drawDecoTree(ctx, p[0], p[1], self.t); });
      [[110, 232, "#8fd8a8"], [214, 176, "#c8ff9e"], [58, 108, "#8fd8a8"]]
        .forEach(function (f) { drawDecoFlower(ctx, f[0], f[1], f[2], self.t); });
    } else if (lvl.deco === "rocks") {
      [[46, 220, 1], [80, 245, 0.7], [270, 210, 1.1], [250, 250, 0.8],
       [36, 148, 0.9], [288, 138, 0.75], [108, 272, 0.6], [214, 268, 0.85]]
        .forEach(function (p) { drawDecoRock(ctx, p[0], p[1], p[2]); });
    }

    // exit gate (non-boss levels)
    if (!lvl.boss) {
      drawGate(ctx, W / 2, EXIT_Y, this.gateOpen, this.t);
    }

    // fruit tree (boss level)
    if (lvl.boss) {
      var ft = lvl.fruitTree;
      drawDecoTree(ctx, ft.x, ft.y + 22);
      var bossAlive = this.monsters.some(function (m) { return m.type === "boss" && !m.dead; });
      if (!bossAlive) drawFruit(ctx, ft.x, ft.y, this.t, this.particles);
    }

    // monsters
    this.monsters.forEach(function (m) {
      if (m.dead) {
        var s = Math.max(0, 1 - m.deadT / 0.3);
        if (s <= 0) return;
        ctx.save();
        ctx.globalAlpha = s;
        if (m.type === "boss") drawBoss(ctx, m.x, m.y, m.r * s, self.t, false, false);
        else drawSlime(ctx, m.x, m.y, m.r * s, m.color, self.t, false);
        ctx.restore();
        return;
      }
      if (m.type === "boss") drawBoss(ctx, m.x, m.y, m.r, self.t, m.hurt > 0, m.telegraphT < 0.6);
      else drawSlime(ctx, m.x, m.y, m.r, m.color, self.t, m.hurt > 0);
    });

    this.particles.render(ctx);

    // player
    var p = this.player;
    var hurtFlash = p.invuln > 0 && Math.floor(this.t / 80) % 2 === 0;
    var lunge = p.attackTimer > 0 ? Math.sin((0.2 - p.attackTimer) / 0.2 * Math.PI) * 4 : 0;
    drawGirl(ctx, p.x, p.y, p.hFacing, p.walking, this.t, p.attackTimer > 0, hurtFlash, lunge);

    // vignette
    var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(10,5,20,0.10)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // HUD hearts
    for (var i = 0; i < p.maxHp; i++) {
      drawHeart(ctx, 18 + i * 16, 16, i < p.hp);
    }
  };

  function drawHeart(ctx, x, y, full) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = full ? "#ff5fa8" : "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.bezierCurveTo(-6, -4.5, -6, 3, 0, 7.5);
    ctx.bezierCurveTo(6, 3, 6, -4.5, 0, 3);
    ctx.fill();
    if (full) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.ellipse(-2, -1, 1.2, 0.7, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  Game.prototype.renderLevelCard = function () {
    var ctx = this.ctx;
    var alpha = Math.min(1, this.levelCardTimer / 0.3, (1.6 - this.levelCardTimer) / 0.3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = "rgba(20,10,35,0.6)";
    ctx.fillRect(0, H / 2 - 18, W, 36);
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, H / 2 - 17.5, W - 1, 35);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "13px 'Press Start 2P', monospace";
    ctx.fillText(this.level.name, W / 2, H / 2 + 5);
    ctx.textAlign = "left";
    ctx.restore();
  };

  Game.prototype.renderDialogue = function () {
    var ctx = this.ctx, d = this.dialogue;
    if (!d) return;
    var line = d.lines[d.index];
    if (!line) return;

    var boxH = 66;
    var boxY = H - boxH - 10;
    var panel = ctx.createLinearGradient(0, boxY, 0, boxY + boxH);
    panel.addColorStop(0, "rgba(38,20,64,0.96)");
    panel.addColorStop(1, "rgba(12,7,22,0.96)");
    ctx.fillStyle = panel;
    ctx.fillRect(10, boxY, W - 20, boxH);
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(10.7, boxY + 0.7, W - 21.4, boxH - 1.4);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(13.5, boxY + 3.5, W - 27, boxH - 7);
    // corner brackets
    ctx.fillStyle = PAL.gold;
    [[12, boxY + 2], [W - 18, boxY + 2], [12, boxY + boxH - 6], [W - 18, boxY + boxH - 6]]
      .forEach(function (c) { ctx.fillRect(c[0], c[1], 6, 4); });

    var px = 34;
    if (line.who === "girl") drawGirl(ctx, px, boxY + 58, "right", false, this.t, false, false, 0, 0.92);
    else if (line.who === "gran") drawGranny(ctx, px, boxY + 46, !this.fruitCollected);

    var textX = line.who ? 56 : 22;
    if (line.name) {
      ctx.fillStyle = PAL.gold;
      ctx.font = "10px 'Press Start 2P', monospace";
      ctx.fillText(line.name, textX, boxY + 18);
    }
    ctx.fillStyle = "#fdf6ff";
    ctx.font = "13px Inter, sans-serif";
    var lines = wrapText(ctx, line.text, W - textX - 18);
    lines.slice(0, 3).forEach(function (l, i) {
      ctx.fillText(l, textX, boxY + 32 + i * 15);
    });

    if (Math.floor(this.t / 400) % 2 === 0) {
      ctx.fillStyle = PAL.gold;
      ctx.font = "10px 'Press Start 2P', monospace";
      ctx.fillText("▼", W - 28, boxY + boxH - 10);
    }
  };

  window.SunfruitGame = new Game();
})();
