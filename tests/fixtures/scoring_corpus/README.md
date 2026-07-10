# Scoring corpus fixtures

Offline, committed corpus fixtures for the before/after scoring harness.

- `starter_corpus.json` — a tiny **synthetic** starter set (all `label: "unknown"`).
  It exists to exercise the harness, not to assert any real-world labels.
- `template.json` — a single template entry to copy when adding a real case.

Each entry stores **SignalPack-shaped inputs**, never a pre-scored result, so the
harness can recompute scores under a different weight model. Full field docs, how
to add labeled cases, and how to read verdict flips are in
[`docs/scoring/corpus.md`](../../../docs/scoring/corpus.md).

Run the harness (identity mode, zero diff) with:

```
uv run python -m scripts.scoring.compare_scoring_corpus \
  --corpus tests/fixtures/scoring_corpus/starter_corpus.json
```

Generated reports are written under the git-ignored `scoring_reports/` directory
and must not be committed.
