(function () {
  "use strict";

  var STORAGE_KEY = "saveSocialLibrary_v1";
  var PRESET_TAGS = ["Nấu ăn", "Tập thể dục", "Con cái", "Mẹo sống"];
  var SWIPE_DELETE_W = 88;

  var state = {
    items: [],
    filterTag: null,
    search: "",
    sort: "newest",
    editingId: null,
    formTags: [],
    searchExpanded: false,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return Array.isArray(data.items) ? data.items : [];
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
    var btn = $("btnFetchTitle");
    var hint = $("fetchHint");
    if (!btn || !hint) return;
    var online = isNetworkHintOnline();
    btn.disabled = !online;
    btn.setAttribute("aria-disabled", online ? "false" : "true");
    hint.textContent = online
      ? "Khi có mạng: lấy tiêu đề thật từ YouTube. Offline: dùng gợi ý theo link (không cần mạng)."
      : "Đang offline — gợi ý tiêu đề chỉ theo link; bật mạng nếu muốn lấy tiêu đề từ YouTube.";
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
    var list = getFilteredOnly();
    if (state.sort === "title") {
      list.sort(function (a, b) {
        return (a.title || "").localeCompare(b.title || "", "vi", { sensitivity: "base" });
      });
    } else if (state.sort === "newest") {
      list.sort(function (a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    } else if (state.sort === "manual") {
      var ord = orderIndexMap();
      list.sort(function (a, b) {
        return (ord[a.id] || 0) - (ord[b.id] || 0);
      });
    }
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
      var fromIdx = state.items.findIndex(function (x) {
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
        var arr = state.items.slice();
        var it = arr.splice(from, 1)[0];
        var toClamped = Math.min(Math.max(0, to), arr.length);
        arr.splice(toClamped, 0, it);
        state.items = arr;
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
          : "Giữ nút ⋮⋮ và kéo lên hoặc xuống để đổi thứ tự.";
    } else {
      el.hidden = true;
    }
  }

  function setSearchExpanded(on) {
    state.searchExpanded = !!on;
    var slide = $("searchSlide");
    var btn = $("btnToggleSearch");
    var hdr = $("appHeader");
    if (slide) {
      slide.classList.toggle("toolbar__search-slide--collapsed", !state.searchExpanded);
      slide.setAttribute("aria-hidden", state.searchExpanded ? "false" : "true");
    }
    if (btn) {
      btn.setAttribute("aria-expanded", state.searchExpanded ? "true" : "false");
      btn.setAttribute("aria-label", state.searchExpanded ? "Thu gọn tìm kiếm" : "Mở tìm kiếm");
    }
    if (hdr) hdr.classList.toggle("header--search-open", state.searchExpanded);
    if (state.searchExpanded && $("searchInput")) {
      $("searchInput").focus();
    }
  }

  function updateSearchToggleIndicator() {
    var btn = $("btnToggleSearch");
    if (!btn) return;
    btn.classList.toggle("toolbar__icon-btn--active-filter", !!state.search);
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
    closeAllCardSwipes();
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

  function closeAllCardSwipes() {
    document.querySelectorAll(".card-swipe__front").forEach(function (f) {
      f.style.transform = "";
      f.classList.remove("card-swipe__front--dragging");
    });
    document.querySelectorAll(".card-li").forEach(function (li) {
      li.classList.remove("card-li--swipe-open");
    });
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
    var t = title || suggestTitleLocal(url);
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
    h.textContent = t;
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

  function openModal(isEdit) {
    closeAppMenu();
    $("modal").hidden = false;
    $("modalTitle").textContent = isEdit ? "Sửa liên kết" : "Thêm liên kết";
    document.body.style.overflow = "hidden";
    refreshNetworkUi();
    if (!isEdit) {
      $("urlInput").focus();
    } else {
      $("titleInput").focus();
    }
  }

  function closeAppMenu() {
    var m = $("appMenu");
    var b = $("btnAppMenu");
    if (m) m.hidden = true;
    if (b) b.setAttribute("aria-expanded", "false");
  }

  function toggleAppMenu() {
    var m = $("appMenu");
    var b = $("btnAppMenu");
    if (!m || !b) return;
    var open = m.hidden;
    closeSortMenu();
    closeAllCardMenus();
    closeAllCardSwipes();
    if (open) {
      m.hidden = false;
      b.setAttribute("aria-expanded", "true");
    } else {
      m.hidden = true;
      b.setAttribute("aria-expanded", "false");
    }
  }

  function closeModal() {
    $("modal").hidden = true;
    document.body.style.overflow = "";
    state.editingId = null;
    $("itemForm").reset();
    $("editId").value = "";
    state.formTags = [];
    renderSelectedTags();
    updateSourceBadge();
    var fp = $("formPreview");
    if (fp) {
      fp.hidden = true;
      fp.innerHTML = "";
    }
    closeSortMenu();
    closeAllCardMenus();
    closeAllCardSwipes();
    closeAppMenu();
  }

  function renderPresetTags() {
    var wrap = $("presetTags");
    wrap.innerHTML = "";
    PRESET_TAGS.forEach(function (tag) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = tag;
      btn.addEventListener("click", function () {
        addFormTag(tag);
      });
      wrap.appendChild(btn);
    });
  }

  function renderSelectedTags() {
    var wrap = $("selectedTags");
    wrap.innerHTML = "";
    state.formTags.forEach(function (tag) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tag-removable";
      btn.innerHTML = "<span>" + escapeHtml(tag) + "</span> ×";
      btn.addEventListener("click", function () {
        state.formTags = state.formTags.filter(function (t) {
          return t !== tag;
        });
        renderSelectedTags();
      });
      wrap.appendChild(btn);
    });
  }

  function addFormTag(tag) {
    var n = normalizeTag(tag);
    if (!n) return;
    if (state.formTags.indexOf(n) === -1) {
      state.formTags.push(n);
      renderSelectedTags();
    }
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function renderTagFilters() {
    var wrap = $("tagFilters");
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

  function bindCardSwipe(frontEl, deleteBtn, liWrap, item) {
    var DELETE_W = SWIPE_DELETE_W;
    var startX = 0;
    var startTx = 0;
    var pid = null;
    var dragging = false;

    function currentTx() {
      var m = frontEl.style.transform.match(/translateX\((-?[0-9.]+)px\)/);
      return m ? parseFloat(m[1], 10) : 0;
    }

    function setTx(px) {
      var v = Math.min(0, Math.max(px, -DELETE_W));
      frontEl.style.transform = "translateX(" + v + "px)";
      liWrap.classList.toggle("card-li--swipe-open", v <= -8);
    }

    deleteBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      performDeleteItem(item.id);
    });

    frontEl.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      if (e.target.closest("a[href]")) return;
      if (e.target.closest(".card__reorder")) return;
      if (e.target.closest(".card__more")) return;
      if (e.target.closest(".card__dropdown")) return;
      if (e.target.closest("button")) return;
      closeAllCardMenus();
      closeSortMenu();
      frontEl.style.transition = "none";
      pid = e.pointerId;
      startX = e.clientX;
      startTx = currentTx();
      dragging = true;
      frontEl.classList.add("card-swipe__front--dragging");
      try {
        frontEl.setPointerCapture(e.pointerId);
      } catch (ex) {}
    });

    frontEl.addEventListener("pointermove", function (e) {
      if (!dragging || e.pointerId !== pid) return;
      var dx = e.clientX - startX;
      setTx(startTx + dx);
    });

    function endSwipeDrag(e) {
      if (e.pointerId !== pid) return;
      dragging = false;
      try {
        frontEl.releasePointerCapture(e.pointerId);
      } catch (ex) {}
      pid = null;
      frontEl.classList.remove("card-swipe__front--dragging");
      frontEl.style.transition = "transform 0.22s ease";
      var tx = currentTx();
      if (tx < -DELETE_W / 2) setTx(-DELETE_W);
      else setTx(0);
    }

    frontEl.addEventListener("pointerup", endSwipeDrag);
    frontEl.addEventListener("pointercancel", function (e) {
      if (!dragging || e.pointerId !== pid) return;
      dragging = false;
      var cap = pid;
      pid = null;
      frontEl.classList.remove("card-swipe__front--dragging");
      frontEl.style.transition = "transform 0.22s ease";
      setTx(0);
      if (cap != null) {
        try {
          frontEl.releasePointerCapture(cap);
        } catch (ex2) {}
      }
    });
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
          "Nhấn nút <strong>Thêm</strong> (dấu +) trên thanh trên cùng để lưu link YouTube, Facebook hoặc bất kỳ trang web nào.";
      }
      return;
    }

    emptyEl.hidden = true;

    filtered.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "card-li";
      li.dataset.itemId = item.id;

      var swipe = document.createElement("div");
      swipe.className = "card-swipe";

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "card-swipe__delete";
      delBtn.textContent = "Xóa";
      delBtn.setAttribute("aria-label", "Xóa mục này");

      var front = document.createElement("div");
      front.className = "card-swipe__front card card--row";

      var src = detectSource(item.url);
      var tw = thumbWrapForUrl(item.url);

      if (canReorder() && state.items.length > 1) {
        var grab = document.createElement("button");
        grab.type = "button";
        grab.className = "card__reorder";
        grab.setAttribute("aria-label", "Kéo để đổi vị trí");
        grab.innerHTML = "⋮⋮";
        bindReorderHandle(grab, item.id, listEl);
        front.appendChild(grab);
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

      front.appendChild(cluster);

      swipe.appendChild(delBtn);
      swipe.appendChild(front);

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

      function addMenuItem(label, fn) {
        var m = document.createElement("button");
        m.type = "button";
        m.className = "card__dropdown-item";
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

      moreBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var willOpen = dropdown.hidden;
        closeAllCardMenus();
        closeSortMenu();
        closeAllCardSwipes();
        if (willOpen) {
          dropdown.hidden = false;
          moreBtn.setAttribute("aria-expanded", "true");
        }
      });

      menuWrap.appendChild(moreBtn);
      menuWrap.appendChild(dropdown);
      li.appendChild(swipe);
      li.appendChild(menuWrap);
      listEl.appendChild(li);

      front.style.transition = "transform 0.22s ease";
      bindCardSwipe(front, delBtn, li, item);
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
    renderSelectedTags();
    updateSourceBadge();
    openModal(true);
    renderFormPreview();
  }

  function render() {
    updateSortHint();
    renderTagFilters();
    renderList();
    syncSortMenuItems();
    updateSortMenuIcon();
    updateSearchToggleIndicator();
  }

  function init() {
    state.items = load();
    renderPresetTags();

    $("btnOpenAdd").addEventListener("click", function () {
      state.editingId = null;
      $("editId").value = "";
      $("itemForm").reset();
      state.formTags = [];
      renderSelectedTags();
      updateSourceBadge();
      openModal(false);
      renderFormPreview();
    });

    $("modalClose").addEventListener("click", closeModal);
    $("modalBackdrop").addEventListener("click", closeModal);
    $("btnCancel").addEventListener("click", closeModal);

    $("btnToggleSearch").addEventListener("click", function () {
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
      closeAllCardSwipes();
      closeAppMenu();
    });

    $("btnAppMenu").addEventListener("click", function (e) {
      e.stopPropagation();
      toggleAppMenu();
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
    });
    $("titleInput").addEventListener("input", renderFormPreview);

    $("urlInput").addEventListener("blur", function () {
      var url = $("urlInput").value.trim();
      if (!url || state.editingId) return;
      if ($("titleInput").value.trim()) return;
      $("titleInput").value = suggestTitleLocal(url);
      renderFormPreview();
    });

    $("btnFetchTitle").addEventListener("click", function () {
      var url = $("urlInput").value.trim();
      if (!url) {
        showToast("Nhập URL trước");
        return;
      }
      if (!isNetworkHintOnline()) {
        showToast("Đang offline — nhập tiêu đề tay hoặc dùng gợi ý theo link");
        return;
      }
      if (detectSource(url) !== "youtube") {
        $("titleInput").value = suggestTitleLocal(url);
        showToast("Đã điền gợi ý theo link");
        renderFormPreview();
        return;
      }
      $("btnFetchTitle").disabled = true;
      fetchYoutubeTitle(url)
        .then(function (title) {
          $("titleInput").value = title;
          showToast("Đã lấy tiêu đề từ YouTube");
          renderFormPreview();
        })
        .catch(function () {
          $("titleInput").value = suggestTitleLocal(url);
          showToast("Không lấy được — đã dùng gợi ý theo link");
          renderFormPreview();
        })
        .finally(function () {
          refreshNetworkUi();
        });
    });

    $("tagInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        addFormTag($("tagInput").value);
        $("tagInput").value = "";
      }
    });

    $("itemForm").addEventListener("submit", function (e) {
      e.preventDefault();
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

      var id = $("editId").value;
      if (id) {
        state.items = state.items.map(function (x) {
          if (x.id !== id) return x;
          return {
            id: x.id,
            url: url,
            title: title,
            note: note,
            tags: state.formTags.slice(),
            createdAt: x.createdAt,
          };
        });
        showToast("Đã cập nhật");
      } else {
        state.items.unshift({
          id: crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2),
          url: url,
          title: title,
          note: note,
          tags: state.formTags.slice(),
          createdAt: new Date().toISOString(),
        });
        showToast("Đã lưu");
      }
      persist();
      closeModal();
      render();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!$("modal").hidden) closeModal();
        else if ($("appMenu") && !$("appMenu").hidden) closeAppMenu();
        else {
          closeSortMenu();
          closeAllCardMenus();
          closeAllCardSwipes();
          if (state.searchExpanded) setSearchExpanded(false);
        }
      }
    });

    window.addEventListener("online", refreshNetworkUi);
    window.addEventListener("offline", refreshNetworkUi);

    initSortMenuDecor();
    render();
    refreshNetworkUi();
  }

  init();
})();
