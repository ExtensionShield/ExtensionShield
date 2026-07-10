"""Offline scoring tooling (calibration corpus + before/after diff harness).

These modules import only local scoring code and read local JSON. They never
call external APIs, trigger scans, or touch any database. See
``compare_scoring_corpus`` and ``docs/scoring/corpus.md``.
"""
