"""Local humanizer primitives used by the failover integration layer.

This module intentionally has no third-party dependencies so it can run when
cloud providers or optional Python packages are unavailable.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class HumanizerConfig:
    intensity: float = 0.65
    warmth: float = 0.5
    seed: Optional[int] = None


@dataclass
class HumanizationResult:
    original_text: str
    humanized_text: str
    naturalness_score: float
    burstiness_before: float
    burstiness_after: float
    entropy_before: float
    entropy_after: float
    feedback_loops: int
    changes_applied: int
    is_natural: bool
    engine_used: str = "local"
    fallback_engine: bool = False
    processing_time_ms: float = 0.0
    timestamp: str = ""
    detected_language: str = "unknown"
    error_message: Optional[str] = None


@dataclass
class CloudProviderConfig:
    name: str
    base_url: str
    api_key_env_var: str
    model: str
    timeout_seconds: float = 30.0
    max_retries: int = 2
    priority: int = 0
    enabled: bool = True


class LanguageDetector:
    """Small dependency-free French/English language detector."""

    _french = {"le", "la", "les", "des", "une", "est", "dans", "pour", "avec", "que", "qui", "et"}
    _english = {"the", "and", "of", "to", "is", "in", "for", "with", "that", "this", "are"}

    @classmethod
    def detect_language(cls, text: str) -> tuple[str, float]:
        words = re.findall(r"[\wÀ-ÿ]+", text.lower())
        if not words:
            return "unknown", 0.0
        french = sum(word in cls._french for word in words)
        english = sum(word in cls._english for word in words)
        total = french + english
        if total == 0:
            return "unknown", 0.0
        if french == english:
            return "mixed", 0.5
        return ("fr", french / total) if french > english else ("en", english / total)


class TextHumanizer:
    """Conservative local fallback that preserves the source text's meaning."""

    _space = re.compile(r"\s+")

    def _evaluate_naturalness(self, text: str) -> float:
        words = re.findall(r"[\wÀ-ÿ']+", text.lower())
        if not words:
            return 0.0
        diversity = len(set(words)) / len(words)
        sentence_lengths = [len(re.findall(r"[\wÀ-ÿ']+", sentence)) for sentence in re.split(r"[.!?]+", text) if sentence.strip()]
        variation = 0.0
        if len(sentence_lengths) > 1:
            mean = sum(sentence_lengths) / len(sentence_lengths)
            variation = min(1.0, (max(sentence_lengths) - min(sentence_lengths)) / max(mean, 1))
        return round(min(100.0, 55.0 + diversity * 30.0 + variation * 15.0), 2)

    def humanize(self, text: str) -> HumanizationResult:
        original = text.strip()
        normalized = self._space.sub(" ", original)
        score = self._evaluate_naturalness(normalized)
        return HumanizationResult(
            original_text=original,
            humanized_text=normalized,
            naturalness_score=score,
            burstiness_before=0.0,
            burstiness_after=0.0,
            entropy_before=0.0,
            entropy_after=0.0,
            feedback_loops=0,
            changes_applied=int(normalized != original),
            is_natural=score >= 72.0,
        )


class FailoverManager:
    """Synchronous local fallback facade kept for API compatibility."""

    def __init__(self, local_humanizer: Optional[TextHumanizer] = None) -> None:
        self.local_humanizer = local_humanizer or TextHumanizer()

    def humanize(self, text: str, config: Optional[HumanizerConfig] = None) -> HumanizationResult:
        return self.local_humanizer.humanize(text)


def humanize_text_with_failover(
    text: str,
    config: Optional[HumanizerConfig] = None,
    use_cloud: bool = True,
) -> Dict[str, Any]:
    """Return a JSON-serializable local result when no cloud bridge is available."""
    result = TextHumanizer().humanize(text)
    result.engine_used = "local"
    result.fallback_engine = bool(use_cloud and not any(os.getenv(name) for name in ("GEMINI_API_KEY", "QWEN_API_KEY", "DEEPSEEK_API_KEY")))
    return {
        "original_text": result.original_text,
        "humanized_text": result.humanized_text,
        "naturalness_score": result.naturalness_score,
        "burstiness_before": result.burstiness_before,
        "burstiness_after": result.burstiness_after,
        "entropy_before": result.entropy_before,
        "entropy_after": result.entropy_after,
        "feedback_loops": result.feedback_loops,
        "changes_applied": result.changes_applied,
        "is_natural": result.is_natural,
        "engine_used": result.engine_used,
        "fallback_engine": result.fallback_engine,
        "detected_language": LanguageDetector.detect_language(text)[0],
        "error_message": None,
    }
