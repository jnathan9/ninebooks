# The open Nine Books + Albums dataset

**License: [CC0 1.0](LICENSE).** Contributors opt in to public-domain dedication
of their list data, optional attribution and links between their lists. Code
outside this directory is MIT licensed.

The dataset starts empty. No example or test taste profiles are mixed into real
contributions. GitHub Actions attempts hourly refreshes at 17 minutes past the
hour, subject to scheduling delays. [Live API](https://ninebooks-api.pages.dev/api/export).

| File | Unit |
| --- | --- |
| `lists.jsonl` | One complete list, with all nine items and contributor ID |
| `lists.csv` | One list: ID, kind, reader ID, timestamp, optional attribution, model, schema version |
| `items.csv` | Item ID, kind (`book` or `album`), title, creator |
| `books.csv` | Book-only view: ID, title, author |
| `albums.csv` | Album-only view: ID, title, artist |
| `list_items.csv` | List ID, item ID, position (1–9) |
| `cooccurrences.csv` | Unordered same-category item pair and number of shared lists |
| `book_album_connections.csv` | Book ID, album ID and number of distinct shared contributors |
| `manifest.json` | Schema version, license, counts and latest contribution time |

`reader_id` is a random public identifier linking lists explicitly paired by
the contributor. It does not reveal the private pairing code. Matching display
names do not link people. Pairing is self-reported, not verified identity.
Older unpaired records can have a null reader ID and don't enter cross-category
counts. Every list has nine distinct items and contributes 36 unordered within-list
pairs. Image positions preserve layout, not rank. The export format is version 2.

Each contributor's distinct book set is paired with their distinct album set to
build cross-category counts. Repeated lists don't multiply that person's vote.
Keep `reader_id` and `list_id` when doing your own analysis: they preserve both
within-list and between-category relationships. Missing album lists are unknown,
not negative preferences.

IDs use the first 24 hex characters of SHA-256. Book input is normalized title,
newline, normalized creator. Album input prepends `album` and a newline.
Normalization applies Unicode NFKC, lowercase, punctuation/spacing folding and
space removal. Thus Moby-Dick, Moby Dick and Mobydick by the same author share
an ID, but a book and album with identical title/creator do not.

This is not a reconciled bibliographic or discographic authority. Subtitle,
translation, edition and creator aliases can still split identities. Contributors
review machine readings; mistakes remain possible. Repeated identical image bytes
are rejected, but crops/re-encodes, dishonest profiles and repeat contributors
aren't reliably detected. Samples are self-selected and popularity-biased.
Co-occurrence is association, not causation, verified purchases or a rating.

CSV prefixes spreadsheet-formula-like values with an apostrophe for safer opening.
JSONL preserves exact text and is preferred for analysis. Private images, IPs,
hashes, review tickets, pairing codes and credentials are never exported.
Public copies and Git history can persist after corrections or removal.
