import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { itemRecord } from "../src/worker.js";

test('anonymous mode strips a supplied handle and source URL at the server',async()=>{
  const env=setup();const response=await req(env,'/api/lists',submission(await ticket(env,230),{attribution:'anonymous',display_name:'@privatehandle',source_url:'https://x.com/privatehandle/status/123'}));
  assert.equal(response.status,201);const list=(await req(env,'/api/lists/'+response.data.id)).data;
  assert.equal(list.display_name,'');assert.equal(list.source_url,'');assert.ok(list.reader_id);
  assert.ok(!JSON.stringify((await req(env,'/api/export')).data).includes('privatehandle'));
});

test("book and album lists link only through a private pairing code; cross-media counts distinct people", async () => {
  const env = setup();
  env.IP_HOURLY_LIMIT = "100";
  const albums = items.map((b, i) => ({
    title: "Album " + i,
    creator: "Artist " + i,
    confidence: "high",
  }));
  const first = await req(
    env,
    "/api/lists",
    submission(await ticket(env, 201)),
  );
  const pairing = first.data.reader_token;
  assert.ok(pairing);
  const albumList = await req(
    env,
    "/api/lists",
    submission(await ticket(env, 202, "album", albums), {
      items: albums,
      reader_token: pairing,
    }),
  );
  assert.equal(albumList.status, 201);
  assert.equal(albumList.data.reader_id, first.data.reader_id);
  await req(
    env,
    "/api/lists",
    submission(await ticket(env, 203, "album", albums), {
      items: albums,
      reader_token: pairing,
    }),
  );
  await req(
    env,
    "/api/lists",
    submission(await ticket(env, 204), { reader_token: pairing }),
  );
  // Same display name does not link an unrelated person to the book contributor.
  const unrelated = await req(
    env,
    "/api/lists",
    submission(await ticket(env, 205, "album", albums), { items: albums }),
  );
  assert.notEqual(unrelated.data.reader_id, first.data.reader_id);
  const bookId = (await itemRecord(items[0])).id;
  const related = (await req(env, "/api/items/" + bookId + "/related")).data;
  assert.equal(related.reader_count, 1);
  assert.equal(related.linked_reader_count, 1);
  assert.equal(related.across.length, 9);
  assert.ok(
    related.across.every((x) => x.kind === "album" && x.shared_readers === 1),
  );
  const albumId = (await itemRecord(albums[0], "album")).id;
  const inverse = (await req(env, "/api/items/" + albumId + "/related")).data;
  assert.equal(inverse.reader_count, 2);
  assert.equal(inverse.linked_reader_count, 1);
  assert.equal(inverse.across.length, 9);
  assert.equal(
    (await req(env, "/api/lists?reader=" + first.data.reader_id)).data.lists
      .length,
    4,
  );
  const exported = JSON.stringify((await req(env, "/api/export")).data);
  assert.ok(exported.includes(first.data.reader_id));
  assert.ok(!exported.includes(pairing));
  assert.ok(!exported.includes("reader_token"));
  assert.equal(
    (await req(env, "/api/reader", { reader_token: pairing })).data.reader_id,
    first.data.reader_id,
  );
  assert.equal((await req(env, "/api/lists", submission(pairing))).status, 400);
  assert.equal(
    (await req(env, "/api/reader", { reader_token: await ticket(env, 206) }))
      .status,
    400,
  );
  assert.equal((await req(env, "/api/items?kind=album")).data.items.length, 9);
  assert.notEqual(
    (await itemRecord(items[0], "book")).id,
    (await itemRecord(items[0], "album")).id,
  );
});

test("a competing review ticket for the same image cannot recover somebody else’s pairing code", async () => {
  const env = setup();
  const tokenA = await ticket(env, 210),
    tokenB = await ticket(env, 210);
  const a = await req(env, "/api/lists", submission(tokenA));
  const b = await req(env, "/api/lists", submission(tokenB));
  assert.equal(a.data.id, b.data.id);
  assert.ok(!b.data.reader_token);
  const retry = await req(env, "/api/lists", submission(tokenA));
  assert.ok(retry.data.reader_token);
});

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../migrations/0001.sql", import.meta.url), "utf8"),
  );
  sqlite.exec(
    readFileSync(
      new URL("../migrations/0002_albums_and_readers.sql", import.meta.url),
      "utf8",
    ),
  );
  const db = {
    sqlite,
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        params: [],
        bind(...args) {
          this.params = args;
          return this;
        },
        async first() {
          return stmt.get(...this.params) || null;
        },
        async all() {
          return { results: stmt.all(...this.params) };
        },
        async run() {
          return stmt.run(...this.params);
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return db;
}
const items = Array.from({ length: 9 }, (_, i) => ({
  title: i === 0 ? "Moby-Dick" : "Book " + i,
  creator: i === 0 ? "Herman Melville" : "Author " + i,
  confidence: "high",
}));
function setup() {
  return {
    DB: database(),
    SIGNING_SECRET: "test-secret-not-used-in-production",
    ANTHROPIC_API_KEY: "fake",
    ALLOWED_ORIGINS: "https://thestalwart.com",
  };
}
async function req(env, path, body, headers = {}) {
  const request = new Request("https://test.invalid" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: "https://thestalwart.com",
      "Content-Type": "application/json",
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : typeof body === "string" || body instanceof Uint8Array
          ? body
          : JSON.stringify(body),
  });
  const response = await worker.fetch(request, env, {
    waitUntil: (p) => p.catch(() => {}),
  });
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json(),
  };
}
async function ticket(env, byte = 0, kind = "book", chosen = items) {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        content: [
          { type: "tool_use", name: "record_items", input: { items: chosen } },
        ],
      }),
    );
  try {
    const r = await req(
      env,
      "/api/analyze?kind=" + kind,
      new Uint8Array([137, 80, 78, 71, byte]),
      { "Content-Type": "image/png" },
    );
    assert.equal(r.status, 200);
    return r.data.token;
  } finally {
    globalThis.fetch = original;
  }
}
const submission = (token, overrides = {}) => ({
  token,
  items,
  consent: "ninebooks-cc0-v2",
  attribution: "public",
  display_name: "Reader",
  source_url: "",
  ...overrides,
});

test("punctuation, spacing and case variants share a book identity", async () => {
  const a = await itemRecord({
    title: "Moby-Dick",
    creator: "Herman Melville",
  });
  for (const title of ["Moby Dick", "MOBYDICK", " Moby—Dick "])
    assert.equal(
      (await itemRecord({ title, creator: "HERMAN MELVILLE" })).id,
      a.id,
    );
  assert.notEqual(
    (await itemRecord({ title: "Moby Dick", creator: "Other Author" })).id,
    a.id,
  );
});
test("a confirmed list persists as exactly nine linked books, retries are idempotent and exports omit private fields", async () => {
  const env = setup(),
    token = await ticket(env);
  const saved = await req(env, "/api/lists", submission(token));
  assert.equal(saved.status, 201);
  const retry = await req(env, "/api/lists", submission(token));
  assert.equal(retry.data.id, saved.data.id);
  const list = (await req(env, "/api/lists/" + saved.data.id)).data;
  assert.equal(list.items.length, 9);
  assert.deepEqual(
    list.items.map((b) => b.position),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  const exp = (await req(env, "/api/export")).data;
  assert.equal(exp.lists.length, 1);
  assert.equal(exp.next_after, null);
  for (const field of [
    "image_hash",
    "review_nonce",
    "consent_version",
    "SIGNING_SECRET",
  ])
    assert.ok(!JSON.stringify(exp).includes(field));
  assert.deepEqual((await req(env, "/api/stats")).data, {
    lists: 1,
    books: 9,
    albums: 0,
    readers: 1,
  });
  const repeated = await req(
    env,
    "/api/analyze",
    new Uint8Array([137, 80, 78, 71, 0]),
    { "Content-Type": "image/png" },
  );
  assert.equal(repeated.data.existing_id, saved.data.id);
});
test("consent, a valid ticket and nine different complete books are mandatory", async () => {
  const env = setup(),
    token = await ticket(env);
  for (const override of [
    { consent: false },
    { token: "bad" },
    { items: items.slice(0, 8) },
    { items: Array(9).fill(items[0]) },
    { items: [null, ...items.slice(1)] },
    { items: [{ title: "", creator: "A" }, ...items.slice(1)] },
    { source_url: "javascript:alert(1)" },
    { source_url: "https://evil.com/some/status/123" },
  ])
    assert.equal(
      (await req(env, "/api/lists", submission(token, override))).status,
      400,
    );
  assert.deepEqual((await req(env, "/api/stats")).data, {
    lists: 0,
    books: 0,
    albums: 0,
    readers: 0,
  });
});
test("co-occurrences keep entire lists connected and do not create phantom pairings", async () => {
  const env = setup();
  const a = await req(env, "/api/lists", submission(await ticket(env, 1)));
  const alternate = [
    items[0],
    items[1],
    ...items.slice(2).map((b) => ({ ...b, title: "Different " + b.title })),
  ];
  await req(
    env,
    "/api/lists",
    submission(await ticket(env, 2), { items: alternate }),
  );
  const id = (await itemRecord(items[0])).id;
  const related = (await req(env, "/api/items/" + id + "/related")).data;
  assert.equal(related.list_count, 2);
  assert.equal(related.related[0].shared_lists, 2);
  assert.equal(related.related[0].jaccard, 1);
  assert.equal(related.related.length, 15);
  assert.equal(related.related.filter((b) => b.shared_lists === 1).length, 14);
  assert.equal((await req(env, "/api/lists?item=" + id)).data.lists.length, 2);
  assert.equal((await req(env, "/api/items?q=mobydick")).data.items[0].id, id);
  const onlyA = (await itemRecord(items[2])).id;
  const r = (await req(env, "/api/items/" + onlyA + "/related")).data;
  assert.equal(r.related.length, 8);
  assert.ok(!r.related.some((b) => b.title.startsWith("Different")));
  assert.equal(
    (await req(env, "/api/lists?item=" + onlyA)).data.lists[0].id,
    a.data.id,
  );
});
test("snapshot cursor excludes newer lists and export pagination advances at 100", async () => {
  const env = setup();
  env.IP_HOURLY_LIMIT = "500";
  env.DAILY_ANALYSIS_LIMIT = "500";
  for (let i = 0; i < 102; i++)
    await req(env, "/api/lists", submission(await ticket(env, i)));
  const first = (await req(env, "/api/export")).data;
  assert.equal(first.lists.length, 100);
  assert.equal(first.until, 102);
  assert.equal(first.next_after, 100);
  await req(env, "/api/lists", submission(await ticket(env, 103)));
  const second = (await req(env, "/api/export?after=100&until=102")).data;
  assert.equal(second.lists.length, 2);
  assert.equal(second.next_after, null);
});
test("per-IP quota stops paid model calls after the limit", async () => {
  const env = setup();
  env.IP_HOURLY_LIMIT = "1";
  await ticket(env);
  const r = await req(
    env,
    "/api/analyze",
    new Uint8Array([137, 80, 78, 71, 2]),
    { "Content-Type": "image/png" },
  );
  assert.equal(r.status, 429);
});
test("global quota, upload bounds, malformed requests and untrusted origins fail safely", async () => {
  const env = setup();
  env.DAILY_ANALYSIS_LIMIT = "0";
  assert.equal(
    (
      await req(env, "/api/analyze", new Uint8Array([137, 80, 78, 71]), {
        "Content-Type": "image/png",
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await req(env, "/api/analyze", "not an image", {
        "Content-Type": "image/png",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req(env, "/api/analyze", new Uint8Array(5 * 1024 * 1024 + 1), {
        "Content-Type": "image/png",
      })
    ).status,
    413,
  );
  assert.equal((await req(env, "/api/lists", "{")).status, 400);
  assert.equal((await req(env, "/api/lists", "null")).status, 400);
  assert.equal(
    (await req(env, "/api/lists", {}, { Origin: "https://evil.invalid" }))
      .status,
    403,
  );
  const response = await worker.fetch(
    new Request("https://test.invalid/api/analyze", {
      method: "OPTIONS",
      headers: { Origin: "https://thestalwart.com" },
    }),
    env,
    {},
  );
  assert.equal(response.status, 204);
  assert.equal(
    (await req(env, "/api/stats")).headers.get("Access-Control-Allow-Origin"),
    "*",
  );
});
test("model errors never return a publish ticket", async () => {
  const env = setup(),
    original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("{}", { status: 503 });
    const r = await req(
      env,
      "/api/analyze",
      new Uint8Array([137, 80, 78, 71]),
      { "Content-Type": "image/png" },
    );
    assert.equal(r.status, 502);
    assert.ok(!r.data.token);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ content: [] }));
    assert.equal(
      (
        await req(env, "/api/analyze", new Uint8Array([137, 80, 78, 71]), {
          "Content-Type": "image/png",
        })
      ).status,
      422,
    );
  } finally {
    globalThis.fetch = original;
  }
});
