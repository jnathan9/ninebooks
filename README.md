# Nine Books + Albums

[Contribute and explore](https://thestalwart.com/ninebooks/) · **[Browse the database](data/BROWSE.md)** · [Issues](https://github.com/jnathan9/ninebooks/issues)

## Browse the database

**[Read the complete nine-book and nine-album lists](data/BROWSE.md)** — a readable
view right here on GitHub, with every nine kept together.

| What you want to see | Open it on GitHub |
| --- | --- |
| People's complete lists | [Browse lists](data/BROWSE.md) |
| Every contributed book | [Books table](data/books.csv) |
| Every contributed album | [Albums table](data/albums.csv) |
| Books and albums liked by the same people | [Connections table](data/connections.csv) |
| The full dataset for your own analysis | [All files and data dictionary](data/README.md) |

GitHub displays the CSV files as tables. The readable view and data files refresh
with the hourly export. For the latest submissions, use the [live collection](https://thestalwart.com/ninebooks/#lists).

## About the project

Upload an image of nine favorite books or nine favorite albums. Review the model's
identifications and publish the complete list as open data. Link your book and
album lists to discover what people who love your books listen to, and what
people who love your music read.

**The list is the unit of observation.** Every list keeps nine distinct titles,
their positions in the original image, and a permanent list ID. Each list also
has a category and a public contributor (`reader_id`) ID. Positions are not ranks.

## The experience

1. Choose books or albums and upload a JPEG, PNG or WebP (up to 5 MiB).
2. Claude identifies the title and author/artist for each of nine slots.
   Unclear slots stay editable; contributors check every entry before publishing.
3. Choose anonymous (the default), or attach a public name/handle and optional
   original X post link. Anonymous mode strips both fields at the server. Explicitly
   consent to CC0 publication of the list, attribution and contributor links.
4. Add the other kind of list. A private pairing code, remembered on the browser,
   explicitly links the lists to the same contributor. Copy it to link from
   another device. Uncheck the linking option for somebody else's list.
5. Click a title to explore other titles on the same lists, then books/albums
   selected by the same contributors. Inspect complete source lists and profiles.

Display names never merge contributors. Pairing is pseudonymous and self-reported;
it is not proof of a real-world identity. A shared device should use separate
contributors. Keep the pairing code private: possession permits adding lists to
that contributor, but not editing or deleting existing lists. The public list
link and public contributor ID do not contain the pairing code.

An anonymous list linked to an earlier named list can still be identifiable via
that contributor's public profile. The form explains this; start a separate
contributor to keep those lists apart.

## Open data

[Data dictionary, files and limitations](data/README.md)

The database starts empty; test or generated taste profiles are not published.
The public API exposes live data without authentication. GitHub Actions attempts
an hourly snapshot at 17 minutes past the hour (schedules may be delayed).

- `lists.jsonl`: one complete list per line, including its category, contributor
  ID, and all nine items.
- `items.csv`, `books.csv`, `albums.csv`: bibliographic/music identities.
- `lists.csv`, `list_items.csv`: relational tables preserving complete lists.
- `cooccurrences.csv`: counts of lists that include each pair of titles.
- `book_album_connections.csv`: counts of **distinct contributors** choosing
  both the book and album. Multiple lists from one contributor count once.

For example, this SQLite query finds albums selected by people who chose a book
(after importing `items.csv`, `lists.csv`, and `list_items.csv`):

```sql
SELECT album.title, album.creator, COUNT(DISTINCT bl.reader_id) AS shared_readers
FROM lists bl
JOIN list_items chosen ON chosen.list_id = bl.id
JOIN lists al ON al.reader_id = bl.reader_id AND al.kind = 'album'
JOIN list_items picks ON picks.list_id = al.id
JOIN items album ON album.id = picks.item_id
WHERE chosen.item_id = :book_id
GROUP BY album.id
ORDER BY shared_readers DESC;
```

Same-category results show shared-list counts and the API also returns Jaccard
similarity. Cross-category results use distinct contributors and report how many
people have supplied the other kind of list. Missing album lists aren't dislikes.

## API

Base: `https://ninebooks-api.pages.dev`

| Endpoint | Result |
| --- | --- |
| `GET /api/stats` | Counts of lists, books, albums and contributors |
| `GET /api/items?kind=book&q=moby` | Up to 50 titles/authors; use `kind=album` for titles/artists |
| `GET /api/items/{id}/related` | Same-list and cross-category connections, with sample counts |
| `GET /api/lists?item={id}` | Complete lists containing a title |
| `GET /api/lists?reader={id}` | Lists explicitly linked to one contributor |
| `GET /api/lists?kind=album&before={seq}` | Filtered lists, 24 per page |
| `GET /api/lists/{id}` | One complete shareable list |
| `GET /api/export?after=0` | Schema v2 export, up to 100 complete lists per page |

For exports retain the first response's `until` value on subsequent requests,
and follow `next_after` until null. Monotonic sequence pagination excludes later
inserts from that snapshot. GET endpoints permit cross-origin reuse. Run
`python scripts/export.py` (standard library only) for the complete derived files.

## Develop and deploy your own copy

Node 22.13+, Python 3.10+, Cloudflare Pages/D1 and an Anthropic API key are required.
The frontend is static HTML/CSS/JS hosted at `/ninebooks/` on GitHub Pages. The
backend is an advanced-mode Worker on Cloudflare Pages; it has no runtime npm
dependencies. This repository is the frontend source of truth; copy `public/`
together into the website's `ninebooks/` directory when updating it.

1. Fork, run `npm ci`, and create your own D1 database with `npx wrangler d1 create ninebooks`.
2. Replace resource names/IDs in `wrangler.toml` and the project name in the
   deployment script in `package.json`. Do not deploy against the original resources.
3. Run `npx wrangler d1 migrations apply ninebooks --local`. Copy
   `.dev.vars.example` to `.dev.vars` and set local secrets; never commit them.
4. Run `npm run dev`. Serve `public/` separately and point `public/config.js` at
   your local backend. Include that frontend origin in local `ALLOWED_ORIGINS`.
5. Create your Pages project, apply migrations with `--remote`, configure the
   D1 binding `DB`, and set secrets with `wrangler pages secret put`:
   `ANTHROPIC_API_KEY` and a random 32-byte `SIGNING_SECRET`.
6. Set the production frontend origin and model/quota variables in `wrangler.toml`.
   Run `npm run deploy`. Update API URLs in `public/config.js` and `scripts/export.py`
   for your own backend. Publish the frontend through your website host.

Migrations preserve the original book schema before extending it to books,
albums and contributors. Book IDs retain their original format; album IDs add
a category prefix before hashing. See the data dictionary for normalization.

## Privacy, cost controls and maintenance

Images are processed in memory and sent to Anthropic; this app doesn't retain
or publish them. Anthropic's API data handling policies apply. Public exports
exclude raw images, image hashes, review tickets, pairing codes, IPs and secrets.
Consent makes contributor links public even when no display name is provided.
Git history and other people's copies may persist indefinitely after a removal.

Recognition uses paid Claude Haiku 4.5 by default (`MODEL` is configurable).
Durable quotas allow 5 attempts per IP per hour and 200 globally per UTC day,
including failed calls. These are count limits, not dollar budgets. Adjust
`IP_HOURLY_LIMIT` and `DAILY_ANALYSIS_LIMIT` deliberately. Daily salted HMACs are
used for IP counters; the app never stores raw IPs. Expired counters are removed
during later recognition calls. Infrastructure may keep its own access metadata.

Publishing requires a signed 24-hour recognition ticket, nine distinct titles
and explicit consent. Pairing tokens are signed for a separate purpose and
expire after ten years. Rotating `SIGNING_SECRET` invalidates them. Writes are
atomic; repeated images and retried publishes resolve to the existing list.
Origin checks are not bot protection; quotas bound model usage. There is no
account system, identity verification, automated moderation or self-service edit.

Open an issue with a list URL for corrections/removals; don't post private codes.
An authorized maintainer can correct D1 and rerun **Refresh open dataset**.
This doesn't erase old public copies or Git history. GitHub may disable scheduled
workflows after prolonged repository inactivity; maintainers should check Actions.

`npm test` checks recognition parsing, complete-list storage, normalization,
consent, retry behavior, quotas, pagination, pairing security, and cross-category
counts using real SQLite. `python -m unittest discover -s test -p 'test_*.py'`
checks exports. Test fixtures never enter the production dataset.

## Licenses

Code: [MIT](LICENSE). Contributed data: [CC0 1.0](data/LICENSE).
