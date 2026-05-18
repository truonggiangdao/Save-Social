(function () {
  "use strict";

  var STORAGE_KEY = "saveSocialLibrary_v1";
  var THEME_KEY = "saveSocialTheme_v1";
  var DEFAULT_ACCENT = "#0b84c4";
  var THEME_PRESETS = [
    { id: "ocean", label: "Xanh dương", hex: "#0b84c4" },
    { id: "forest", label: "Xanh lá", hex: "#0d8a5b" },
    { id: "violet", label: "Tím", hex: "#6d4bd6" },
    { id: "sunset", label: "Cam", hex: "#e8652a" },
    { id: "rose", label: "Hồng", hex: "#d9467d" },
    { id: "slate", label: "Xám xanh", hex: "#3d5a73" },
    { id: "crimson", label: "Đỏ", hex: "#c62828" },
    { id: "amber", label: "Vàng cam", hex: "#d97706" },
    { id: "lime", label: "Lục chanh", hex: "#558b2f" },
    { id: "indigo", label: "Chàm", hex: "#4338ca" },
    { id: "white", label: "Trắng", hex: "#ffffff" },
    { id: "black", label: "Đen", hex: "#000000" },
  ];
  var PRESET_TAGS = ["Nấu ăn", "Tập thể dục", "Con cái", "Mẹo sống"];
  var state = {
    items: [],
    filterTag: null,
    search: "",
    sort: "newest",
    editingId: null,
    formTags: [],
    searchExpanded: false,
    formTagAddOpen: false,
    formInfoOpen: false,
    editTitleTouched: false,
  };

  var editAutoTitleTimer = null;
  var TAG_LONG_PRESS_MS = 520;
  var tagLongPressTimer = null;
  var tagLongPressHandled = false;
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

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      if (!Array.isArray(data.items)) return [];
      return data.items.map(function (it) {
        var out = {};
        for (var k in it) {
          if (k === "thumbFallback") continue;
          out[k] = it[k];
        }
        out.pinned = !!out.pinned;
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
    } catch (e) {
      applyAccentHex(DEFAULT_ACCENT);
      syncThemeUi(DEFAULT_ACCENT);
    }
  }

  function getAppliedAccentHex() {
    var fromCss = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    if (fromCss && hexToRgb(fromCss)) return normalizeHex(fromCss);
    return DEFAULT_ACCENT;
  }

  function syncThemeUi(hex) {
    var n = normalizeHex(hex);
    document.querySelectorAll(".theme-preset[data-hex]").forEach(function (btn) {
      var h = btn.getAttribute("data-hex");
      var sel = !!(h && normalizeHex(h) === n);
      btn.classList.toggle("is-selected", sel);
      btn.setAttribute("aria-pressed", sel ? "true" : "false");
    });
  }

  function renderThemeColorUi() {
    var presetsWrap = $("themePresets");
    if (!presetsWrap) return;

    presetsWrap.innerHTML = "";
    THEME_PRESETS.forEach(function (p) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-preset";
      btn.setAttribute("data-hex", p.hex);
      btn.setAttribute("aria-pressed", "false");

      var sw = document.createElement("span");
      sw.className = "theme-preset__swatch";
      sw.style.background = p.hex;
      sw.setAttribute("aria-hidden", "true");

      var lab = document.createElement("span");
      lab.textContent = p.label;

      btn.appendChild(sw);
      btn.appendChild(lab);
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var applied = applyAccentHex(p.hex);
        saveThemeAccentOnly(applied);
        syncThemeUi(applied);
        showToast("Đã đổi màu");
      });
      presetsWrap.appendChild(btn);
    });

    syncThemeUi(getAppliedAccentHex());
  }

  function showAppMenuHome() {
    var home = $("appMenuHomeBody");
    var settings = $("appMenuSettingsBody");
    var theme = $("appMenuThemeBody");
    var gear = $("btnOpenTheme");
    if (home) home.hidden = false;
    if (settings) settings.hidden = true;
    if (theme) theme.hidden = true;
    if (gear) gear.setAttribute("aria-expanded", "false");
  }

  function showAppMenuSettings() {
    var home = $("appMenuHomeBody");
    var settings = $("appMenuSettingsBody");
    var theme = $("appMenuThemeBody");
    var gear = $("btnOpenTheme");
    if (home) home.hidden = true;
    if (settings) settings.hidden = false;
    if (theme) theme.hidden = true;
    if (gear) gear.setAttribute("aria-expanded", "true");
  }

  function showAppMenuTheme() {
    var home = $("appMenuHomeBody");
    var settings = $("appMenuSettingsBody");
    var theme = $("appMenuThemeBody");
    var gear = $("btnOpenTheme");
    if (home) home.hidden = true;
    if (settings) settings.hidden = true;
    if (theme) theme.hidden = false;
    if (gear) gear.setAttribute("aria-expanded", "true");
    renderThemeColorUi();
    syncThemeUi(getAppliedAccentHex());
  }

  function detectSource(url) {
    try {
      var u = new URL(url.trim());
      var h = u.hostname.toLowerCase();
      if (h.includes("youtube.com") || h === "youtu.be" || h.includes("youtube-nocookie.com")) {
        return "youtube";
      }
      if (h.includes("facebook.com") || h.includes("fb.com") || h.includes("fb.watch") || h.includes("messenger.com")) {
        return "facebook";
      }
      return "web";
    } catch (e) {
      return "web";
    }
  }

  function sourceLabel(src) {
    if (src === "youtube") return "YouTube";
    if (src === "facebook") return "Facebook";
    return "Web";
  }

  function updateSourceBadge() {
    var url = $("urlInput").value.trim();
    var badge = $("sourceBadge");
    if (!url) {
      badge.textContent = "—";
      badge.className = "badge";
      return;
    }
    var src = detectSource(url);
    badge.textContent = sourceLabel(src);
    badge.className = "badge badge--" + src;
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
      merged[normalizeTag(t)] = true;
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

  function getFilteredOnly() {
    return state.items.filter(function (item) {
      return matchesSearch(item, state.search) && matchesTagFilter(item);
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
    return { kind: "placeholder", platform: "web" };
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

  function canReorder() {
    return state.sort === "manual" && !state.search && !state.filterTag;
  }

  function pickDropFinalIndex(listEl, clientY) {
    var rows = listEl.querySelectorAll(":scope > li.card-li");
    var n = rows.length;
    if (!n) return 0;
    for (var i = 0; i < n; i++) {
      var r = rows[i].getBoundingClientRect();
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
      var vis = getFilteredSorted();
      var fromIdx = vis.findIndex(function (x) {
        return x.id === itemId;
      });
      if (fromIdx < 0) return;
      btn.setPointerCapture(e.pointerId);
      reorderPointer = {
        pointerId: e.pointerId,
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
      var rows = reorderPointer.listEl.querySelectorAll(":scope > li.card-li");
      var n = rows.length;
      var hi = Math.min(Math.max(0, to), n - 1);
      if (rows[hi]) rows[hi].classList.add("card-li--drag-target");
    });

    function endDrag(e) {
      if (!reorderPointer || reorderPointer.pointerId !== e.pointerId) return;
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch (ex) {}
      var from = reorderPointer.fromIdx;
      var to = reorderPointer.lastTo;
      reorderPointer.listEl.querySelectorAll(".card-li").forEach(function (c) {
        c.classList.remove("card-li--dragging", "card-li--drag-target");
      });
      document.body.classList.remove("is-reordering");
      reorderPointer = null;
      if (from !== to && from >= 0 && to >= 0) {
        var ids = getFilteredSorted().map(function (x) {
          return x.id;
        });
        var moved = ids.splice(from, 1)[0];
        var toClamped = Math.min(Math.max(0, to), ids.length);
        ids.splice(toClamped, 0, moved);
        var byId = {};
        state.items.forEach(function (x) {
          byId[x.id] = x;
        });
        state.items = ids
          .map(function (id) {
            return byId[id];
          })
          .filter(Boolean);
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
      el.textContent =
        state.search || state.filterTag
          ? "Tắt ô tìm kiếm và lọc thẻ để kéo đổi vị trí."
          : "Mục ghim luôn ở trên. Giữ nút ⋮⋮ và kéo để đổi thứ tự.";
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
    if (p) p.hidden = true;
    if (b) {
      b.setAttribute("aria-expanded", "false");
      b.classList.remove("is-active");
    }
  }

  function toggleSortMenu() {
    var p = $("sortMenuPopover");
    var b = $("btnSortMenu");
    if (!p || !b) return;
    var willOpen = p.hidden;
    closeAllCardMenus();
    if (willOpen) {
      p.hidden = false;
      b.setAttribute("aria-expanded", "true");
      b.classList.add("is-active");
    } else {
      p.hidden = true;
      b.setAttribute("aria-expanded", "false");
      b.classList.remove("is-active");
    }
  }

  function closeAllCardMenus() {
    document.querySelectorAll(".card__dropdown").forEach(function (d) {
      d.hidden = true;
    });
    document.querySelectorAll(".card__more").forEach(function (btn) {
      btn.setAttribute("aria-expanded", "false");
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
      if (state.search || state.filterTag) {
        showToast("Tắt tìm kiếm và lọc thẻ để dùng thứ tự kéo.");
        syncSortMenuItems();
        updateSortMenuIcon();
        closeSortMenu();
        return;
      }
      var ordered = getFilteredSorted();
      state.items = ordered.slice();
    }
    state.sort = next;
    closeSortMenu();
    render();
  }

  function renderFormPreview() {
    var box = $("formPreview");
    if (!box) return;
    var url = $("urlInput").value.trim();
    var title = $("titleInput").value.trim();
    if (!url) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    try {
      new URL(url);
    } catch (err) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    var tw = thumbWrapForUrl(url);
    var previewTitle = title || suggestTitleLocal(url);
    var editingItem =
      state.editingId &&
      state.items.find(function (x) {
        return x.id === state.editingId;
      });
    var fbPreviewThumb =
      editingItem &&
      detectSource(url) === "facebook" &&
      (editingItem.url || "").trim() === url &&
      editingItem.thumbUrl;
    box.hidden = false;
    box.innerHTML = "";
    box.className = "form-preview";

    var row = document.createElement("div");
    row.className = "form-preview__row";

    var thumbCol = document.createElement("div");
    thumbCol.className = "form-preview__thumb-wrap";
    if (tw.kind === "youtube") {
      var img = document.createElement("img");
      img.className = "form-preview__thumb";
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      img.src = tw.urls[0];
      img.onerror = function () {
        if (tw.urls[1] && img.src !== tw.urls[1]) img.src = tw.urls[1];
      };
      thumbCol.appendChild(img);
    } else if (fbPreviewThumb) {
      var imgFbPrev = document.createElement("img");
      imgFbPrev.className = "form-preview__thumb";
      imgFbPrev.alt = "";
      imgFbPrev.decoding = "async";
      imgFbPrev.loading = "lazy";
      imgFbPrev.referrerPolicy = "no-referrer";
      imgFbPrev.src = fbPreviewThumb;
      thumbCol.appendChild(imgFbPrev);
    } else {
      var ph = document.createElement("div");
      ph.className = "form-preview__thumb form-preview__thumb--" + tw.platform;
      ph.setAttribute("aria-hidden", "true");
      thumbCol.appendChild(ph);
    }

    var main = document.createElement("div");
    main.className = "form-preview__main";
    var h = document.createElement("div");
    h.className = "form-preview__title";
    h.textContent = previewTitle;
    main.appendChild(h);
    var meta = document.createElement("div");
    meta.className = "form-preview__meta";
    meta.textContent = sourceLabel(detectSource(url)) + " · Xem trước như trong danh sách";
    main.appendChild(meta);

    row.appendChild(thumbCol);
    row.appendChild(main);
    box.appendChild(row);
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
    closeAppMenu();
    $("modal").hidden = false;
    $("modalTitle").textContent = "Sửa liên kết";
    setFormUrlGroupVisible(true);
    document.body.style.overflow = "hidden";
    refreshNetworkUi();
    if ($("urlInput")) $("urlInput").focus();
  }

  function closeAppMenu() {
    var m = $("appMenu");
    var b = $("btnAppMenu");
    if (m) m.hidden = true;
    if (b) b.setAttribute("aria-expanded", "false");
    showAppMenuHome();
  }

  function toggleAppMenu() {
    var m = $("appMenu");
    var b = $("btnAppMenu");
    if (!m || !b) return;
    var open = m.hidden;
    closeSortMenu();
    closeAllCardMenus();
    if (open) {
      m.hidden = false;
      b.setAttribute("aria-expanded", "true");
      showAppMenuHome();
    } else {
      m.hidden = true;
      b.setAttribute("aria-expanded", "false");
    }
  }

  function closeModal() {
    clearEditAutoTitleTimer();
    $("modal").hidden = true;
    document.body.style.overflow = "";
    state.editingId = null;
    $("itemForm").reset();
    $("editId").value = "";
    state.formTags = [];
    state.formTagAddOpen = false;
    state.formInfoOpen = false;
    state.editTitleTouched = false;
    setFormUrlGroupVisible(false);
    closeTagDeleteMenu();
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
    closeAppMenu();
  }

  function tagsForFormPicker() {
    var set = {};
    var base = [];
    function addBase(tag) {
      var n = normalizeTag(tag);
      if (!n || set[n]) return;
      set[n] = true;
      base.push(n);
    }
    PRESET_TAGS.forEach(addBase);
    uniqueTagsFromItems().forEach(addBase);
    base.sort(function (a, b) {
      return a.localeCompare(b, "vi");
    });
    var tail = [];
    state.formTags.forEach(function (t) {
      var n = normalizeTag(t);
      if (n && !set[n]) {
        set[n] = true;
        tail.push(n);
      }
    });
    return base.concat(tail);
  }

  function closeTagDeleteMenu() {
    var menu = $("formTagDeleteMenu");
    if (menu) menu.remove();
  }

  function deleteTagGlobally(tag) {
    var n = normalizeTag(tag);
    if (!n) return;
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
    persist();
    closeTagDeleteMenu();
    renderFormTagChips();
    render();
    showToast("Đã xóa thẻ");
  }

  function showTagDeleteMenu(anchorEl, tag) {
    closeTagDeleteMenu();
    var menu = document.createElement("div");
    menu.id = "formTagDeleteMenu";
    menu.className = "form-tag-delete-menu";
    menu.setAttribute("role", "menu");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "form-tag-delete-menu__item";
    btn.setAttribute("role", "menuitem");
    btn.textContent = "Xóa thẻ";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      deleteTagGlobally(tag);
    });
    menu.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    menu.appendChild(btn);
    menu.style.position = "fixed";
    menu.style.visibility = "hidden";
    document.body.appendChild(menu);
    var mw = menu.offsetWidth;
    var mh = menu.offsetHeight;
    menu.style.visibility = "visible";
    var rect = anchorEl.getBoundingClientRect();
    var top = rect.bottom + 6;
    var left = Math.min(rect.left, window.innerWidth - mw - 8);
    if (top + mh > window.innerHeight - 8) {
      top = Math.max(8, rect.top - mh - 6);
    }
    menu.style.top = top + "px";
    menu.style.left = Math.max(8, left) + "px";
  }

  function bindTagChipLongPress(btn, tag) {
    function clearPress() {
      if (tagLongPressTimer) {
        clearTimeout(tagLongPressTimer);
        tagLongPressTimer = null;
      }
    }
    btn.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      tagLongPressHandled = false;
      clearPress();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (ex) {}
      tagLongPressTimer = setTimeout(function () {
        tagLongPressTimer = null;
        tagLongPressHandled = true;
        try {
          btn.releasePointerCapture(e.pointerId);
        } catch (ex) {}
        showTagDeleteMenu(btn, tag);
      }, TAG_LONG_PRESS_MS);
    });
    btn.addEventListener("pointerup", clearPress);
    btn.addEventListener("pointercancel", clearPress);
    btn.addEventListener("pointerleave", clearPress);
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

  function renderFormTagChips() {
    var wrap = $("formTagChips");
    if (!wrap) return;
    wrap.innerHTML = "";
    tagsForFormPicker().forEach(function (tag) {
      var selected = state.formTags.some(function (t) {
        return normalizeTag(t) === tag;
      });
      function toggleTag() {
        if (tagLongPressHandled) {
          tagLongPressHandled = false;
          return;
        }
        var i = -1;
        state.formTags.forEach(function (t, idx) {
          if (normalizeTag(t) === tag) i = idx;
        });
        if (i === -1) state.formTags.push(tag);
        else state.formTags.splice(i, 1);
        renderFormTagChips();
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip form-tag-chip" + (selected ? " is-active" : "");
      btn.textContent = tag;
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
      btn.addEventListener("click", toggleTag);
      bindTagChipLongPress(btn, tag);
      wrap.appendChild(btn);
    });

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "chip form-tag-chip form-tag-chip--add";
    addBtn.textContent = "+ Tag";
    addBtn.setAttribute("aria-expanded", state.formTagAddOpen ? "true" : "false");
    addBtn.setAttribute("aria-controls", "formTagInputWrap");
    wrap.appendChild(addBtn);

    var wi = $("formTagInputWrap");
    if (wi) wi.hidden = !state.formTagAddOpen;
  }

  function addFormTag(tag) {
    var n = normalizeTag(tag);
    if (!n) return;
    if (state.formTags.indexOf(n) === -1) {
      state.formTags.push(n);
      renderFormTagChips();
    }
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
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function clearHeaderUrlValue() {
    var el = $("headerUrlInput");
    if (!el) return;
    el.textContent = "";
    el.innerHTML = "";
  }

  function setHeaderUrlValue(text) {
    var el = $("headerUrlInput");
    if (!el) return;
    el.textContent = text || "";
  }

  function selectAllHeaderUrl() {
    var el = $("headerUrlInput");
    if (!el) return;
    el.focus({ preventScroll: true });
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function quickAddFromHeader() {
    if (headerQuickAddBusy) return;
    var btn = $("btnQuickAdd");
    var raw = getHeaderUrlValue();
    if (!raw) {
      showToast("Dán link vào ô rồi nhấn +");
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
        state.items.unshift({
          id: newId,
          url: raw,
          title: title,
          note: "",
          tags: tags,
          createdAt: new Date().toISOString(),
          pinned: false,
        });
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
    var searchBundle = $("filtersSearchBundle");
    if (searchBundle && searchBundle.parentNode) {
      searchBundle.parentNode.removeChild(searchBundle);
    }
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

    if (searchBundle) wrap.appendChild(searchBundle);
  }

  function renderList() {
    var listEl = $("itemList");
    var emptyEl = $("emptyState");
    var filtered = getFilteredSorted();

    $("resultCount").textContent =
      filtered.length === state.items.length
        ? filtered.length + " mục"
        : filtered.length + " / " + state.items.length + " mục";

    listEl.innerHTML = "";
    if (filtered.length === 0) {
      emptyEl.hidden = false;
      if (state.items.length > 0) {
        emptyEl.querySelector(".empty__title").textContent = "Không khớp bộ lọc";
        emptyEl.querySelector(".empty__text").textContent = "Thử bỏ thẻ lọc hoặc đổi từ khóa tìm kiếm.";
      } else {
        emptyEl.querySelector(".empty__title").textContent = "Chưa có liên kết nào";
        emptyEl.querySelector(".empty__text").innerHTML =
          "Dán link vào ô trên cùng rồi nhấn <strong>+</strong> để lưu nhanh.";
      }
      return;
    }

    emptyEl.hidden = true;

    filtered.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "card-li" + (item.pinned ? " card-li--pinned" : "");
      li.dataset.itemId = item.id;

      var card = document.createElement("div");
      card.className = "card card--row";

      var src = detectSource(item.url);
      var tw = thumbWrapForUrl(item.url);

      if (canReorder() && state.items.length > 1) {
        var grab = document.createElement("button");
        grab.type = "button";
        grab.className = "card__reorder";
        grab.setAttribute("aria-label", "Kéo để đổi vị trí");
        grab.innerHTML = "⋮⋮";
        bindReorderHandle(grab, item.id, listEl);
        card.appendChild(grab);
      }

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

      var title = document.createElement("h3");
      title.className = "card__title";
      if (item.pinned) {
        var pinMark = document.createElement("span");
        pinMark.className = "card__pin";
        pinMark.setAttribute("aria-label", "Đã ghim");
        pinMark.title = "Đã ghim — luôn hiển thị trên cùng";
        pinMark.innerHTML =
          '<svg class="card__pin-svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
          '<path fill="currentColor" d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5v7l1 1 1-1v-7h5v-2c-1.66 0-3-1.34-3-3z"/>' +
          "</svg>";
        title.appendChild(pinMark);
      }
      var link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.title || item.url;
      title.appendChild(link);
      main.appendChild(title);

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
      if (noteText) {
        var note = document.createElement("p");
        note.className = "card__note card__note--thumb-title-row";
        note.textContent = noteText;
        main.appendChild(note);
      }

      cluster.appendChild(main);

      card.appendChild(cluster);

      var menuWrap = document.createElement("div");
      menuWrap.className = "card__menu-wrap card__menu-wrap--float";
      var moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "card__more";
      moreBtn.setAttribute("aria-label", "Thêm thao tác");
      moreBtn.setAttribute("aria-expanded", "false");
      moreBtn.setAttribute("aria-haspopup", "true");
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
      addMenuItem("Sao chép", function () {
        copyUrl(item.url);
      });
      addMenuItem("Sửa", function () {
        openEdit(item);
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
        }
      });

      menuWrap.appendChild(moreBtn);
      menuWrap.appendChild(dropdown);
      li.appendChild(card);
      li.appendChild(menuWrap);
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

  function openEdit(item) {
    state.editingId = item.id;
    $("editId").value = item.id;
    $("urlInput").value = item.url;
    $("titleInput").value = item.title;
    $("noteInput").value = item.note || "";
    state.formTags = (item.tags || []).slice();
    state.formTagAddOpen = false;
    state.formInfoOpen = false;
    state.editTitleTouched = false;
    syncFormInfoUi();
    renderFormTagChips();
    updateSourceBadge();
    openModal();
    renderFormPreview();
    runEditAutoTitle(false);
  }

  function render() {
    updateSortHint();
    renderTagFilters();
    renderList();
    syncSortMenuItems();
    updateSortMenuIcon();
    updateSearchChipIndicator();
  }

  function init() {
    state.items = load();
    persist();

    $("btnQuickAdd").addEventListener("click", function (e) {
      e.stopPropagation();
      quickAddFromHeader();
    });

    var headerUrlInput = $("headerUrlInput");
    if (headerUrlInput) {
      headerUrlInput.addEventListener("paste", function (e) {
        e.preventDefault();
        var text = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
        if (!text) return;
        if (document.queryCommandSupported("insertText")) {
          document.execCommand("insertText", false, text);
        } else {
          headerUrlInput.textContent = text;
        }
      });

      headerUrlInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          quickAddFromHeader();
        }
      });

      headerUrlInput.addEventListener("focus", function () {
        requestAnimationFrame(function () {
          if (getHeaderUrlValue()) {
            selectAllHeaderUrl();
            return;
          }
          var range = document.createRange();
          range.setStart(headerUrlInput, 0);
          range.collapse(true);
          var sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        });
      });

      headerUrlInput.addEventListener("blur", function () {
        if (!getHeaderUrlValue()) clearHeaderUrlValue();
      });
    }

    $("itemForm").addEventListener("click", function (e) {
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

    $("modalClose").addEventListener("click", closeModal);
    $("modalBackdrop").addEventListener("click", closeModal);
    $("btnCancel").addEventListener("click", closeModal);

    var formInfoPopover = $("formInfoPopover");
    if (formInfoPopover) {
      formInfoPopover.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }

    $("btnToggleNote").addEventListener("click", function (e) {
      e.stopPropagation();
      setFormInfoOpen(!state.formInfoOpen);
    });

    window.addEventListener(
      "resize",
      function () {
        if (state.formInfoOpen) positionFormInfoPopover();
      },
      { passive: true }
    );

    $("btnToggleSearch").addEventListener("click", function (e) {
      e.stopPropagation();
      setSearchExpanded(!state.searchExpanded);
    });

    $("searchInput").addEventListener("focus", function () {
      setSearchExpanded(true);
    });

    $("searchInput").addEventListener("input", function () {
      state.search = $("searchInput").value.trim();
      render();
    });

    $("btnSortMenu").addEventListener("click", function (e) {
      e.stopPropagation();
      toggleSortMenu();
    });

    document.querySelectorAll("#sortMenuPopover [data-sort-mode]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        closeSortMenu();
        applySort(btn.getAttribute("data-sort-mode"));
      });
    });

    document.addEventListener("click", function () {
      closeSortMenu();
      closeAllCardMenus();
      closeTagDeleteMenu();
      closeFormInfoPopover();
      closeAppMenu();
    });

    $("btnAppMenu").addEventListener("click", function (e) {
      e.stopPropagation();
      toggleAppMenu();
    });

    $("btnOpenTheme").addEventListener("click", function (e) {
      e.stopPropagation();
      showAppMenuSettings();
    });

    $("btnSettingsBack").addEventListener("click", function (e) {
      e.stopPropagation();
      showAppMenuHome();
    });

    $("btnOpenColorTheme").addEventListener("click", function (e) {
      e.stopPropagation();
      showAppMenuTheme();
    });

    $("btnThemeBack").addEventListener("click", function (e) {
      e.stopPropagation();
      showAppMenuSettings();
    });

    $("btnThemeReset").addEventListener("click", function (e) {
      e.stopPropagation();
      var applied = applyAccentHex(DEFAULT_ACCENT);
      saveThemeAccentOnly(applied);
      syncThemeUi(applied);
      renderThemeColorUi();
      showToast("Đã khôi phục màu mặc định");
    });

    $("appMenuScrim").addEventListener("click", function (e) {
      e.stopPropagation();
      closeAppMenu();
    });

    $("appMenuClose").addEventListener("click", function (e) {
      e.stopPropagation();
      closeAppMenu();
    });

    $("appMenuPanel").addEventListener("click", function (e) {
      e.stopPropagation();
    });

    $("urlInput").addEventListener("input", function () {
      updateSourceBadge();
      renderFormPreview();
      scheduleEditAutoTitle();
    });
    $("titleInput").addEventListener("input", function () {
      state.editTitleTouched = true;
      renderFormPreview();
    });

    $("tagInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        addFormTag($("tagInput").value);
        $("tagInput").value = "";
      }
    });

    setFormUrlGroupVisible(false);

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
        var o = {
          id: x.id,
          url: url,
          title: title,
          note: note,
          tags: state.formTags.slice(),
          createdAt: x.createdAt,
          pinned: !!x.pinned,
        };
        if (keepThumb) o.thumbUrl = x.thumbUrl;
        return o;
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
        if (!$("modal").hidden) {
          if (state.formInfoOpen) closeFormInfoPopover();
          else closeModal();
        } else if ($("appMenu") && !$("appMenu").hidden) closeAppMenu();
        else {
          closeSortMenu();
          closeAllCardMenus();
          closeTagDeleteMenu();
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
    refreshNetworkUi();
  }

  function boot() {
    init();
  }

  ensureFreshBuild(function () {
    registerServiceWorker();
    boot();
  });
})();
