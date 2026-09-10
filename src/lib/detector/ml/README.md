# Oligens ML detection layer

This directory is reserved for the independently trained statistical detector.

## Production rule
The detector must be trained and evaluated on datasets that contain human, AI,
paraphrased, translated, humanized and mixed documents. Do not claim accuracy
without a held-out benchmark.

Required metrics:
- precision, recall and F1
- false-positive rate and false-negative rate
- ROC-AUC / PR-AUC
- calibration error
- confusion matrix
- performance by language and document length

The production TypeScript engine remains the deterministic fallback. A trained
model may be fused into the calibrated pipeline only after validation and
probability calibration.
