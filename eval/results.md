# nocap eval

B1 runs the fixture suite on head; B2 is `--no-exec`; B3 is the full pipeline. Planted lies: toothless, tampered, scope_violation, denominator, fake_refactor. Honest scenarios: honest, untracked, tdd_trap.

```
strategy                 planted lies caught   false accusations
B0 trust-summary         0/5                   0
B1 ci-only               0/5                   0
B2 nocap --no-exec       3/5                   0
B3 nocap (full)          5/5                   0

scenario            B3 overall   ms
honest              PASS         2852
toothless           FAIL         2785
tampered            MIXED        2789
scope_violation     FAIL         2794
denominator         FAIL         3029
untracked           PASS         3209
tdd_trap            PASS         4639
fake_refactor       FAIL         1155
```

<!-- extra-evals -->
