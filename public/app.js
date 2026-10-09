(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const API = window.NINEBOOKS_API;

  let reviewToken = null,
    currentList = null,
    previewUrl = null,
    nextBefore = null,
    searchVersion = 0;

  const el = (tag, text, cls) => {
    const n = document.createElement(tag);

    if (text !== undefined) n.textContent = text;

    if (cls) n.className = cls;

    return n;
  };

  function notify(message) {
    $("notice").textContent = message;

    $("notice").hidden = !message;
  }

  async function api(path, options) {
    let r;

    try {
      r = await fetch(API + path, options);
    } catch {
      throw Error(
        "Could not reach the collection. Please check your connection and try again.",
      );
    }

    const data = await r.json();

    if (!r.ok)
      throw Error(data.error || "Could not connect. Please try again.");

    return data;
  }

  function run(fn) {
    return (...args) =>
      Promise.resolve()

        .then(() => fn(...args))

        .catch((e) => notify(e.message));
  }

  function show(view, update = true) {
    document

      .querySelectorAll(".view")

      .forEach((n) => (n.hidden = n.id !== view + "-view"));

    document.querySelectorAll(".tab").forEach((n) => {
      const active = n.dataset.view === view;

      n.classList.toggle("active", active);

      active
        ? n.setAttribute("aria-current", "page")
        : n.removeAttribute("aria-current");
    });

    notify("");

    if (update) history.pushState(null, "", "#" + view);
  }

  async function stats() {
    const s = await api("/api/stats");

    $("stats").textContent =
      `${s.lists.toLocaleString()} lists · ${s.books.toLocaleString()} books · ${s.albums.toLocaleString()} albums`;
  }

  function empty(target, title, text) {
    target.replaceChildren();

    const box = el("div", undefined, "empty");

    box.append(el("h3", title), el("p", text));

    target.append(box);
  }

  function itemButton(book, tile = false) {
    const b = el("button", undefined, tile ? "book-tile" : "book-button");

    b.type = "button";

    if (tile)
      b.append(el("span", String(book.position).padStart(2, "0"), "position"));

    b.append(el(tile ? "strong" : "span", book.title));

    if (tile) b.append(el("span", book.creator, "author"));

    b.addEventListener(
      "click",

      run(() => openItem(book.id)),
    );

    return b;
  }

  function renderList(list, target) {
    const card = el("article", undefined, "list-card"),
      heading = el("div", undefined, "list-heading");

    heading.append(
      el(
        "h3",

        list.display_name
          ? `${list.display_name}’s nine ${list.kind === "album" ? "albums" : "books"}`
          : `An anonymous contributor’s nine ${list.kind === "album" ? "albums" : "books"}`,
      ),

      el(
        "p",

        new Date(list.created_at).toLocaleDateString(undefined, {
          year: "numeric",

          month: "short",

          day: "numeric",
        }),
      ),
    );

    const grid = el("div", undefined, "list-grid");

    list.items.forEach((b) => grid.append(itemButton(b, true)));

    const meta = el("div", undefined, "list-meta"),
      link = el("a", "Open this list");

    link.href = "#list/" + list.id;

    meta.append(link);

    if (list.reader_id) {
      const profile = el("a", "This person’s books & albums");
      profile.href = "#reader/" + list.reader_id;
      meta.append(profile);
    }

    if (list.source_url) {
      const source = el("a", "Original post");

      source.href = list.source_url;

      source.target = "_blank";

      source.rel = "noopener noreferrer";

      meta.append(source);
    }

    card.append(heading, grid, meta);

    target.append(card);
  }

  function itemTable(books, target, related = false, across = false) {
    const table = el("table", undefined, "book-table"),
      thead = el("thead"),
      tr = el("tr");

    tr.append(
      el("th", "Title"),
      el(
        "th",
        across ? "People in common" : related ? "Lists together" : "Lists",
      ),
    );

    thead.append(tr);

    table.append(thead);

    const body = el("tbody");

    books.forEach((book) => {
      const row = el("tr"),
        name = el("td"),
        count = el(
          "td",
          String(
            across
              ? book.shared_readers
              : related
                ? book.shared_lists
                : book.list_count,
          ),
        );

      name.append(itemButton(book), el("span", book.creator, "author"));

      row.append(name, count);

      body.append(row);
    });

    table.append(body);

    target.append(table);
  }

  async function searchItems() {
    const version = ++searchVersion;

    const query = $("search").value;

    $("connections").hidden = true;

    $("book-results").hidden = false;

    $("book-results").textContent = "Finding titles…";

    const data = await api(
      "/api/items?kind=" +
        $("search-kind").value +
        "&q=" +
        encodeURIComponent(query),
    );

    if (version !== searchVersion) return;

    if (!data.items.length) {
      empty(
        $("book-results"),

        "No matching titles yet.",

        query
          ? "No matching titles have been contributed yet. Add a list to help grow the collection."
          : "The first list starts the collection. Add your books and albums to begin.",
      );

      return;
    }

    $("book-results").replaceChildren();

    itemTable(data.items, $("book-results"));
  }

  async function openItem(id, update = true) {
    const version = ++searchVersion;

    show("explore", false);

    if (update) history.pushState(null, "", "#item/" + id);

    $("book-results").hidden = true;

    $("connections").hidden = false;

    $("connections").textContent = "Finding connections…";

    const [data, lists] = await Promise.all([
      api("/api/items/" + id + "/related"),

      api("/api/lists?item=" + id),
    ]);

    if (version !== searchVersion) return;

    const root = $("connections");

    root.replaceChildren();

    const heading = el("div", undefined, "connection-heading");

    heading.append(
      el("p", "IF YOU LOVE"),

      el("h2", data.item.title),

      el(
        "p",

        `${data.item.creator} · on ${data.list_count} ${data.list_count === 1 ? "list" : "lists"}`,
      ),
    );

    root.append(heading);

    root.append(
      el(
        "h3",
        `Other ${data.item.kind === "album" ? "albums" : "books"} on the same lists.`,
      ),

      el(
        "p",

        "Counts show how many submitted lists contain both titles. This is shared taste, not a prediction of what you’ll enjoy.",

        "subtle",
      ),
    );

    if (data.list_count < 5)
      root.append(
        el(
          "p",

          "A small sample so far—each new list will add more context.",

          "subtle",
        ),
      );

    itemTable(data.related, root, true);

    const other = data.item.kind === "book" ? "albums" : "books";

    root.append(
      el(
        "h3",
        `What else do these people ${data.item.kind === "book" ? "listen to" : "read"}?`,
      ),
    );

    root.append(
      el(
        "p",
        `${data.linked_reader_count} of ${data.reader_count} contributors who chose this title have also shared ${other}. Counts below are distinct people, even if someone has contributed several lists.`,
        "subtle",
      ),
    );

    if (data.across.length) itemTable(data.across, root, false, true);
    else {
      const note = el("div", undefined, "empty");
      note.append(
        el("h3", `No linked ${other} yet.`),
        el(
          "p",
          `Add your books and albums as the same contributor to start connecting the two.`,
        ),
      );
      root.append(note);
    }

    root.append(el("h3", "The lists behind the connections."));

    lists.lists.forEach((l) => renderList(l, root));

    if (lists.next_before) {
      const more = el("button", "Load more matching lists", "secondary");

      let before = lists.next_before;

      more.addEventListener(
        "click",

        run(async () => {
          more.disabled = true;

          try {
            const page = await api(
              "/api/lists?item=" + id + "&before=" + before,
            );

            page.lists.forEach((l) => renderList(l, root));

            before = page.next_before;

            more.hidden = !before;

            root.append(more);
          } finally {
            more.disabled = false;
          }
        }),
      );

      root.append(more);
    }
  }

  async function browse(more = false) {
    if (!more) $("list-results").textContent = "Loading lists…";

    const data = await api(
      "/api/lists" + (more ? "?before=" + nextBefore : ""),
    );

    if (!more) $("list-results").replaceChildren();

    if (!data.lists.length && !more)
      empty(
        $("list-results"),

        "The collection starts with you.",

        "Upload your nine-book or nine-album image to contribute the first list.",
      );

    data.lists.forEach((l) => renderList(l, $("list-results")));

    nextBefore = data.next_before;

    $("more-lists").hidden = !nextBefore;
  }

  async function openList(id, update = true) {
    show("detail", false);

    if (update) history.pushState(null, "", "#list/" + id);

    $("detail").textContent = "Loading this list…";

    const list = await api("/api/lists/" + id);

    currentList = id;

    $("detail-copy").hidden = false;

    $("detail").replaceChildren();

    renderList(list, $("detail"));
  }

  async function copyLink() {
    const url = location.origin + location.pathname + "#list/" + currentList;

    try {
      await navigator.clipboard.writeText(url);

      notify("List link copied.");
    } catch {
      notify("Share this link: " + url);
    }
  }

  function reset() {
    reviewToken = null;

    $("review").reset();
    updateAttribution();

    $("review").hidden = true;

    $("working").hidden = true;

    $("success").hidden = true;

    $("upload-start").hidden = false;

    $("image-file").value = "";

    $("upload-kind").disabled = false;

    $("upload-options").hidden = false;

    updateIdentity();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);

      previewUrl = null;
    }

    notify("");
  }

  async function upload(file) {
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw Error("Choose a JPG, PNG or WebP image.");

    if (file.size > 5 * 1024 * 1024)
      throw Error("Choose an image smaller than 5 MB.");

    reset();

    $("upload-start").hidden = true;

    $("working").hidden = false;

    $("upload-kind").disabled = true;

    try {
      const result = await api("/api/analyze?kind=" + $("upload-kind").value, {
        method: "POST",

        headers: { "Content-Type": file.type },

        body: file,
      });

      if (result.existing_id) {
        reset();

        await openList(result.existing_id);

        notify("This image has already been contributed. Here is its list.");

        return;
      }

      reviewToken = result.token;

      previewUrl = URL.createObjectURL(file);

      $("preview").src = previewUrl;

      $("review-grid").replaceChildren();

      result.items.forEach((book, i) => {
        const card = el("div", undefined, "review-book"),
          slot = el("div", undefined, "slot");

        slot.append(
          el(
            "span",
            `${$("upload-kind").value === "album" ? "ALBUM" : "BOOK"} ${i + 1}`,
          ),
        );

        if (book.confidence !== "high")
          slot.append(el("span", "Please check", "uncertain"));

        card.append(slot);

        for (const field of ["title", "creator"]) {
          const label = el(
              "label",
              field === "title"
                ? "Title"
                : $("upload-kind").value === "album"
                  ? "Artist"
                  : "Author",
            ),
            input = el("input");

          input.value = book[field];

          input.name = `${field}-${i}`;

          input.required = true;

          input.maxLength = field === "title" ? 240 : 160;

          input.autocomplete = "off";

          label.append(input);

          card.append(label);
        }

        $("review-grid").append(card);
      });

      $("review").hidden = false;

      updateIdentity();
    } catch (e) {
      $("upload-start").hidden = false;

      $("upload-kind").disabled = false;

      throw e;
    } finally {
      $("working").hidden = true;
    }
  }

  $("image-file").addEventListener(
    "change",

    run((e) => upload(e.target.files[0])),
  );

  ["dragenter", "dragover"].forEach((name) =>
    $("dropzone").addEventListener(name, (e) => {
      e.preventDefault();

      $("dropzone").classList.add("over");
    }),
  );

  ["dragleave", "drop"].forEach((name) =>
    $("dropzone").addEventListener(name, (e) => {
      e.preventDefault();

      $("dropzone").classList.remove("over");
    }),
  );

  $("dropzone").addEventListener(
    "drop",

    run((e) => upload(e.dataTransfer.files[0])),
  );

  $("start-over").onclick = reset;

  $("another").onclick = reset;

  $("review").addEventListener(
    "submit",

    run(async (e) => {
      e.preventDefault();

      notify("");

      $("publish").disabled = true;

      $("publish").textContent = "Publishing…";

      try {
        const form = new FormData(e.target);

        const items = Array.from({ length: 9 }, (_, i) => ({
          title: form.get("title-" + i),

          creator: form.get("creator-" + i),
        }));

        const result = await api("/api/lists", {
          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({
            token: reviewToken,

            reader_token: $("link-reader").checked ? pairingToken : undefined,

            items,
            attribution: form.get("attribution"),

            display_name: form.get("display_name"),

            source_url: form.get("source_url"),

            consent: $("consent").checked ? "ninebooks-cc0-v2" : "",
          }),
        });

        if (result.reader_token) savePairing(result.reader_token);

        currentList = result.id;

        $("pair-copy").hidden = !result.reader_token;

        $("upload-options").hidden = true;

        $("add-other").textContent =
          $("upload-kind").value === "book"
            ? "Add my albums next"
            : "Add my books next";

        const list = await api("/api/lists/" + result.id);

        $("review").hidden = true;

        $("success").hidden = false;

        $("published-list").replaceChildren();

        renderList(list, $("published-list"));

        history.replaceState(null, "", "#list/" + result.id);

        await stats();
      } finally {
        $("publish").disabled = false;

        $("publish").textContent = "Publish my nine";
      }
    }),
  );

  $("copy-link").onclick = run(copyLink);

  $("detail-copy").onclick = run(copyLink);

  $("search-form").addEventListener(
    "submit",

    run((e) => {
      e.preventDefault();

      return searchItems();
    }),
  );

  $("more-lists").onclick = run(async () => {
    $("more-lists").disabled = true;

    try {
      await browse(true);
    } finally {
      $("more-lists").disabled = false;
    }
  });

  $("back-lists").onclick = run(async () => {
    show("lists");

    await browse();
  });

  document.querySelectorAll(".tab").forEach(
    (b) =>
      (b.onclick = run(async () => {
        show(b.dataset.view);

        if (b.dataset.view === "explore") await searchItems();

        if (b.dataset.view === "lists") await browse();
      })),
  );

  $("download").onclick = run(async () => {
    const button = $("download");

    button.disabled = true;

    try {
      let after = 0,
        until,
        lists = [];

      do {
        const page = await api(
          "/api/export?after=" +
            after +
            (until !== undefined ? "&until=" + until : ""),
        );

        until = page.until;

        lists.push(...page.lists);

        after = page.next_after;

        $("download-status").textContent = `Collected ${lists.length} lists…`;
      } while (after !== null);

      const blob = new Blob(
        [
          JSON.stringify(
            {
              schema_version: 2,

              license: "CC0-1.0",

              exported_at: new Date().toISOString(),

              lists,
            },

            null,

            2,
          ),
        ],

        { type: "application/json" },
      );

      const url = URL.createObjectURL(blob),
        link = el("a");

      link.href = url;

      link.download = "ninebooks.json";

      link.click();

      setTimeout(() => URL.revokeObjectURL(url), 1000);

      $("download-status").textContent =
        `Downloaded ${lists.length} complete lists.`;
    } finally {
      button.disabled = false;
    }
  });

  async function fromHash() {
    const hash = location.hash.slice(1);

    if (/^list\/[a-f0-9-]{36}$/.test(hash))
      return openList(hash.slice(5), false);

    if (/^reader\/[a-f0-9-]{36}$/.test(hash)) return openReader(hash.slice(7));

    if (/^item\/[a-f0-9]{24}$/.test(hash))
      return openItem(hash.slice(5), false);

    const view = ["upload", "explore", "lists", "data"].includes(hash)
      ? hash
      : "upload";

    show(view, false);

    if (view === "explore") await searchItems();

    if (view === "lists") await browse();
  }

  let pairingToken = null;

  try {
    pairingToken = localStorage.getItem("ninebooks-pairing");
  } catch {}

  function savePairing(token) {
    pairingToken = token;
    try {
      localStorage.setItem("ninebooks-pairing", token);
    } catch {}
    updateIdentity();
  }

  function updateIdentity() {
    $("link-choice").hidden = !pairingToken;

    $("link-reader").checked = !!pairingToken;

    $("identity-status").textContent = pairingToken
      ? "Your earlier contributor is available. Link this list to connect your books and albums."
      : "This list will start a new contributor. Add your other list afterward to connect the two.";
  }

  function updateAttribution() {
    const visible = $("attribution-mode").value === "public";
    $("attribution-fields").hidden = !visible;
    document
      .querySelectorAll("#attribution-fields input")
      .forEach((input) => (input.disabled = !visible));
  }
  $("attribution-mode").onchange = updateAttribution;

  async function openReader(id) {
    show("detail", false);
    $("detail-copy").hidden = true;
    $("detail").textContent = "Loading this contributor’s lists…";

    const page = await api("/api/lists?reader=" + id);
    const root = $("detail");
    root.replaceChildren(
      el("h2", "One person. Their books and albums."),
      el(
        "p",
        "These lists were explicitly linked with the same private pairing code. Names and identities are self-reported.",
        "subtle",
      ),
    );

    page.lists.forEach((l) => renderList(l, root));
    if (!page.lists.length) root.append(el("p", "No lists found."));

    if (page.next_before) {
      let before = page.next_before;
      const more = el("button", "Load more lists", "secondary");
      more.onclick = run(async () => {
        more.disabled = true;
        try {
          const next = await api(
            "/api/lists?reader=" + id + "&before=" + before,
          );
          next.lists.forEach((l) => renderList(l, root));
          before = next.next_before;
          more.hidden = !before;
          root.append(more);
        } finally {
          more.disabled = false;
        }
      });
      root.append(more);
    }
  }

  $("upload-kind").onchange = () => {
    $("upload-label").textContent =
      $("upload-kind").value === "album"
        ? "Choose your nine-album image"
        : "Choose your nine-book image";
  };

  $("search-kind").onchange = run(() => {
    $("search").value = "";
    $("search").placeholder =
      $("search-kind").value === "album"
        ? "Try Blue or Joni Mitchell"
        : "Try Moby-Dick or Herman Melville";
    return searchItems();
  });

  $("add-other").onclick = () => {
    const next = $("upload-kind").value === "book" ? "album" : "book";
    reset();
    $("upload-kind").value = next;
    $("upload-kind").onchange();
  };

  $("pair-copy").onclick = run(async () => {
    if (!pairingToken) return;
    try {
      await navigator.clipboard.writeText(pairingToken);
      notify(
        "Private pairing code copied. Save it somewhere safe; do not share it with your public list.",
      );
    } catch {
      $("pair-fallback").value = pairingToken;
      $("pair-fallback").hidden = false;
    }
  });

  $("use-pairing").onclick = run(async () => {
    const code = $("pairing-code").value.trim();
    await api("/api/reader", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reader_token: code }),
    });
    savePairing(code);
    $("pairing-code").value = "";
    notify(
      "Pairing code accepted. This list will be linked to your earlier contributions.",
    );
  });

  updateIdentity();

  window.addEventListener("hashchange", run(fromHash));

  run(fromHash)();

  run(stats)();
})();
