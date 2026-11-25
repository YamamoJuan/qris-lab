# samples/

Real QRIS samples (images or payload text) go in `samples/private/`, which is
git-ignored. They contain real merchant identifiers (NMID, merchant PAN, name,
city) and must never be committed or published.

Automated tests use only **synthetic** payloads defined in `tests/`.

Rules:

- Use only QRIS issued to a merchant account you own or are authorised to analyse.
- Do not share decoded payloads in issues, PRs, or chat logs.
- A dynamic QRIS issued by GoPay is a live, single-use payment request until it
  expires; treat it as sensitive.
