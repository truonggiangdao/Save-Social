(function () {
  "use strict";

  var STORAGE_KEY = "saveSocialLibrary_v1";
  var THEME_KEY = "saveSocialTheme_v1";
  var DELETED_TAGS_KEY = "saveSocialDeletedTags_v1";
  var DEFAULT_ACCENT = "#7c5cfc";
  var SOURCE_DEFS = [
    { id: "youtube", label: "YouTube" },
    { id: "tiktok", label: "TikTok" },
    { id: "instagram", label: "Instagram" },
    { id: "facebook", label: "Facebook" },
    { id: "twitter", label: "Twitter/X" },
    { id: "website", label: "Website" },
    { id: "medium", label: "Medium" },
    { id: "spotify", label: "Spotify" },
    { id: "github", label: "Github" },
  ];
  var FORMAT_DEFS = [
    { id: "video", label: "Video" },
    { id: "reel", label: "Reel / Short" },
    { id: "image", label: "Ảnh" },
    { id: "article", label: "Bài viết" },
    { id: "website", label: "Website" },
    { id: "pdf", label: "PDF" },
    { id: "tweet", label: "Tweet" },
    { id: "audio", label: "Audio" },
    { id: "note", label: "Ghi chú" },
  ];
  var THEME_PRESETS = [
    { id: "purple", label: "Tím", hex: "#7c5cfc" },
    { id: "pink", label: "Hồng", hex: "#ec4899" },
    { id: "coral", label: "Cam san hô", hex: "#ff6b4a" },
    { id: "orange", label: "Cam", hex: "#ff9800" },
    { id: "yellow", label: "Vàng", hex: "#facc15" },
    { id: "green", label: "Xanh lá", hex: "#22c55e" },
    { id: "teal", label: "Xanh ngọc", hex: "#14b8a6" },
    { id: "blue", label: "Xanh dương", hex: "#38bdf8" },
    { id: "lavender", label: "Tím nhạt", hex: "#a78bfa" },
    {
      id: "gradient",
      label: "Gradient",
      hex: "#a78bfa",
      gradient: "linear-gradient(135deg, #38bdf8 0%, #a78bfa 48%, #ec4899 100%)",
    },
  ];
  var PRESET_TAGS = ["Nấu ăn", "Tập thể dục", "Con cái", "Mẹo sống"];
  var state = {
    items: [],
    filterTag: null,
    filterSource: null,
    filterFormat: null,
    search: "",
    sheetEditingId: null,
    sort: "newest",
    editingId: null,
    formTags: [],
    formTagPickerExtra: [],
    formTagManageMode: false,
    searchExpanded: false,
    formTagAddOpen: false,
    formInfoOpen: false,
    editTitleTouched: false,
    deletedTags: [],
    sidebarSuppressDocClose: false,
    sortSuppressDocClose: false,
    viewMode: "grid",
  };

  var editAutoTitleTimer = null;
  var headerQuickAddBusy = false;
  var BUILD_STORAGE_KEY = "saveSocialBuild_v1";

  function getBuildId() {
    if (typeof window.SAVE_SOCIAL_BUILD === "string" && window.SAVE_SOCIAL_BUILD) {
      return window.SAVE_SOCIAL_BUILD;
    }
    var meta = document.querySelector('meta[name="save-social-build"]');
    return meta ? meta.getAttribute("content") || "0" : "0";
  }

  function ensureFreshBuild(done) {
    var build = getBuildId();
    try {
      var prev = localStorage.getItem(BUILD_STORAGE_KEY);
      if (prev && prev !== build) {
        localStorage.setItem(BUILD_STORAGE_KEY, build);
        var url = new URL(window.location.href);
        if (url.searchParams.get("_sv") !== build) {
          url.searchParams.set("_sv", build);
          window.location.replace(url.toString());
          return;
        }
      }
      if (!prev || prev !== build) localStorage.setItem(BUILD_STORAGE_KEY, build);
    } catch (e) {}
    done();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    var build = getBuildId();
    navigator.serviceWorker
      .register("./sw.js?v=" + encodeURIComponent(build))
      .then(function (reg) {
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        reg.addEventListener("updatefound", function () {
          var installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", function () {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(function () {});

    var reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }

  function $(id) {
    return document.getElementById(id);
  }

  function on(id, event, handler) {
    var el = typeof id === "string" ? $(id) : id;
    if (el && handler) el.addEventListener(event, handler);
    return el;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      var items = data.items;
      if (!Array.isArray(items) && Array.isArray(data)) items = data;
      if (!Array.isArray(items)) return [];
      return items.map(function (it) {
        var out = {};
        for (var k in it) {
          if (k === "thumbFallback") continue;
          out[k] = it[k];
        }
        out.pinned = !!out.pinned;
        if (out.source === "web") out.source = "website";
        if (!out.source || !out.format) {
          var u = out.url || "";
          if (!out.source) out.source = detectSource(u);
          if (!out.format) out.format = detectFormat(u, out.source);
        }
        return out;
      });
    } catch (e) {
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items }));
    } catch (e) {
      showToast("Không lưu được — kiểm tra dung lượng hoặc chế độ riêng tư trình duyệt.");
    }
  }

  function clampByte(x) {
    return Math.min(255, Math.max(0, Math.round(x)));
  }

  function hexToRgb(hex) {
    var h = String(hex || "")
      .trim()
      .replace(/^#/, "");
    if (h.length === 3) {
      h = h
        .split("")
        .map(function (c) {
          return c + c;
        })
        .join("");
    }
    if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null;
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    return (
      "#" +
      [r, g, b]
        .map(function (x) {
          var s = clampByte(x).toString(16);
          return s.length === 1 ? "0" + s : s;
        })
        .join("")
    );
  }

  function normalizeHex(hex) {
    var rgb = hexToRgb(hex);
    if (!rgb) return DEFAULT_ACCENT;
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  function mixRgb(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
    };
  }

  function darkenRgb(rgb, amount) {
    return mixRgb(rgb, { r: 0, g: 0, b: 0 }, amount);
  }

  function applyAccentHex(hex) {
    var rgb = hexToRgb(hex);
    if (!rgb) rgb = hexToRgb(DEFAULT_ACCENT);
    var accentHex = normalizeHex(rgbToHex(rgb.r, rgb.g, rgb.b));
    var hover = darkenRgb(rgb, 0.18);
    var soft = mixRgb(rgb, { r: 255, g: 255, b: 255 }, 0.82);
    var bgPage = mixRgb({ r: 238, g: 240, b: 244 }, rgb, 0.07);
    var root = document.documentElement;
    var r = rgb.r,
      g = rgb.g,
      b = rgb.b;

    root.style.setProperty("--accent", accentHex);
    root.style.setProperty("--accent-hover", rgbToHex(hover.r, hover.g, hover.b));
    root.style.setProperty("--accent-soft", rgbToHex(soft.r, soft.g, soft.b));
    root.style.setProperty("--bg", rgbToHex(bgPage.r, bgPage.g, bgPage.b));
    root.style.setProperty("--pinned-border", "rgba(" + r + "," + g + "," + b + ",0.38)");
    root.style.setProperty(
      "--pinned-glow",
      "0 2px 20px rgba(" + r + "," + g + "," + b + ",0.22), 0 1px 3px rgba(26, 29, 35, 0.06)"
    );

    var g1 = mixRgb({ r: 255, g: 255, b: 255 }, rgb, 0.1);
    var g2 = mixRgb({ r: 255, g: 255, b: 255 }, rgb, 0.24);
    var g3 = mixRgb({ r: 255, g: 255, b: 255 }, rgb, 0.34);
    root.style.setProperty(
      "--pinned-surface",
      "linear-gradient(165deg, #ffffff 0%, " +
        rgbToHex(g1.r, g1.g, g1.b) +
        " 32%, " +
        rgbToHex(g2.r, g2.g, g2.b) +
        " 68%, " +
        rgbToHex(g3.r, g3.g, g3.b) +
        " 100%)"
    );

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", accentHex);
    return accentHex;
  }

  function readStoredAccent() {
    try {
      var raw = localStorage.getItem(THEME_KEY);
      if (!raw) return DEFAULT_ACCENT;
      var data = JSON.parse(raw);
      if (data && data.accent && hexToRgb(data.accent)) return normalizeHex(data.accent);
    } catch (e) {}
    return DEFAULT_ACCENT;
  }

  function writeStoredAccent(hex) {
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify({ accent: normalizeHex(hex) }));
    } catch (e) {}
  }

  function saveThemeAccentOnly(hex) {
    writeStoredAccent(hex);
  }

  function loadTheme() {
    try {
      var hex = readStoredAccent();
      applyAccentHex(hex);
      syncThemeUi(hex);
      syncThemeCustomField(hex);
      bindThemeCustomInput();
    } catch (e) {
      applyAccentHex(DEFAULT_ACCENT);
      syncThemeUi(DEFAULT_ACCENT);
      syncThemeCustomField(DEFAULT_ACCENT);
      bindThemeCustomInput();
    }
  }

  function getAppliedAccentHex() {
    var fromCss = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    if (fromCss && hexToRgb(fromCss)) return normalizeHex(fromCss);
    return DEFAULT_ACCENT;
  }

  function formatHexDisplay(hex) {
    return normalizeHex(hex).toUpperCase();
  }

  function syncThemeCustomField(hex) {
    var inp = $("themeCustomHex");
    var prev = $("themeCustomPreview");
    if (!inp || !prev) return;
    var n = normalizeHex(hex);
    inp.value = formatHexDisplay(n);
    prev.style.background = n;
  }

  function applyThemeFromHex(hex, silent) {
    var applied = applyAccentHex(hex);
    saveThemeAccentOnly(applied);
    syncThemeUi(applied);
    syncThemeCustomField(applied);
    if (!silent) showToast("Đã đổi màu");
    return applied;
  }

  function parseCustomHexInput(raw) {
    var s = String(raw || "").trim();
    if (!s) return null;
    if (s.charAt(0) !== "#") s = "#" + s;
    return hexToRgb(s) ? normalizeHex(s) : null;
  }

  function applyThemeFromCustomInput() {
    var inp = $("themeCustomHex");
    if (!inp) return;
    var parsed = parseCustomHexInput(inp.value);
    if (!parsed) {
      syncThemeCustomField(getAppliedAccentHex());
      showToast("Mã màu không hợp lệ");
      return;
    }
    applyThemeFromHex(parsed);
  }

  function syncThemeUi(hex) {
    var n = normalizeHex(hex);
    document.querySelectorAll(".theme-swatch[data-hex]").forEach(function (btn) {
      var h = btn.getAttribute("data-hex");
      var sel = !!(h && normalizeHex(h) === n);
      btn.classList.toggle("is-selected", sel);
      btn.setAttribute("aria-pressed", sel ? "true" : "false");
    });
  }

  var themeCustomInputBound = false;

  function bindThemeCustomInput() {
    if (themeCustomInputBound) return;
    var inp = $("themeCustomHex");
    if (!inp) return;
    themeCustomInputBound = true;
    inp.addEventListener("input", function () {
      var prev = $("themeCustomPreview");
      var parsed = parseCustomHexInput(inp.value);
      if (parsed && prev) prev.style.background = parsed;
    });
    inp.addEventListener("change", applyThemeFromCustomInput);
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        applyThemeFromCustomInput();
        inp.blur();
      }
    });
  }

  function renderThemeColorUi() {
    var presetsWrap = $("sidebarThemePresets");
    if (!presetsWrap) return;

    presetsWrap.innerHTML = "";
    THEME_PRESETS.forEach(function (p) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-swatch";
      btn.setAttribute("data-hex", p.hex);
      btn.setAttribute("data-preset-id", p.id);
      btn.setAttribute("aria-label", p.label);
      btn.setAttribute("aria-pressed", "false");
      if (p.gradient) btn.style.background = p.gradient;
      else btn.style.background = p.hex;

      var mark = document.createElement("span");
      mark.className = "theme-swatch__check";
      mark.setAttribute("aria-hidden", "true");
      mark.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      btn.appendChild(mark);
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        applyThemeFromHex(p.hex);
      });
      presetsWrap.appendChild(btn);
    });

    bindThemeCustomInput();
    syncThemeUi(getAppliedAccentHex());
    syncThemeCustomField(getAppliedAccentHex());
  }

  function openSettingsSheet() {
    closeSortMenu();
    closeAllCardMenus();
    closeProfileSheet();
    closeSidebarIfMobile();
    renderThemeColorUi();
    syncThemeUi(getAppliedAccentHex());
    var sheet = $("settingsSheet");
    if (!sheet) return;
    sheet.hidden = false;
    document.body.style.overflow = "hidden";
    var btn = $("btnAppMenu");
    if (btn) btn.setAttribute("aria-expanded", "true");
  }

  function closeSettingsSheet() {
    var sheet = $("settingsSheet");
    if (sheet) sheet.hidden = true;
    var btn = $("btnAppMenu");
    if (btn) btn.setAttribute("aria-expanded", "false");
    if ($("modal").hidden && $("quickSheet").hidden && $("profileSheet").hidden) {
      document.body.style.overflow = "";
    }
  }

  function toggleSettingsSheet() {
    var sheet = $("settingsSheet");
    if (sheet && !sheet.hidden) closeSettingsSheet();
    else openSettingsSheet();
  }

  function updateProfileStats() {
    var el = $("profileStatCount");
    if (!el) return;
    var n = state.items.length;
    el.textContent = String(n);
  }

  function openProfileSheet() {
    closeSortMenu();
    closeAllCardMenus();
    closeSidebarIfMobile();
    updateProfileStats();
    var sheet = $("profileSheet");
    if (!sheet) return;
    sheet.hidden = false;
    document.body.style.overflow = "hidden";
    var btn = $("btnHeaderProfile");
    if (btn) btn.setAttribute("aria-expanded", "true");
  }

  function closeProfileSheet() {
    var sheet = $("profileSheet");
    if (sheet) sheet.hidden = true;
    var btn = $("btnHeaderProfile");
    if (btn) btn.setAttribute("aria-expanded", "false");
    if ($("modal").hidden && $("quickSheet").hidden && $("settingsSheet").hidden) {
      document.body.style.overflow = "";
    }
  }

  function detectSource(url) {
    try {
      var u = new URL(url.trim());
      var h = u.hostname.toLowerCase();
      if (h.includes("youtube.com") || h === "youtu.be" || h.includes("youtube-nocookie.com")) return "youtube";
      if (h.includes("tiktok.com")) return "tiktok";
      if (h.includes("instagram.com")) return "instagram";
      if (h.includes("facebook.com") || h.includes("fb.com") || h.includes("fb.watch") || h.includes("messenger.com")) {
        return "facebook";
      }
      if (h.includes("twitter.com") || h === "x.com" || h.endsWith(".x.com")) return "twitter";
      if (h.includes("medium.com")) return "medium";
      if (h.includes("spotify.com") || h.includes("open.spotify.com")) return "spotify";
      if (h.includes("github.com")) return "github";
      return "website";
    } catch (e) {
      return "website";
    }
  }

  function detectFormat(url, source) {
    var path = "";
    var full = (url || "").toLowerCase();
    try {
      path = new URL(url.trim()).pathname.toLowerCase();
    } catch (e) {}
    if (/\.pdf(\?|$)/i.test(full)) return "pdf";
    if (source === "youtube") return path.indexOf("/shorts") !== -1 ? "reel" : "video";
    if (source === "tiktok") return "reel";
    if (source === "instagram") return path.indexOf("/reel") !== -1 ? "reel" : "image";
    if (source === "twitter") return "tweet";
    if (source === "spotify") return "audio";
    if (source === "medium") return "article";
    if (source === "github") return "website";
    if (source === "facebook") {
      if (path.indexOf("/reel") !== -1) return "reel";
      if (path.indexOf("/watch") !== -1 || path.indexOf("/video") !== -1) return "video";
    }
    return "website";
  }

  function sourceLabel(src) {
    if (src === "web") src = "website";
    for (var i = 0; i < SOURCE_DEFS.length; i++) {
      if (SOURCE_DEFS[i].id === src) return SOURCE_DEFS[i].label;
    }
    return "Website";
  }

  function formatLabel(fmt) {
    for (var j = 0; j < FORMAT_DEFS.length; j++) {
      if (FORMAT_DEFS[j].id === fmt) return FORMAT_DEFS[j].label;
    }
    return "Website";
  }

  function ensureItemMeta(item) {
    var url = (item.url || "").trim();
    if (!item.source) item.source = detectSource(url);
    if (item.source === "web") item.source = "website";
    if (!item.format) item.format = detectFormat(url, item.source);
    return item;
  }

  function buildItemFromUrl(url, partial) {
    var o = partial || {};
    var src = detectSource(url);
    var fmt = detectFormat(url, src);
    return ensureItemMeta({
      id: o.id,
      url: url,
      title: o.title || "",
      note: o.note || "",
      tags: o.tags || [],
      createdAt: o.createdAt || new Date().toISOString(),
      pinned: !!o.pinned,
      thumbUrl: o.thumbUrl,
      source: o.source || src,
      format: o.format || fmt,
    });
  }

  function syncMetaFromUrl() {
    var url = $("urlInput").value.trim();
    if (!url) return;
    updateSourceBadge();
  }

  function updateSourceBadge() {
    var url = $("urlInput").value.trim();
    var badge = $("sourceBadge");
    var preview = $("formPreview");
    if (!badge) return;
    if (!url) {
      badge.textContent = "—";
      badge.className = "badge edit-preview__badge";
      badge.hidden = true;
      return;
    }
    var src = detectSource(url);
    badge.textContent = sourceLabel(src) + " · " + formatLabel(detectFormat(url, src));
    badge.className = "badge edit-preview__badge badge--" + (src === "website" ? "web" : src);
    badge.hidden = preview ? preview.hidden : false;
  }

  function renderSidebar() {
    var srcWrap = $("sidebarSources");
    var fmtWrap = $("sidebarFormats");
    if (!srcWrap || !fmtWrap) return;

    function navBtn(label, active, onClick) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "sidebar__item" + (active ? " is-active" : "");
      b.innerHTML = '<span class="sidebar__item-dot" aria-hidden="true"></span>' + label;
      b.addEventListener("click", onClick);
      return b;
    }

    srcWrap.innerHTML = "";
    srcWrap.appendChild(
      navBtn("Tất cả nguồn", !state.filterSource, function () {
        state.filterSource = null;
        closeSidebarIfMobile();
        render();
      })
    );
    SOURCE_DEFS.forEach(function (d) {
      srcWrap.appendChild(
        navBtn(d.label, state.filterSource === d.id, function () {
          state.filterSource = state.filterSource === d.id ? null : d.id;
          closeSidebarIfMobile();
          render();
        })
      );
    });

    fmtWrap.innerHTML = "";
    fmtWrap.appendChild(
      navBtn("Tất cả định dạng", !state.filterFormat, function () {
        state.filterFormat = null;
        closeSidebarIfMobile();
        render();
      })
    );
    FORMAT_DEFS.forEach(function (d) {
      fmtWrap.appendChild(
        navBtn(d.label, state.filterFormat === d.id, function () {
          state.filterFormat = state.filterFormat === d.id ? null : d.id;
          closeSidebarIfMobile();
          render();
        })
      );
    });
  }

  function isMobileLayout() {
    return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 899px)").matches;
  }

  function syncSidebarA11y() {
    var sidebar = $("sidebar");
    if (!sidebar) return;
    if (!isMobileLayout()) {
      sidebar.classList.add("is-open");
      sidebar.setAttribute("aria-hidden", "false");
      return;
    }
    var on = document.body.classList.contains("sidebar-open");
    sidebar.classList.toggle("is-open", on);
    sidebar.setAttribute("aria-hidden", on ? "false" : "true");
  }

  function setSidebarOpen(open) {
    var on = !!open;
    if (!isMobileLayout()) {
      document.body.classList.remove("sidebar-open");
      var scrimOff = $("sidebarScrim");
      if (scrimOff) scrimOff.hidden = true;
      syncSidebarA11y();
      return;
    }
    document.body.classList.toggle("sidebar-open", on);
    var btn = $("btnSidebar");
    var scrim = $("sidebarScrim");
    if (btn) btn.setAttribute("aria-expanded", on ? "true" : "false");
    if (scrim) {
      scrim.hidden = !on;
      scrim.setAttribute("aria-hidden", on ? "false" : "true");
    }
    syncSidebarA11y();
  }

  function renderMobileFilters() {
    var srcWrap = $("mobileSourceFilters");
    var fmtWrap = $("mobileFormatFilters");
    if (!srcWrap || !fmtWrap) return;

    function chip(label, active, onClick) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (active ? " is-active" : "");
      b.textContent = label;
      b.addEventListener("click", onClick);
      return b;
    }

    srcWrap.innerHTML = "";
    srcWrap.appendChild(
      chip("Tất cả nguồn", !state.filterSource, function () {
        state.filterSource = null;
        render();
      })
    );
    SOURCE_DEFS.forEach(function (d) {
      srcWrap.appendChild(
        chip(d.label, state.filterSource === d.id, function () {
          state.filterSource = state.filterSource === d.id ? null : d.id;
          render();
        })
      );
    });

    fmtWrap.innerHTML = "";
    fmtWrap.appendChild(
      chip("Tất cả định dạng", !state.filterFormat, function () {
        state.filterFormat = null;
        render();
      })
    );
    FORMAT_DEFS.forEach(function (d) {
      fmtWrap.appendChild(
        chip(d.label, state.filterFormat === d.id, function () {
          state.filterFormat = state.filterFormat === d.id ? null : d.id;
          render();
        })
      );
    });
  }

  function closeSidebarIfMobile() {
    if (isMobileLayout()) setSidebarOpen(false);
  }

  function hostnameTitle(url) {
    try {
      return new URL(url.trim()).hostname.replace(/^www\./, "");
    } catch (e) {
      return "Liên kết mới";
    }
  }

  function extractYoutubeId(url) {
    try {
      var u = new URL(url.trim());
      var h = u.hostname.toLowerCase();
      var p = u.pathname;
      if (h === "youtu.be") {
        var seg = p.split("/").filter(Boolean)[0];
        return seg ? seg.split("?")[0] : null;
      }
      if (h.includes("youtube.com") || h.includes("youtube-nocookie.com")) {
        var v = u.searchParams.get("v");
        if (v) return v;
        var parts = p.split("/").filter(Boolean);
        var shortsIdx = parts.indexOf("shorts");
        if (shortsIdx !== -1 && parts[shortsIdx + 1]) return parts[shortsIdx + 1].split("?")[0];
        var embedIdx = parts.indexOf("embed");
        if (embedIdx !== -1 && parts[embedIdx + 1]) return parts[embedIdx + 1].split("?")[0];
        var liveIdx = parts.indexOf("live");
        if (liveIdx !== -1 && parts[liveIdx + 1]) return parts[liveIdx + 1].split("?")[0];
      }
    } catch (e) {}
    return null;
  }

  function suggestTitleLocal(url) {
    var src = detectSource(url);
    if (src === "youtube") {
      var id = extractYoutubeId(url);
      return id ? "Video YouTube · " + id : "Video YouTube";
    }
    if (src === "facebook") return "Liên kết Facebook";
    return hostnameTitle(url);
  }

  function isNetworkHintOnline() {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }

  function refreshNetworkUi() {
    var hint = $("fetchHint");
    if (!hint) return;
    var online = isNetworkHintOnline();
    hint.textContent = online
      ? "Tiêu đề cập nhật tự động khi mở và khi đổi URL (YouTube lấy tiêu đề thật khi có mạng)."
      : "Đang offline — tiêu đề gợi ý theo link; bật mạng để lấy tiêu đề YouTube đầy đủ.";
  }

  function fetchYoutubeTitle(url) {
    var api = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url.trim());
    return fetch(api)
      .then(function (r) {
        if (!r.ok) throw new Error("oembed");
        return r.json();
      })
      .then(function (j) {
        return j.title || suggestTitleLocal(url);
      });
  }

  function normalizeTag(t) {
    return t.trim().replace(/\s+/g, " ");
  }

  function loadDeletedTags() {
    try {
      var raw = localStorage.getItem(DELETED_TAGS_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      var out = [];
      data.forEach(function (t) {
        var n = normalizeTag(t);
        if (n && out.indexOf(n) === -1) out.push(n);
      });
      return out;
    } catch (e) {
      return [];
    }
  }

  function persistDeletedTags() {
    try {
      localStorage.setItem(DELETED_TAGS_KEY, JSON.stringify(state.deletedTags));
    } catch (e) {}
  }

  function isTagDeleted(tag) {
    var n = normalizeTag(tag);
    if (!n) return false;
    return state.deletedTags.some(function (t) {
      return normalizeTag(t) === n;
    });
  }

  function uniqueTagsFromItems() {
    var set = {};
    state.items.forEach(function (item) {
      (item.tags || []).forEach(function (t) {
        var n = normalizeTag(t);
        if (n) set[n] = true;
      });
    });
    return Object.keys(set).sort(function (a, b) {
      return a.localeCompare(b, "vi");
    });
  }

  function allTagsForFilter() {
    var fromItems = uniqueTagsFromItems();
    var merged = {};
    PRESET_TAGS.forEach(function (t) {
      var n = normalizeTag(t);
      if (n && !isTagDeleted(n)) merged[n] = true;
    });
    fromItems.forEach(function (t) {
      merged[t] = true;
    });
    return Object.keys(merged).sort(function (a, b) {
      return a.localeCompare(b, "vi");
    });
  }

  function matchesSearch(item, q) {
    if (!q) return true;
    var s = q.toLowerCase();
    var title = (item.title || "").toLowerCase();
    var note = (item.note || "").toLowerCase();
    var tags = (item.tags || []).join(" ").toLowerCase();
    return title.indexOf(s) !== -1 || note.indexOf(s) !== -1 || tags.indexOf(s) !== -1;
  }

  function matchesTagFilter(item) {
    if (!state.filterTag) return true;
    return (item.tags || []).some(function (t) {
      return normalizeTag(t) === state.filterTag;
    });
  }

  function matchesSourceFilter(item) {
    if (!state.filterSource) return true;
    var src = item.source || detectSource(item.url || "");
    if (src === "web") src = "website";
    return src === state.filterSource;
  }

  function matchesFormatFilter(item) {
    if (!state.filterFormat) return true;
    var fmt = item.format || detectFormat(item.url || "", item.source);
    return fmt === state.filterFormat;
  }

  function getFilteredOnly() {
    return state.items.filter(function (item) {
      ensureItemMeta(item);
      return (
        matchesSearch(item, state.search) &&
        matchesTagFilter(item) &&
        matchesSourceFilter(item) &&
        matchesFormatFilter(item)
      );
    });
  }

  function orderIndexMap() {
    var m = {};
    state.items.forEach(function (it, idx) {
      m[it.id] = idx;
    });
    return m;
  }

  function getFilteredSorted() {
    var list = getFilteredOnly().slice();
    var ord = orderIndexMap();

    function secondarySort(a, b) {
      if (state.sort === "title") {
        return (a.title || "").localeCompare(b.title || "", "vi", { sensitivity: "base" });
      }
      if (state.sort === "newest") {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      if (state.sort === "manual") {
        return (ord[a.id] || 0) - (ord[b.id] || 0);
      }
      return 0;
    }

    list.sort(function (a, b) {
      var ap = a.pinned ? 1 : 0;
      var bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return secondarySort(a, b);
    });
    return list;
  }

  function youtubeThumbUrls(videoId) {
    return [
      "https://i.ytimg.com/vi/" + videoId + "/mqdefault.jpg",
      "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg",
    ];
  }

  function thumbWrapForUrl(url) {
    var src = detectSource(url);
    if (src === "youtube") {
      var id = extractYoutubeId(url);
      if (id) return { kind: "youtube", id: id, urls: youtubeThumbUrls(id) };
    }
    if (src === "facebook") return { kind: "placeholder", platform: "facebook" };
    return { kind: "placeholder", platform: src === "web" ? "website" : src };
  }

  var fbThumbPending = {};
  var fbThumbFailed = {};

  function resolveFacebookThumbnail(url) {
    var u = url.trim();
    var noembed = "https://noembed.com/embed?url=" + encodeURIComponent(u);
    return fetch(noembed)
      .then(function (r) {
        if (!r.ok) throw new Error("noembed");
        return r.json();
      })
      .then(function (j) {
        var t = j.thumbnail_url || j.thumbnail_url_with_play_button;
        if (t && typeof t === "string") return t;
        throw new Error("no thumb");
      })
      .catch(function () {
        var mic = "https://api.microlink.io/?url=" + encodeURIComponent(u);
        return fetch(mic)
          .then(function (r) {
            if (!r.ok) throw new Error("microlink");
            return r.json();
          })
          .then(function (j) {
            var imgUrl = j.data && j.data.image && j.data.image.url;
            if (imgUrl) return imgUrl;
            throw new Error("no image");
          });
      })
      .catch(function () {
        return null;
      });
  }

  function clearItemThumbUrl(itemId) {
    state.items = state.items.map(function (x) {
      if (x.id !== itemId) return x;
      var o = {};
      for (var k in x) {
        if (k !== "thumbUrl") o[k] = x[k];
      }
      return o;
    });
    persist();
  }

  function queueFacebookThumbFetch(itemId) {
    if (!isNetworkHintOnline()) return;
    if (fbThumbPending[itemId] || fbThumbFailed[itemId]) return;
    var item = state.items.find(function (x) {
      return x.id === itemId;
    });
    if (!item || item.thumbUrl) return;
    if (detectSource(item.url) !== "facebook") return;
    fbThumbPending[itemId] = true;
    resolveFacebookThumbnail(item.url).then(function (thumb) {
      fbThumbPending[itemId] = false;
      if (!thumb) {
        fbThumbFailed[itemId] = true;
        return;
      }
      var cur = state.items.find(function (x) {
        return x.id === itemId;
      });
      if (!cur || cur.thumbUrl) return;
      state.items = state.items.map(function (x) {
        if (x.id !== itemId) return x;
        var o = {};
        for (var k in x) o[k] = x[k];
        o.thumbUrl = thumb;
        return o;
      });
      persist();
      render();
    });
  }

  function sortBlockedForManual() {
    return !!(state.search || state.filterTag || state.filterSource || state.filterFormat);
  }

  function canReorder() {
    return state.sort === "manual" && !sortBlockedForManual();
  }

  function getCardLiVisualOrder(listEl) {
    var rows = Array.prototype.slice.call(listEl.querySelectorAll(":scope > li.card-li"));
    return rows
      .map(function (el) {
        var r = el.getBoundingClientRect();
        return { el: el, top: r.top, left: r.left, height: r.height };
      })
      .sort(function (a, b) {
        if (Math.abs(a.top - b.top) > 14) return a.top - b.top;
        return a.left - b.left;
      })
      .map(function (x) {
        return x.el;
      });
  }

  function getVisualItemIds(listEl) {
    return getCardLiVisualOrder(listEl)
      .map(function (el) {
        return el.dataset.itemId;
      })
      .filter(Boolean);
  }

  function visualIndexOfItem(listEl, itemId) {
    var ids = getVisualItemIds(listEl);
    return ids.indexOf(itemId);
  }

  function pickDropFinalIndex(listEl, clientY) {
    var ordered = getCardLiVisualOrder(listEl);
    var n = ordered.length;
    if (!n) return 0;
    for (var i = 0; i < n; i++) {
      var r = ordered[i].getBoundingClientRect();
      var mid = r.top + r.height / 2;
      if (clientY <= mid) return i;
    }
    return n;
  }

  var reorderPointer = null;

  function bindReorderHandle(btn, itemId, listEl) {
    btn.addEventListener("pointerdown", function (e) {
      if (!canReorder()) return;
      e.preventDefault();
      e.stopPropagation();
      var fromIdx = visualIndexOfItem(listEl, itemId);
      if (fromIdx < 0) return;
      btn.setPointerCapture(e.pointerId);
      reorderPointer = {
        pointerId: e.pointerId,
        itemId: itemId,
        fromIdx: fromIdx,
        listEl: listEl,
        btn: btn,
        lastTo: fromIdx,
      };
      var li = btn.closest(".card-li");
      if (li) li.classList.add("card-li--dragging");
      document.body.classList.add("is-reordering");
    });

    btn.addEventListener("pointermove", function (e) {
      if (!reorderPointer || reorderPointer.pointerId !== e.pointerId) return;
      e.preventDefault();
      var to = pickDropFinalIndex(reorderPointer.listEl, e.clientY);
      if (to === reorderPointer.lastTo) return;
      reorderPointer.lastTo = to;
      reorderPointer.listEl.querySelectorAll(".card-li").forEach(function (c) {
        c.classList.remove("card-li--drag-target");
      });
      var ordered = getCardLiVisualOrder(reorderPointer.listEl);
      var hi = Math.min(Math.max(0, to), ordered.length - 1);
      if (ordered[hi]) ordered[hi].classList.add("card-li--drag-target");
    });

    function endDrag(e) {
      if (!reorderPointer || reorderPointer.pointerId !== e.pointerId) return;
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch (ex) {}
      var from = reorderPointer.fromIdx;
      var to = reorderPointer.lastTo;
      var movedId = reorderPointer.itemId;
      var listElRef = reorderPointer.listEl;
      reorderPointer.listEl.querySelectorAll(".card-li").forEach(function (c) {
        c.classList.remove("card-li--dragging", "card-li--drag-target");
      });
      document.body.classList.remove("is-reordering");
      reorderPointer = null;
      if (from !== to && from >= 0 && to >= 0 && movedId) {
        var ids = getVisualItemIds(listElRef);
        var fromId = ids.indexOf(movedId);
        if (fromId < 0) return;
        ids.splice(fromId, 1);
        var toClamped = Math.min(Math.max(0, to), ids.length);
        ids.splice(toClamped, 0, movedId);
        var byId = {};
        state.items.forEach(function (x) {
          byId[x.id] = x;
        });
        var reordered = ids
          .map(function (id) {
            return byId[id];
          })
          .filter(Boolean);
        var pinned = [];
        var unpinned = [];
        reordered.forEach(function (x) {
          if (x.pinned) pinned.push(x);
          else unpinned.push(x);
        });
        state.items = pinned.concat(unpinned);
        persist();
        render();
        showToast("Đã đổi thứ tự");
      }
    }

    btn.addEventListener("pointerup", endDrag);
    btn.addEventListener("pointercancel", endDrag);
  }

  function updateSortHint() {
    var el = $("sortHint");
    if (!el) return;
    if (state.sort === "manual") {
      el.hidden = false;
      if (sortBlockedForManual()) {
        el.textContent = "Tắt tìm kiếm và mọi bộ lọc để kéo đổi vị trí.";
      } else if (state.viewMode !== "list") {
        el.textContent = "Dùng chế độ danh sách để kéo dễ hơn. Mục ghim luôn ở trên.";
      } else {
        el.textContent = "Mục ghim luôn ở trên. Giữ nút ⋮⋮ và kéo để đổi thứ tự.";
      }
    } else {
      el.hidden = true;
    }
  }

  function setSearchExpanded(on) {
    state.searchExpanded = !!on;
    var wrap = $("searchInputWrap");
    var btn = $("btnToggleSearch");
    var filters = $("filtersPanel");
    if (wrap) {
      wrap.hidden = !state.searchExpanded;
      wrap.setAttribute("aria-hidden", state.searchExpanded ? "false" : "true");
    }
    if (btn) {
      btn.setAttribute("aria-expanded", state.searchExpanded ? "true" : "false");
      btn.setAttribute("aria-label", state.searchExpanded ? "Thu gọn ô tìm kiếm" : "Mở ô tìm kiếm");
      btn.title = state.searchExpanded ? "Thu gọn ô tìm kiếm" : "Mở ô tìm kiếm";
    }
    if (filters) filters.classList.toggle("filters--search-open", state.searchExpanded);
    if (state.searchExpanded && $("searchInput")) {
      $("searchInput").focus();
    }
  }

  function updateSearchChipIndicator() {
    var btn = $("btnToggleSearch");
    if (!btn) return;
    btn.classList.toggle("is-active", !!state.search);
  }

  function closeSortMenu() {
    var p = $("sortMenuPopover");
    var b = $("btnSortMenu");
    var wrap = $("sortMenuWrap");
    var bar = document.querySelector(".content-toolbar");
    if (p) p.hidden = true;
    if (b) {
      b.setAttribute("aria-expanded", "false");
      b.classList.remove("is-active");
    }
    if (wrap) wrap.classList.remove("is-open");
    if (bar) bar.classList.remove("is-sort-open");
  }

  function toggleSortMenu() {
    var p = $("sortMenuPopover");
    var b = $("btnSortMenu");
    var wrap = $("sortMenuWrap");
    var bar = document.querySelector(".content-toolbar");
    if (!p || !b) return;
    var willOpen = p.hidden;
    closeAllCardMenus();
    if (willOpen) {
      state.sortSuppressDocClose = true;
      p.hidden = false;
      b.setAttribute("aria-expanded", "true");
      b.classList.add("is-active");
      if (wrap) wrap.classList.add("is-open");
      if (bar) bar.classList.add("is-sort-open");
    } else {
      closeSortMenu();
    }
  }

  function closeAllCardMenus() {
    document.querySelectorAll(".card__dropdown").forEach(function (d) {
      d.hidden = true;
    });
    document.querySelectorAll(".card__more").forEach(function (btn) {
      btn.setAttribute("aria-expanded", "false");
    });
    document.querySelectorAll(".card-li--menu-open").forEach(function (li) {
      li.classList.remove("card-li--menu-open");
    });
  }

  function togglePinItem(id) {
    var it = state.items.find(function (x) {
      return x.id === id;
    });
    if (!it) return;
    it.pinned = !it.pinned;
    persist();
    render();
    showToast(it.pinned ? "Đã ghim — luôn hiển thị trên cùng" : "Đã bỏ ghim");
  }

  function performDeleteItem(id) {
    var n = state.items.length;
    state.items = state.items.filter(function (x) {
      return x.id !== id;
    });
    if (state.items.length < n) {
      persist();
      render();
      showToast("Đã xóa");
    }
  }

  function svgSortMenuClock() {
    return (
      '<svg class="toolbar__svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M12 8v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  function updateSortMenuIcon() {
    var el = $("sortMenuIcon");
    if (!el) return;
    if (state.sort === "newest") el.innerHTML = svgSortMenuClock();
    else if (state.sort === "title") el.innerHTML = '<span class="sort-menu__icon-text" aria-hidden="true">A↓</span>';
    else el.innerHTML = '<span class="sort-menu__icon-grip" aria-hidden="true">⋮⋮</span>';
    syncSortMenuLabel();
  }

  function syncSortMenuItems() {
    document.querySelectorAll("#sortMenuPopover [data-sort-mode]").forEach(function (btn) {
      var mode = btn.getAttribute("data-sort-mode");
      btn.classList.toggle("is-selected", mode === state.sort);
    });
  }

  function initSortMenuDecor() {
    var icons = document.querySelectorAll("#sortMenuPopover .sort-menu__item-icon");
    if (icons[0]) icons[0].innerHTML = svgSortMenuClock();
    if (icons[1]) icons[1].innerHTML = '<span class="sort-menu__mini">A↓</span>';
    if (icons[2]) icons[2].innerHTML = '<span class="sort-menu__mini sort-menu__mini--grip">⋮⋮</span>';
  }

  function applySort(next) {
    if (next === state.sort) return;
    if (next === "manual") {
      if (sortBlockedForManual()) {
        showToast("Tắt tìm kiếm và mọi bộ lọc để dùng thứ tự kéo.");
        syncSortMenuItems();
        updateSortMenuIcon();
        closeSortMenu();
        return;
      }
      var ordered = getFilteredSorted();
      var pinned = [];
      var unpinned = [];
      ordered.forEach(function (x) {
        if (x.pinned) pinned.push(x);
        else unpinned.push(x);
      });
      state.items = pinned.concat(unpinned);
      setViewMode("list");
    }
    state.sort = next;
    closeSortMenu();
    render();
  }

  function appendCardContentCluster(card, item, opts) {
    opts = opts || {};
    var isPreview = !!opts.isPreview;
    var src = detectSource(item.url);
    var tw = thumbWrapForUrl(item.url);

    var cluster = document.createElement("div");
    cluster.className = "card__content-cluster";

    var thumbCol = document.createElement("div");
    thumbCol.className = "card__thumb-col";

    var thumbWrap = document.createElement("a");
    thumbWrap.className = "card__thumb-link";
    thumbWrap.href = item.url;
    thumbWrap.target = "_blank";
    thumbWrap.rel = "noopener noreferrer";
    thumbWrap.setAttribute("aria-label", "Mở video / trang");

    if (tw.kind === "youtube") {
      var img = document.createElement("img");
      img.className = "card__thumb";
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      img.src = tw.urls[0];
      img.onerror = function () {
        if (tw.urls[1] && img.src !== tw.urls[1]) img.src = tw.urls[1];
      };
      thumbWrap.appendChild(img);
    } else if (item.thumbUrl && src === "facebook") {
      var imgFb = document.createElement("img");
      imgFb.className = "card__thumb";
      imgFb.alt = "";
      imgFb.decoding = "async";
      imgFb.loading = "lazy";
      imgFb.referrerPolicy = "no-referrer";
      imgFb.src = item.thumbUrl;
      imgFb.onerror = function () {
        if (isPreview) {
          var phPrev = document.createElement("div");
          phPrev.className = "card__thumb card__thumb--" + tw.platform;
          phPrev.setAttribute("aria-hidden", "true");
          thumbWrap.replaceChildren(phPrev);
          return;
        }
        fbThumbFailed[item.id] = true;
        clearItemThumbUrl(item.id);
        render();
      };
      thumbWrap.appendChild(imgFb);
    } else {
      var ph = document.createElement("div");
      ph.className = "card__thumb card__thumb--" + tw.platform;
      ph.setAttribute("aria-hidden", "true");
      thumbWrap.appendChild(ph);
    }
    thumbCol.appendChild(thumbWrap);
    cluster.appendChild(thumbCol);

    var main = document.createElement("div");
    main.className = "card__main";

    var titleEl = document.createElement("h3");
    titleEl.className = "card__title";
    if (item.pinned) {
      var pinMark = document.createElement("span");
      pinMark.className = "card__pin";
      pinMark.setAttribute("aria-label", "Đã ghim");
      pinMark.title = "Đã ghim — luôn hiển thị trên cùng";
      pinMark.innerHTML =
        '<svg class="card__pin-svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
        '<path fill="currentColor" d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5v7l1 1 1-1v-7h5v-2c-1.66 0-3-1.34-3-3z"/>' +
        "</svg>";
      titleEl.appendChild(pinMark);
    }
    var link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.title || item.url;
    titleEl.appendChild(link);
    main.appendChild(titleEl);

    var meta = document.createElement("div");
    meta.className = "card__meta";
    meta.textContent = sourceLabel(src) + " · " + formatDate(item.createdAt);
    main.appendChild(meta);

    var tagsDiv = document.createElement("div");
    tagsDiv.className = "card__tags";
    (item.tags || []).forEach(function (t) {
      var pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = t;
      tagsDiv.appendChild(pill);
    });
    if (tagsDiv.children.length) main.appendChild(tagsDiv);

    var noteText = (item.note || "").trim();
    if (noteText && !isPreview) {
      var note = document.createElement("p");
      note.className = "card__note card__note--thumb-title-row";
      note.textContent = noteText;
      main.appendChild(note);
    }

    cluster.appendChild(main);
    card.appendChild(cluster);
  }

  function formPreviewItemFromForm() {
    var url = $("urlInput").value.trim();
    var title = $("titleInput").value.trim();
    var editingItem =
      state.editingId &&
      state.items.find(function (x) {
        return x.id === state.editingId;
      });
    var sameUrl = editingItem && (editingItem.url || "").trim() === url;
    return {
      url: url,
      title: title || suggestTitleLocal(url),
      note: ($("noteInput").value || "").trim(),
      tags: (state.formTags || []).slice(),
      pinned: editingItem ? !!editingItem.pinned : false,
      createdAt: editingItem ? editingItem.createdAt : new Date().toISOString(),
      id: editingItem ? editingItem.id : null,
      thumbUrl: sameUrl && detectSource(url) === "facebook" ? editingItem.thumbUrl : null,
    };
  }

  function syncEditFormCounters() {
    var ti = $("titleInput");
    var ni = $("noteInput");
    var tc = $("titleCharCount");
    var nc = $("noteCharCount");
    if (ti && tc) tc.textContent = (ti.value || "").length + "/100";
    if (ni && nc) nc.textContent = (ni.value || "").length + "/200";
  }

  function fillEditPreviewMedia(mediaEl, item) {
    var tw = thumbWrapForUrl(item.url);
    var fmt = item.format || detectFormat(item.url, item.source);
    var src = item.source || detectSource(item.url);

    if (tw.kind === "youtube") {
      var img = document.createElement("img");
      img.className = "edit-preview__img";
      img.alt = "";
      img.decoding = "async";
      img.src = tw.urls[0];
      img.onerror = function () {
        if (tw.urls[1] && img.src !== tw.urls[1]) img.src = tw.urls[1];
      };
      mediaEl.appendChild(img);
      if (fmt === "video" || fmt === "reel") {
        appendPlayOverlay(mediaEl);
        var dur = document.createElement("span");
        dur.className = "edit-preview__duration";
        dur.textContent = fmt === "reel" ? "Short" : "Video";
        mediaEl.appendChild(dur);
      }
    } else if (item.thumbUrl && src === "facebook") {
      var imgFb = document.createElement("img");
      imgFb.className = "edit-preview__img";
      imgFb.alt = "";
      imgFb.decoding = "async";
      imgFb.referrerPolicy = "no-referrer";
      imgFb.src = item.thumbUrl;
      mediaEl.appendChild(imgFb);
      if (fmt === "video" || fmt === "reel") appendPlayOverlay(mediaEl);
    } else {
      var ph = document.createElement("div");
      ph.className = "edit-preview__ph edit-preview__ph--" + (tw.platform || "website");
      ph.setAttribute("aria-hidden", "true");
      mediaEl.appendChild(ph);
      if (fmt === "video" || fmt === "reel" || fmt === "audio") appendPlayOverlay(mediaEl);
    }

    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit-preview__edit";
    editBtn.setAttribute("aria-label", "Sửa tiêu đề");
    editBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.5 6.5l3 3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
    editBtn.addEventListener("click", function (e) {
      e.preventDefault();
      var ti = $("titleInput");
      if (ti) ti.focus();
    });
    mediaEl.appendChild(editBtn);
  }

  function renderFormPreview() {
    var box = $("formPreview");
    if (!box) return;
    var url = $("urlInput").value.trim();
    if (!url) {
      box.hidden = true;
      box.innerHTML = "";
      updateSourceBadge();
      return;
    }
    try {
      new URL(url);
    } catch (err) {
      box.hidden = true;
      box.innerHTML = "";
      updateSourceBadge();
      return;
    }
    box.hidden = false;
    box.innerHTML = "";
    box.className = "edit-preview";

    var item = formPreviewItemFromForm();
    ensureItemMeta(item);
    var src = item.source || detectSource(url);

    var card = document.createElement("article");
    card.className = "edit-preview__card";

    var media = document.createElement("div");
    media.className = "edit-preview__media";
    fillEditPreviewMedia(media, item);
    card.appendChild(media);

    var body = document.createElement("div");
    body.className = "edit-preview__body";
    var titleEl = document.createElement("h3");
    titleEl.className = "edit-preview__title";
    titleEl.textContent = item.title || url;
    body.appendChild(titleEl);
    var meta = document.createElement("p");
    meta.className = "edit-preview__meta";
    meta.textContent = formatRelativeTime(item.createdAt);
    body.appendChild(meta);
    card.appendChild(body);

    box.appendChild(card);
    updateSourceBadge();
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("vi-VN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }

  function formatRelativeTime(iso) {
    try {
      var sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (sec < 45) return "Vừa xong";
      var min = Math.floor(sec / 60);
      if (min < 60) return min + " phút trước";
      var hr = Math.floor(min / 60);
      if (hr < 24) return hr + " giờ trước";
      var day = Math.floor(hr / 24);
      if (day < 7) return day + " ngày trước";
      if (day < 30) return Math.floor(day / 7) + " tuần trước";
      return formatDate(iso);
    } catch (e) {
      return "";
    }
  }

  function tagPillTone(tag) {
    var h = 0;
    var s = tag || "";
    for (var i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % 6;
    return "grid-card__tag-tone--" + h;
  }

  function sourceIconLetter(src) {
    var map = {
      youtube: "▶",
      tiktok: "♪",
      instagram: "◎",
      facebook: "f",
      twitter: "𝕏",
      medium: "M",
      spotify: "♫",
      github: "⌂",
      website: "🔗",
    };
    return map[src] || "•";
  }

  function appendSourceBadge(mediaEl, src) {
    var el = document.createElement("span");
    el.className = "grid-card__source-badge grid-card__source-badge--" + (src || "website");
    el.setAttribute("aria-hidden", "true");
    el.textContent = sourceIconLetter(src);
    mediaEl.appendChild(el);
  }

  function appendPlayOverlay(mediaEl) {
    var play = document.createElement("span");
    play.className = "grid-card__play";
    play.setAttribute("aria-hidden", "true");
    play.innerHTML =
      '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M9 7.5l9 4.5-9 4.5V7.5z" fill="currentColor"/></svg>';
    mediaEl.appendChild(play);
  }

  var SORT_LABELS = { newest: "Mới nhất", title: "Theo tên A–Z", manual: "Tự kéo" };

  function syncSortMenuLabel() {
    var el = $("sortMenuLabel");
    if (el) el.textContent = SORT_LABELS[state.sort] || "Mới nhất";
  }

  function setViewMode(mode) {
    state.viewMode = mode === "list" ? "list" : "grid";
    var list = $("itemList");
    var btnGrid = $("btnViewGrid");
    var btnList = $("btnViewList");
    if (list) {
      list.classList.toggle("masonry--grid", state.viewMode === "grid");
      list.classList.toggle("masonry--list", state.viewMode === "list");
    }
    if (btnGrid) {
      btnGrid.classList.toggle("is-active", state.viewMode === "grid");
      btnGrid.setAttribute("aria-pressed", state.viewMode === "grid" ? "true" : "false");
    }
    if (btnList) {
      btnList.classList.toggle("is-active", state.viewMode === "list");
      btnList.setAttribute("aria-pressed", state.viewMode === "list" ? "true" : "false");
    }
  }

  function showToast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      el.hidden = true;
    }, 2200);
  }

  function setFormUrlGroupVisible(show) {
    var g = $("formUrlGroup");
    var u = $("urlInput");
    if (g) g.hidden = !show;
    if (u) u.required = !!show;
  }

  function openModal() {
    closeProfileSheet();
    $("modal").hidden = false;
    $("modalTitle").textContent = "Chỉnh sửa link";
    setFormUrlGroupVisible(true);
    document.body.style.overflow = "hidden";
    refreshNetworkUi();
  }


  function closeModal() {
    clearEditAutoTitleTimer();
    closeQuickSheet();
    $("modal").hidden = true;
    document.body.style.overflow = "";
    state.editingId = null;
    $("itemForm").reset();
    $("editId").value = "";
    state.formTags = [];
    state.formTagPickerExtra = [];
    state.formTagManageMode = false;
    state.formTagAddOpen = false;
    state.formInfoOpen = false;
    state.editTitleTouched = false;
    setFormUrlGroupVisible(false);
    syncFormTagManageUi();
    closeFormInfoPopover();
    var tagWrap = $("formTagInputWrap");
    if (tagWrap) tagWrap.hidden = true;
    renderFormTagChips();
    updateSourceBadge();
    var fp = $("formPreview");
    if (fp) {
      fp.hidden = true;
      fp.innerHTML = "";
    }
    closeSortMenu();
    closeAllCardMenus();
    closeProfileSheet();
  }

  function tagsForFormPicker() {
    var set = {};
    var base = [];
    function addBase(tag) {
      var n = normalizeTag(tag);
      if (!n || set[n] || isTagDeleted(n)) return;
      set[n] = true;
      base.push(n);
    }
    PRESET_TAGS.forEach(addBase);
    uniqueTagsFromItems().forEach(addBase);
    base.sort(function (a, b) {
      return a.localeCompare(b, "vi");
    });
    var tail = [];
    function addTail(tag) {
      var n = normalizeTag(tag);
      if (n && !set[n]) {
        set[n] = true;
        tail.push(n);
      }
    }
    state.formTagPickerExtra.forEach(addTail);
    state.formTags.forEach(addTail);
    return base.concat(tail);
  }

  function deleteTagGlobally(tag) {
    var n = normalizeTag(tag);
    if (!n) return;
    if (!isTagDeleted(n)) {
      state.deletedTags.push(n);
      persistDeletedTags();
    }
    if (state.filterTag === n) state.filterTag = null;
    state.items = state.items.map(function (item) {
      var tags = (item.tags || []).filter(function (t) {
        return normalizeTag(t) !== n;
      });
      if (tags.length === (item.tags || []).length) return item;
      var o = {};
      for (var k in item) o[k] = item[k];
      o.tags = tags;
      return o;
    });
    state.formTags = state.formTags.filter(function (t) {
      return normalizeTag(t) !== n;
    });
    state.formTagPickerExtra = state.formTagPickerExtra.filter(function (t) {
      return normalizeTag(t) !== n;
    });
    persist();
    renderFormTagChips();
    render();
    showToast("Đã xóa thẻ");
  }

  function syncFormTagManageUi() {
    var btn = $("btnFormTagManage");
    var toolbar = $("formTagsToolbar");
    var chips = $("formTagChips");
    var hint = $("formTagManageHint");
    if (btn) {
      btn.textContent = state.formTagManageMode ? "Xong" : "Quản lý";
      btn.setAttribute("aria-pressed", state.formTagManageMode ? "true" : "false");
      btn.classList.toggle("is-active", state.formTagManageMode);
    }
    if (toolbar) toolbar.classList.toggle("is-manage", state.formTagManageMode);
    if (chips) chips.classList.toggle("is-manage", state.formTagManageMode);
    if (hint) hint.hidden = !state.formTagManageMode;
  }

  function setFormTagManageMode(open) {
    state.formTagManageMode = !!open;
    if (state.formTagManageMode) {
      state.formTagAddOpen = false;
      var wi = $("formTagInputWrap");
      if (wi) wi.hidden = true;
    }
    syncFormTagManageUi();
    renderFormTagChips();
  }

  function closeFormInfoPopover() {
    if (!state.formInfoOpen) return;
    state.formInfoOpen = false;
    syncFormInfoUi();
  }

  function positionFormInfoPopover() {
    var btn = $("btnToggleNote");
    var pop = $("formInfoPopover");
    if (!btn || !pop || pop.hidden) return;
    pop.style.visibility = "hidden";
    pop.style.top = "0";
    pop.style.left = "0";
    var mw = pop.offsetWidth;
    var mh = pop.offsetHeight;
    var rect = btn.getBoundingClientRect();
    var top = rect.bottom + 6;
    var left = rect.right - mw;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    if (top + mh > window.innerHeight - 8) {
      top = Math.max(8, rect.top - mh - 6);
    }
    pop.style.top = top + "px";
    pop.style.left = left + "px";
    pop.style.visibility = "visible";
  }

  function syncFormInfoUi() {
    var btn = $("btnToggleNote");
    var pop = $("formInfoPopover");
    if (!btn || !pop) return;
    pop.hidden = !state.formInfoOpen;
    pop.setAttribute("aria-hidden", state.formInfoOpen ? "false" : "true");
    btn.setAttribute("aria-expanded", state.formInfoOpen ? "true" : "false");
    btn.classList.toggle("is-active", state.formInfoOpen);
    if (state.formInfoOpen) {
      requestAnimationFrame(positionFormInfoPopover);
    }
  }

  function setFormInfoOpen(open) {
    state.formInfoOpen = !!open;
    syncFormInfoUi();
  }

  function editTagToneClass(tag) {
    return tagPillTone(tag).replace("grid-card__tag-tone", "edit-tag-pill--tone");
  }

  function renderFormTagChips() {
    var wrap = $("formTagChips");
    if (!wrap) return;
    wrap.innerHTML = "";

    var pickerTags = tagsForFormPicker();
    if (!pickerTags.length) {
      var empty = document.createElement("p");
      empty.className = "edit-tags__empty";
      empty.textContent = "Chưa có thẻ — bấm + để tạo mới";
      wrap.appendChild(empty);
    }

    pickerTags.forEach(function (tag) {
      var n = normalizeTag(tag);
      var selected = state.formTags.some(function (t) {
        return normalizeTag(t) === n;
      });

      var chip = document.createElement("span");
      chip.className =
        "edit-tag-chip" + (selected ? " edit-tag-chip--selected " + editTagToneClass(tag) : " edit-tag-chip--option");

      var toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "edit-tag-chip__toggle";
      toggleBtn.textContent = tag;
      toggleBtn.setAttribute("aria-pressed", selected ? "true" : "false");
      toggleBtn.setAttribute("aria-label", selected ? "Bỏ chọn thẻ " + tag : "Chọn thẻ " + tag);
      toggleBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (selected) {
          state.formTags = state.formTags.filter(function (t) {
            return normalizeTag(t) !== n;
          });
        } else {
          state.formTags.push(tag);
        }
        renderFormTagChips();
      });
      chip.appendChild(toggleBtn);

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "edit-tag-chip__delete";
      deleteBtn.textContent = "×";
      deleteBtn.setAttribute("aria-label", "Xóa thẻ " + tag + " khỏi thư viện");
      deleteBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteTagGlobally(tag);
      });
      chip.appendChild(deleteBtn);

      wrap.appendChild(chip);
    });

    var addBtn = $("btnFormTagAdd");
    if (addBtn) {
      addBtn.setAttribute("aria-expanded", state.formTagAddOpen ? "true" : "false");
    }
    var wi = $("formTagInputWrap");
    if (wi) wi.hidden = !state.formTagAddOpen || state.formTagManageMode;
    syncFormTagManageUi();
    if (!$("modal").hidden) renderFormPreview();
  }

  function addFormTag(tag) {
    var n = normalizeTag(tag);
    if (!n) return;
    if (isTagDeleted(n)) {
      state.deletedTags = state.deletedTags.filter(function (t) {
        return normalizeTag(t) !== n;
      });
      persistDeletedTags();
    }
    var inForm = state.formTags.some(function (t) {
      return normalizeTag(t) === n;
    });
    if (!inForm) state.formTags.push(n);
    if (state.formTagPickerExtra.indexOf(n) === -1) state.formTagPickerExtra.push(n);
    renderFormTagChips();
  }

  function resolveQuickTitle(url) {
    return new Promise(function (resolve) {
      var trimmed = url.trim();
      if (detectSource(trimmed) === "youtube" && isNetworkHintOnline()) {
        fetchYoutubeTitle(trimmed)
          .then(resolve)
          .catch(function () {
            resolve(suggestTitleLocal(trimmed));
          });
      } else {
        resolve(suggestTitleLocal(trimmed));
      }
    });
  }

  function clearEditAutoTitleTimer() {
    if (editAutoTitleTimer) {
      clearTimeout(editAutoTitleTimer);
      editAutoTitleTimer = null;
    }
  }

  function scheduleEditAutoTitle() {
    clearEditAutoTitleTimer();
    editAutoTitleTimer = setTimeout(function () {
      editAutoTitleTimer = null;
      runEditAutoTitle(true);
    }, 420);
  }

  function runEditAutoTitle(forceApply) {
    if ($("modal").hidden) return;
    if (!$("editId").value) return;
    var url = $("urlInput").value.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch (e) {
      return;
    }
    resolveQuickTitle(url).then(function (title) {
      if ($("modal").hidden) return;
      if (!forceApply && state.editTitleTouched) return;
      var ti = $("titleInput");
      if (ti) ti.value = title;
      state.editTitleTouched = false;
      renderFormPreview();
    });
  }

  function getHeaderUrlValue() {
    var el = $("headerUrlInput");
    if (!el) return "";
    return (el.value || "").trim();
  }

  function clearHeaderUrlValue() {
    var el = $("headerUrlInput");
    if (el) el.value = "";
  }

  function setHeaderUrlValue(text) {
    var el = $("headerUrlInput");
    if (el) el.value = (text || "").trim();
  }

  function blurHeaderUrlInput() {
    var el = $("headerUrlInput");
    if (el && document.activeElement === el) el.blur();
  }

  function isAppleMobile() {
    if (typeof navigator === "undefined") return false;
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }

  function applyPastedHeaderUrl(text) {
    var raw = (text || "").trim();
    if (!raw) {
      showToast("Chưa có link trong clipboard");
      return false;
    }
    setHeaderUrlValue(raw);
    blurHeaderUrlInput();
    return true;
  }

  function promptManualHeaderPaste() {
    var input = $("headerUrlInput");
    if (!input) return;
    input.focus({ preventScroll: true });
    try {
      input.setSelectionRange(0, 0);
    } catch (e) {}
    showToast(
      isAppleMobile()
        ? "Nhấn giữ ô link → Dán, hoặc chọn «Cho phép dán» khi Safari hỏi"
        : "Nhấn Ctrl+V hoặc nhấn giữ ô link rồi chọn Dán"
    );
  }

  function pasteIntoHeaderFromClipboard() {
    var input = $("headerUrlInput");
    if (!input) return Promise.resolve();

    if (!window.isSecureContext) {
      promptManualHeaderPaste();
      return Promise.resolve();
    }

    if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
      promptManualHeaderPaste();
      return Promise.resolve();
    }

    return navigator.clipboard
      .readText()
      .then(function (text) {
        applyPastedHeaderUrl(text);
      })
      .catch(function () {
        promptManualHeaderPaste();
      });
  }

  function quickAddFromHeader() {
    if (headerQuickAddBusy) return;
    var btn = $("btnQuickAdd");
    var raw = getHeaderUrlValue();
    if (!raw) {
      showToast("Nhấn Dán hoặc dán link vào ô rồi nhấn +");
      return;
    }
    try {
      new URL(raw);
    } catch (e) {
      showToast("URL không hợp lệ");
      clearHeaderUrlValue();
      return;
    }
    headerQuickAddBusy = true;
    if (btn) btn.disabled = true;
    clearHeaderUrlValue();
    resolveQuickTitle(raw)
      .then(function (title) {
        var tags = [];
        if (state.filterTag) tags = [state.filterTag];
        var newId = crypto.randomUUID
          ? crypto.randomUUID()
          : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        state.items.unshift(
          buildItemFromUrl(raw, {
            id: newId,
            title: title,
            note: "",
            tags: tags,
            createdAt: new Date().toISOString(),
            pinned: false,
          })
        );
        persist();
        render();
        if (detectSource(raw) === "facebook") queueFacebookThumbFetch(newId);
        showToast("Đã lưu");
      })
      .catch(function () {
        setHeaderUrlValue(raw);
        showToast("Không thêm được — thử lại");
      })
      .finally(function () {
        headerQuickAddBusy = false;
        if (btn) btn.disabled = false;
      });
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function renderTagFilters() {
    var wrap = $("tagFilters");
    if (!wrap) return;
    wrap.innerHTML = "";

    var all = document.createElement("button");
    all.type = "button";
    all.className = "chip" + (state.filterTag ? "" : " is-active");
    all.textContent = "Tất cả";
    all.addEventListener("click", function () {
      state.filterTag = null;
      render();
    });
    wrap.appendChild(all);

    allTagsForFilter().forEach(function (tag) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (state.filterTag === tag ? " is-active" : "");
      btn.textContent = tag;
      btn.addEventListener("click", function () {
        state.filterTag = state.filterTag === tag ? null : tag;
        render();
      });
      wrap.appendChild(btn);
    });
  }

  function fillGridCardMedia(mediaEl, item) {
    ensureItemMeta(item);
    var tw = thumbWrapForUrl(item.url);
    var fmt = item.format || "website";
    var src = item.source || detectSource(item.url);
    appendSourceBadge(mediaEl, src);
    if (fmt === "tweet") {
      var tweet = document.createElement("p");
      tweet.className = "grid-card__tweet";
      tweet.textContent = item.title || item.url;
      mediaEl.appendChild(tweet);
      return;
    }
    if (tw.kind === "youtube") {
      var img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      img.src = tw.urls[0];
      img.onerror = function () {
        if (tw.urls[1] && img.src !== tw.urls[1]) img.src = tw.urls[1];
      };
      mediaEl.appendChild(img);
      if (fmt === "video" || fmt === "reel") {
        appendPlayOverlay(mediaEl);
        var dur = document.createElement("span");
        dur.className = "grid-card__duration";
        dur.textContent = fmt === "reel" ? "Short" : "Video";
        mediaEl.appendChild(dur);
      }
      return;
    }
    if (item.thumbUrl && item.source === "facebook") {
      var imgFb = document.createElement("img");
      imgFb.alt = "";
      imgFb.decoding = "async";
      imgFb.loading = "lazy";
      imgFb.referrerPolicy = "no-referrer";
      imgFb.src = item.thumbUrl;
      imgFb.onerror = function () {
        fbThumbFailed[item.id] = true;
        clearItemThumbUrl(item.id);
        render();
      };
      mediaEl.appendChild(imgFb);
      if (fmt === "video" || fmt === "reel") appendPlayOverlay(mediaEl);
      return;
    }
    if (fmt === "video" || fmt === "reel" || fmt === "audio") {
      appendPlayOverlay(mediaEl);
    }
    var ph = document.createElement("div");
    ph.className = "grid-card__ph grid-card__ph--" + (tw.platform || "website");
    ph.setAttribute("aria-hidden", "true");
    if (fmt === "pdf") ph.textContent = "PDF";
    mediaEl.appendChild(ph);
  }

  function buildCardMenu(item) {
    var menuWrap = document.createElement("div");
    menuWrap.className = "grid-card__menu-wrap card__menu-wrap";
    var moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "card__more";
    moreBtn.setAttribute("aria-label", "Thêm thao tác");
    moreBtn.setAttribute("aria-expanded", "false");
    moreBtn.innerHTML = "⋯";
    var dropdown = document.createElement("div");
    dropdown.className = "card__dropdown";
    dropdown.hidden = true;
    dropdown.setAttribute("role", "menu");

    function addMenuItem(label, fn, itemClass) {
      var m = document.createElement("button");
      m.type = "button";
      m.className = "card__dropdown-item" + (itemClass ? " " + itemClass : "");
      m.setAttribute("role", "menuitem");
      m.textContent = label;
      m.addEventListener("click", function (e) {
        e.stopPropagation();
        dropdown.hidden = true;
        moreBtn.setAttribute("aria-expanded", "false");
        fn();
      });
      dropdown.appendChild(m);
    }

    addMenuItem("Mở", function () {
      window.open(item.url, "_blank", "noopener,noreferrer");
    });
    addMenuItem("Sửa nhanh", function () {
      openQuickSheet(item);
    });
    addMenuItem("Sửa", function () {
      openEdit(item);
    });
    addMenuItem("Sao chép", function () {
      copyUrl(item.url);
    });
    addMenuItem(item.pinned ? "Bỏ ghim" : "Ghim lên đầu", function () {
      togglePinItem(item.id);
    });
    addMenuItem(
      "Xóa",
      function () {
        performDeleteItem(item.id);
      },
      "card__dropdown-item--danger"
    );

    moreBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var willOpen = dropdown.hidden;
      closeAllCardMenus();
      closeSortMenu();
      if (willOpen) {
        dropdown.hidden = false;
        moreBtn.setAttribute("aria-expanded", "true");
        var li = moreBtn.closest(".card-li");
        if (li) li.classList.add("card-li--menu-open");
      }
    });

    dropdown.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    menuWrap.appendChild(moreBtn);
    menuWrap.appendChild(dropdown);
    return menuWrap;
  }

  function buildCardFooter(item, card) {
    var foot = document.createElement("div");
    foot.className = "grid-card__foot";
    var tags = item.tags || [];
    if (tags.length) {
      var tagsWrap = document.createElement("div");
      tagsWrap.className = "grid-card__tags";
      tags.forEach(function (t) {
        var tagEl = document.createElement("span");
        tagEl.className = "grid-card__tag " + tagPillTone(t);
        tagEl.textContent = t;
        tagsWrap.appendChild(tagEl);
      });
      foot.appendChild(tagsWrap);
    } else {
      foot.classList.add("grid-card__foot--no-tag");
    }
    foot.appendChild(buildCardMenu(item));
    card.appendChild(foot);
  }

  function openQuickSheet(item) {
    closeAllCardMenus();
    closeModal();
    state.sheetEditingId = item.id;
    $("sheetTitleInput").value = item.title || "";
    $("sheetNoteInput").value = item.note || "";
    $("quickSheet").hidden = false;
    document.body.style.overflow = "hidden";
    $("sheetTitleInput").focus();
  }

  function closeQuickSheet() {
    $("quickSheet").hidden = true;
    state.sheetEditingId = null;
    if ($("modal").hidden) document.body.style.overflow = "";
  }

  function saveQuickSheet() {
    var id = state.sheetEditingId;
    if (!id) return;
    var title = $("sheetTitleInput").value.trim();
    var note = $("sheetNoteInput").value.trim();
    if (!title) {
      showToast("Tiêu đề không được trống");
      return;
    }
    state.items = state.items.map(function (x) {
      if (x.id !== id) return x;
      var o = {};
      for (var k in x) o[k] = x[k];
      o.title = title;
      o.note = note;
      return o;
    });
    persist();
    closeQuickSheet();
    render();
    showToast("Đã cập nhật");
  }

  function renderList() {
    var listEl = $("itemList");
    var emptyEl = $("emptyState");
    if (!listEl || !emptyEl) return;
    var filtered = getFilteredSorted();

    var countEl = $("resultCount");
    if (countEl) {
      countEl.textContent =
        filtered.length === state.items.length
          ? filtered.length + " mục"
          : filtered.length + " / " + state.items.length + " mục";
    }

    listEl.innerHTML = "";
    if (filtered.length === 0) {
      emptyEl.hidden = false;
      if (state.items.length > 0) {
        emptyEl.querySelector(".empty__title").textContent = "Không khớp bộ lọc";
        emptyEl.querySelector(".empty__text").textContent =
          "Thử bỏ lọc nguồn, định dạng, thẻ hoặc đổi từ khóa tìm kiếm.";
      } else {
        emptyEl.querySelector(".empty__title").textContent = "Chưa có liên kết nào";
        emptyEl.querySelector(".empty__text").innerHTML =
          "Copy link → dán vào ô phía trên → nhấn <strong>+</strong> để lưu.";
      }
      return;
    }

    emptyEl.hidden = true;

    filtered.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "card-li" + (item.pinned ? " card-li--pinned" : "");
      li.dataset.itemId = item.id;

      ensureItemMeta(item);
      var fmt = item.format || "website";

      if (canReorder() && filtered.length > 1) {
        var grab = document.createElement("button");
        grab.type = "button";
        grab.className = "grid-card__reorder";
        grab.setAttribute("aria-label", "Kéo để đổi vị trí");
        grab.innerHTML = "⋮⋮";
        bindReorderHandle(grab, item.id, listEl);
        li.appendChild(grab);
      }

      var card = document.createElement("article");
      card.className = "grid-card grid-card--" + fmt;

      var media = document.createElement("div");
      media.className = "grid-card__media";
      fillGridCardMedia(media, item);
      card.appendChild(media);

      var body = document.createElement("div");
      body.className = "grid-card__body";

      var title = document.createElement("h3");
      title.className = "grid-card__title";
      var link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.title || item.url;
      title.appendChild(link);
      body.appendChild(title);

      var meta = document.createElement("p");
      meta.className = "grid-card__meta";
      meta.textContent =
        formatLabel(item.format || "website") + " · " + formatRelativeTime(item.createdAt);
      body.appendChild(meta);

      card.appendChild(body);
      buildCardFooter(item, card);
      li.appendChild(card);
      listEl.appendChild(li);
    });

    var stagger = 0;
    filtered.forEach(function (item) {
      if (detectSource(item.url) !== "facebook") return;
      if (item.thumbUrl || fbThumbPending[item.id] || fbThumbFailed[item.id]) return;
      if (!isNetworkHintOnline()) return;
      stagger += 200;
      (function (itemId) {
        setTimeout(function () {
          queueFacebookThumbFetch(itemId);
        }, stagger);
      })(item.id);
    });
  }

  function copyUrl(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () {
          showToast("Đã sao chép link");
        },
        function () {
          fallbackCopy(url);
        }
      );
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast("Đã sao chép link");
    } catch (e) {
      showToast("Không sao chép được — hãy chọn link thủ công");
    }
    document.body.removeChild(ta);
  }

  function syncNoteInputFromItem(note) {
    var ni = $("noteInput");
    if (!ni) return;
    ni.value = note || "";
    syncEditFormCounters();
  }

  function openEdit(item, formOverrides) {
    formOverrides = formOverrides || {};
    ensureItemMeta(item);
    closeQuickSheet();
    state.editingId = item.id;
    state.formTags = (item.tags || []).slice();
    state.formTagPickerExtra = [];
    state.formTagManageMode = false;
    state.formTagAddOpen = false;
    state.formInfoOpen = false;
    state.editTitleTouched = false;
    openModal();
    $("editId").value = item.id;
    $("urlInput").value = item.url;
    $("titleInput").value = formOverrides.title != null ? formOverrides.title : item.title;
    syncNoteInputFromItem(formOverrides.note != null ? formOverrides.note : item.note);
    syncFormInfoUi();
    syncFormTagManageUi();
    renderFormTagChips();
    updateSourceBadge();
    syncEditFormCounters();
    renderFormPreview();
    runEditAutoTitle(false);
  }

  function render() {
    updateSortHint();
    renderSidebar();
    renderTagFilters();
    renderList();
    updateProfileStats();
    syncSortMenuItems();
    updateSortMenuIcon();
    updateSearchChipIndicator();
  }

  function init() {
    state.items = load();
    state.items = state.items.map(function (it) {
      return ensureItemMeta(it);
    });
    state.deletedTags = loadDeletedTags();

    on("btnQuickAdd", "click", function (e) {
      e.stopPropagation();
      quickAddFromHeader();
    });

    var headerUrlInput = $("headerUrlInput");
    var btnHeaderPaste = $("btnHeaderPaste");
    if (btnHeaderPaste) {
      btnHeaderPaste.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        pasteIntoHeaderFromClipboard();
      });
    }

    if (headerUrlInput) {
      headerUrlInput.addEventListener("click", function (e) {
        e.stopPropagation();
      });

      headerUrlInput.addEventListener("paste", function () {
        requestAnimationFrame(function () {
          setHeaderUrlValue(headerUrlInput.value);
        });
      });

      headerUrlInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          quickAddFromHeader();
        }
      });
    }

    var btnFormTagManage = $("btnFormTagManage");
    if (btnFormTagManage) {
      btnFormTagManage.addEventListener("click", function (e) {
        e.stopPropagation();
        setFormTagManageMode(!state.formTagManageMode);
      });
    }

    on("itemForm", "click", function (e) {
      if (state.formTagManageMode) return;
      var addChip = e.target.closest(".form-tag-chip--add");
      if (!addChip) return;
      e.preventDefault();
      e.stopPropagation();
      state.formTagAddOpen = !state.formTagAddOpen;
      var wi = $("formTagInputWrap");
      if (wi) wi.hidden = !state.formTagAddOpen;
      addChip.setAttribute("aria-expanded", state.formTagAddOpen ? "true" : "false");
      if (state.formTagAddOpen) $("tagInput").focus();
    });

    on("modalClose", "click", closeModal);
    on("modalBackdrop", "click", closeModal);
    on("btnCopyEditUrl", "click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var url = $("urlInput").value.trim();
      if (url) copyUrl(url);
    });

    on("btnFormTagAdd", "click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      state.formTagAddOpen = !state.formTagAddOpen;
      renderFormTagChips();
      if (state.formTagAddOpen) {
        var inp = $("tagInput");
        if (inp) inp.focus();
      }
    });

    window.addEventListener(
      "resize",
      function () {
        if (state.formInfoOpen) positionFormInfoPopover();
      },
      { passive: true }
    );

    on("btnToggleSearch", "click", function (e) {
      e.stopPropagation();
      setSearchExpanded(!state.searchExpanded);
    });

    on("searchInput", "focus", function () {
      setSearchExpanded(true);
    });

    on("searchInput", "input", function () {
      state.search = $("searchInput").value.trim();
      render();
    });

    on("btnSortMenu", "click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleSortMenu();
    });

    var sortPopover = $("sortMenuPopover");
    if (sortPopover) {
      sortPopover.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }

    document.querySelectorAll("#sortMenuPopover [data-sort-mode]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        closeSortMenu();
        applySort(btn.getAttribute("data-sort-mode"));
      });
    });

    document.addEventListener("click", function (e) {
      if (state.sortSuppressDocClose) {
        state.sortSuppressDocClose = false;
      } else if (!e.target.closest("#sortMenuWrap")) {
        closeSortMenu();
      }
      closeAllCardMenus();
      closeFormInfoPopover();
      if (!e.target.closest("#profileSheet")) closeProfileSheet();
      if (!e.target.closest("#settingsSheet") && !e.target.closest("#btnAppMenu")) {
        closeSettingsSheet();
      }
      if (state.sidebarSuppressDocClose) {
        state.sidebarSuppressDocClose = false;
        return;
      }
      if (document.body.classList.contains("sidebar-open")) {
        if (
          !e.target.closest("#sidebar") &&
          !e.target.closest("#btnSidebar") &&
          !e.target.closest("#sidebarScrim")
        ) {
          setSidebarOpen(false);
        }
      }
    });

    on("btnAppMenu", "click", function (e) {
      e.stopPropagation();
      toggleSettingsSheet();
    });

    on("settingsSheetBackdrop", "click", closeSettingsSheet);
    on("settingsSheetClose", "click", closeSettingsSheet);

    on("btnHeaderProfile", "click", function (e) {
      e.stopPropagation();
      var sheet = $("profileSheet");
      if (sheet && !sheet.hidden) closeProfileSheet();
      else openProfileSheet();
    });

    on("profileSheetBackdrop", "click", closeProfileSheet);
    on("profileSheetClose", "click", closeProfileSheet);

    var btnViewGrid = $("btnViewGrid");
    var btnViewList = $("btnViewList");
    if (btnViewGrid) {
      btnViewGrid.addEventListener("click", function () {
        setViewMode("grid");
      });
    }
    if (btnViewList) {
      btnViewList.addEventListener("click", function () {
        setViewMode("list");
      });
    }
    setViewMode(state.viewMode);

    on("urlInput", "input", function () {
      syncMetaFromUrl();
      renderFormPreview();
      scheduleEditAutoTitle();
    });

    on("titleInput", "input", function () {
      state.editTitleTouched = true;
      syncEditFormCounters();
      renderFormPreview();
    });
    var btnSidebar = $("btnSidebar");
    var sidebarScrim = $("sidebarScrim");
    if (btnSidebar) {
      btnSidebar.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var willOpen = !document.body.classList.contains("sidebar-open");
        if (willOpen) state.sidebarSuppressDocClose = true;
        setSidebarOpen(willOpen);
      });
    }
    if (sidebarScrim) {
      sidebarScrim.addEventListener("click", function (e) {
        e.stopPropagation();
        setSidebarOpen(false);
      });
    }
    var sidebarEl = $("sidebar");
    if (sidebarEl) {
      sidebarEl.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }
    window.addEventListener("resize", function () {
      if (!isMobileLayout()) setSidebarOpen(false);
      else syncSidebarA11y();
    });

    $("quickSheetClose").addEventListener("click", closeQuickSheet);
    $("quickSheetBackdrop").addEventListener("click", closeQuickSheet);
    $("btnSheetCancel").addEventListener("click", closeQuickSheet);
    $("btnSheetSave").addEventListener("click", saveQuickSheet);
    $("btnSheetFullEdit").addEventListener("click", function () {
      var id = state.sheetEditingId;
      if (!id) return;
      var item = state.items.find(function (x) {
        return x.id === id;
      });
      if (item) {
        openEdit(item, {
          title: $("sheetTitleInput").value.trim() || item.title,
          note: $("sheetNoteInput").value,
        });
        closeQuickSheet();
      }
    });
    $("noteInput").addEventListener("input", function () {
      syncEditFormCounters();
      renderFormPreview();
    });

    $("tagInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        addFormTag($("tagInput").value);
        $("tagInput").value = "";
      }
    });

    setFormUrlGroupVisible(true);

    $("itemForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var id = $("editId").value;
      if (!id) return;
      var url = $("urlInput").value.trim();
      var title = $("titleInput").value.trim();
      var note = $("noteInput").value.trim();
      if (!url || !title) return;

      try {
        new URL(url);
      } catch (err) {
        showToast("URL không hợp lệ");
        return;
      }

      var prev = state.items.find(function (x) {
        return x.id === id;
      });
      var prevUrl = prev ? (prev.url || "").trim() : "";

      state.items = state.items.map(function (x) {
        if (x.id !== id) return x;
        var keepThumb =
          detectSource(url) === "facebook" &&
          (x.url || "").trim() === url &&
          x.thumbUrl;
        var src = detectSource(url);
        var fmt = detectFormat(url, src);
        var o = {
          id: x.id,
          url: url,
          title: title,
          note: note,
          tags: state.formTags.slice(),
          createdAt: x.createdAt,
          pinned: !!x.pinned,
          source: src,
          format: fmt,
        };
        if (keepThumb) o.thumbUrl = x.thumbUrl;
        return ensureItemMeta(o);
      });

      if (prevUrl !== url) {
        fbThumbFailed[id] = false;
        delete fbThumbPending[id];
      }

      var edited = state.items.find(function (x) {
        return x.id === id;
      });
      if (edited && detectSource(url) === "facebook" && !edited.thumbUrl) {
        queueFacebookThumbFetch(id);
      }

      showToast("Đã cập nhật");
      persist();
      closeModal();
      render();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (document.body.classList.contains("sidebar-open") && isMobileLayout()) {
          setSidebarOpen(false);
        } else if (!$("quickSheet").hidden) {
          closeQuickSheet();
        } else if (!$("modal").hidden) {
          if (state.formTagManageMode) setFormTagManageMode(false);
          else if (state.formInfoOpen) closeFormInfoPopover();
          else closeModal();
        } else if ($("settingsSheet") && !$("settingsSheet").hidden) {
          closeSettingsSheet();
        } else if ($("profileSheet") && !$("profileSheet").hidden) {
          closeProfileSheet();
        } else {
          closeSortMenu();
          closeAllCardMenus();
          if (state.formTagManageMode) setFormTagManageMode(false);
          closeFormInfoPopover();
          if (state.searchExpanded) setSearchExpanded(false);
        }
      }
    });

    window.addEventListener("online", refreshNetworkUi);
    window.addEventListener("offline", refreshNetworkUi);

    initSortMenuDecor();
    loadTheme();
    renderThemeColorUi();
    render();
    syncSortMenuLabel();
    syncSidebarA11y();
    refreshNetworkUi();
  }

  function boot() {
    init();
  }

  ensureFreshBuild(function () {
    boot();
    registerServiceWorker();
  });
})();
