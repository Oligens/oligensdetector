import re
import math
from typing import List, Dict, Set
from dataclasses import dataclass
from collections import Counter


@dataclass
class TextFeatures:
    """
    Container for extracted text features used in AI detection.
    All scores are normalized to 0-100 range.
    """
    signature_score: float = 0.0
    entropy_diversity_index: float = 0.0
    verb_diversity: float = 0.0
    hedging_phrases: float = 0.0
    transition_markers: float = 0.0
    repetition_patterns: float = 0.0
    avg_sentence_complexity: float = 0.0
    punctuation_variability: float = 0.0
    overall_ai_probability: float = 0.0


class FeatureExtractor:
    """
    Extracts linguistic features from text that help distinguish human-written
    from AI-generated content using multilingual patterns and statistical measures.
    """

    def __init__(self):
        self._compile_regex_patterns()
        self._initialize_multilingual_signatures()

    def _compile_regex_patterns(self):
        """Compile frequently used regex patterns for performance."""
        self.word_pattern = re.compile(r'\b\w+\b', re.IGNORECASE | re.UNICODE)
        self.sentence_pattern = re.compile(r'[.!?]+')
        self.whitespace_pattern = re.compile(r'\s+')
        
        # French and English verb endings with negative lookbehind for noun suffixes
        self.verb_endings_fr = r'(?:er|ez|ons|ont|ent|ais|ait|ions|iez|aient|ai|as|at|âmes|âtes|èrent|rai|ras|ra|rons|rés|ront|erais|erait|erions|eriez|eraient|erai|eras|era|erons|erez|eront)$'
        self.verb_endings_en = r'(?:ing|ed|es|s|d)$'
        
        # Negative lookbehind for common noun suffixes that might falsely match verb patterns
        self.noun_suffix_blacklist = [
            'eur', 'ier', 'aire', 'oire', 'iste', 'tion', 'sion', 'ment', 
            'ness', 'nesses', 'ment', 'ments', 'ing', 'er', 'or', 'ary',
            'ory', 'ry', 'ly', 'al', 'ial', 'ian', 'ian', 'ism', 'ist',
            'ship', 'hood', 'dom', 'ness', 'ful', 'less', 'ous', 'ive', 'able'
        ]
        # Create a single pattern to exclude noun-like endings
        self.noun_exclude_pattern = re.compile(
            r'(?:' + '|'.join([f'{suffix}$' for suffix in self.noun_suffix_blacklist]) + ')', 
            re.IGNORECASE
        )

    def _initialize_multilingual_signatures(self):
        """Initialize comprehensive multilingual signature patterns."""
        # GPT-specific signatures - FR + EN
        self.gpt_signatures = [
            r'\bgpt\b', r'\bchatgpt\b', r'\bgenerative ai\b', r'\blanguage model\b',
            r'\bje suis un modèle de langage\b', r'\bje suis un assistant\b',
            r'\bopenai\b', r'\bmaintenant, permettez-moi\b', r'\bvoici ce que\b',
            r'\ben tant que modèle d\'intelligence artificielle\b',
            r'\bas an ai\b', r'\bbeing an ai\b', r'\bje ne peux pas ressentir\b',
            r'\bi cannot feel\b', r'\bje suis limité à\b', r'\bi am limited to\b',
            r'\bje ne peux pas avoir d\'opinions\b', r'\bi cannot have opinions\b',
            r'\bje ne suis pas capable de\b', r'\bi am not able to\b',
            r'\bdésolé, mais\b', r'\bsorry, but\b', r'\bje dois préciser\b',
            r'\bi must clarify\b', r'\bvoici les informations disponibles\b',
            r'\bhere is the information available\b'
        ]
        
        # Claude-specific signatures - FR + EN
        self.claude_signatures = [
            r'\bclaude\b', r'\banthropic\b', r'\banthropique\b',
            r'\bje suis conçu pour être utile, inoffensif et honnête\b',
            r'\bi am designed to be helpful, harmless, and honest\b',
            r'\bje ne peux pas vous dire\b', r'\bi cannot tell you\b',
            r'\bje dois être prudent\b', r'\bi must be careful\b',
            r'\bvoici mon analyse\b', r'\bhere is my analysis\b',
            r'\bje dois noter\b', r'\bi must note\b', r'\bcela dit\b',
            r'\bthat said\b', r'\bje dois souligner\b', r'\bi must emphasize\b',
            r'\bje suis un modèle d\'intelligence artificielle\b',
            r'\bi am an ai model\b', r'\bje dois préciser que\b',
            r'\bi must specify that\b', r'\bceci est un modèle de\b',
            r'\bthis is a model of\b'
        ]
        
        # Llama-specific signatures - FR + EN
        self.llama_signatures = [
            r'\bllama\b', r'\bmeta\b', r'\blarge language model\b',
            r'\bmodèle de langage large\b', r'\bje suis un modèle open source\b',
            r'\bi am an open source model\b', r'\bje ne suis pas un être humain\b',
            r'\bi am not a human\b', r'\bje suis un modèle de Meta\b',
            r'\bi am a model by Meta\b', r'\bje ne peux pas agir\b',
            r'\bi cannot act\b', r'\bje suis un système informatique\b',
            r'\bi am a computer system\b', r'\bje ne peux pas expérimenter\b',
            r'\bi cannot experience\b', r'\bje suis conçu pour\b',
            r'\bi am designed to\b', r'\bje dois mentionner\b',
            r'\bi must mention\b', r'\bje ne peux pas former d\'opinion\b',
            r'\bi cannot form an opinion\b'
        ]
        
        # Gemini-specific signatures - FR + EN
        self.gemini_signatures = [
            r'\bgemini\b', r'\bgoogle\b', r'\bdeepmind\b', r'\bje suis Gemini\b',
            r'\bi am Gemini\b', r'\bje suis un modèle Google\b',
            r'\bi am a Google model\b', r'\bje suis conçu pour aider\b',
            r'\bi am designed to assist\b', r'\bje dois préciser que je suis\b',
            r'\bi must specify that I am\b', r'\bje ne suis pas un être humain réel\b',
            r'\bi am not a real human\b', r'\bje suis un modèle d\'intelligence artificielle de Google\b',
            r'\bi am a Google AI model\b', r'\bje ne peux pas effectuer d\'actions\b',
            r'\bi cannot perform actions\b', r'\bje dois me souvenir que\b',
            r'\bi must remember that\b', r'\bje suis un modèle de recherche\b',
            r'\bi am a research model\b', r'\bje ne peux pas vous dire ce que\b',
            r'\bi cannot tell you what\b'
        ]
        
        # Compile all signature patterns
        self.compiled_gpt = [re.compile(sig, re.IGNORECASE) for sig in self.gpt_signatures]
        self.compiled_claude = [re.compile(sig, re.IGNORECASE) for sig in self.claude_signatures]
        self.compiled_llama = [re.compile(sig, re.IGNORECASE) for sig in self.llama_signatures]
        self.compiled_gemini = [re.compile(sig, re.IGNORECASE) for sig in self.gemini_signatures]
        
        # Transition markers - FR + EN
        self.LLM_TRANSITION_MARKERS = [
            r'\bindeed\b', r'\bin fact\b', r'\bin other words\b', r'\bmoreover\b',
            r'\bfurthermore\b', r'\badditionally\b', r'\balternatively\b',
            r'\bhence\b', r'\bthus\b', r'\bconsequently\b', r'\btherefore\b',
            r'\bas a result\b', r'\bon the other hand\b', r'\bhowever\b',
            r'\byet\b', r'\bstill\b', r'\bnevertheless\b', r'\bnonetheless\b',
            r'\balthough\b', r'\bthough\b', r'\bwhile\b', r'\bwhereas\b',
            r'\brather\b', r'\binstead\b', r'\blikewise\b', r'\bsimilarly\b',
            r'\bcertainly\b', r'\bof course\b', r'\btoday\b', r'\bcurrently\b',
            r'\bpresently\b', r'\brecently\b', r'\bnow\b', r'\bfirst\b',
            r'\bsecond\b', r'\bthird\b', r'\bfinally\b', r'\bultimately\b',
            r'\bessentially\b', r'\bgenerally\b', r'\boverall\b', r'\bfrankly\b',
            r'\bhonestly\b', r'\bactually\b', r'\breally\b', r'\bindeed\b',
            r'\bparticularly\b', r'\bespecially\b', r'\bnotably\b', r'\bprimarily\b',
            r'\bmainly\b', r'\bchiefly\b', r'\bmostly\b', r'\blargely\b',
            r'\bmainly\b', r'\bmostly\b', r'\bprimarily\b', r'\babove all\b',
            r'\bmost importantly\b', r'\bfirst and foremost\b', r'\bto begin with\b',
            r'\bto conclude\b', r'\bin conclusion\b', r'\bto summarize\b',
            r'\ben somme\b', r'\bdonc\b', r'\ncar\b', r'\bainsi\b',
            r'\bpar conséquent\b', r'\bpar ailleurs\b', r'\bde plus\b',
            r'\bde surcroît\b', r'\balors\b', r'\bnéanmoins\b', r'\btoutefois\b',
            r'\bcependant\b', r'\bquoique\b', r'\bmais\b', r'\bcependant\b',
            r'\bquant à\b', r'\bquant aux\b', r'\bquant au\b', r'\bdu point de vue\b',
            r'\bde manière générale\b', r'\ben général\b', r'\bessentiellement\b',
            r'\bnotamment\b', r'\bspécialement\b', r'\bparticulièrement\b',
            r'\bprincipalement\b', r'\bavant tout\b', r'\bfinalement\b',
            r'\bà première vue\b', r'\bapparemment\b', r'\bsemble-t-il\b',
            r'\bsoit\b', r'\bdisons\b', r'\bmettons\b', r'\bautrement dit\b',
            r'\ben d\'autres termes\b', r'\bautrement dit\b', r'\bà savoir\b'
        ]
        
        # Hedging phrases - FR + EN
        self.HEDGING_PHRASES = [
            r'\bit seems\b', r'\tit appears\b', r'\bit could be\b', r'\bmay be\b',
            r'\bmight be\b', r'\bperhaps\b', r'\bpossibly\b', r'\blikely\b',
            r'\bprobably\b', r'\bcould be\b', r'\bcan be\b', r'\bappears to be\b',
            r'\bseems to be\b', r'\bis likely\b', r'\bis probable\b', r'\bis possible\b',
            r'\bshould be\b', r'\bwould be\b', r'\bthere is a chance\b',
            r'\bthere is a possibility\b', r'\bthere is a likelihood\b',
            r'\bil semble\b', r'\til apparaît\b', r'\til pourrait être\b',
            r'\bpeut-être\b', r'\bpossiblement\b', r'\bprobablement\b',
            r'\bsemble être\b', r'\bparaît être\b', r'\best susceptible\b',
            r'\best vraisemblablement\b', r'\best possible\b', r'\bdevrait être\b',
            r'\bserait\b', r'\bil y a une chance\b', r'\bil y a une possibilité\b',
            r'\bil y a une probabilité\b', r'\bpeut-\?tre\b', r'\bcertainement\b',
            r'\bsûrement\b', r'\bassurément\b', r'\bprétendument\b',
            r'\bsupposedly\b', r'\breportedly\b', r'\bapparently\b',
            r'\bso-called\b', r'\bsupposément\b', r'\bprésumément\b',
            r'\bthéoriquement\b', r'\bconceptuellement\b', r'\ben principe\b',
            r'\bin principle\b', r'\bin theory\b', r'\btheoretically\b',
            r'\bconceptually\b', r'\bin essence\b', r'\bespècelement\b',
            r'\bin practice\b', r'\ben pratique\b', r'\bpractically\b',
            r'\bpratiquement\b', r'\beffectivement\b', r'\bin effect\b',
            r'\bessentiellement\b', r'\bin essence\b', r'\bvirtually\b',
            r'\bvirtuellement\b', r'\brelativement\b', r'\brelatively\b'
        ]
        
        # Compile transition and hedging patterns
        self.compiled_transitions = [re.compile(marker, re.IGNORECASE) for marker in self.LLM_TRANSITION_MARKERS]
        self.compiled_hedging = [re.compile(phrase, re.IGNORECASE) for phrase in self.HEDGING_PHRASES]

    def extract_features(self, text: str) -> TextFeatures:
        """Extract all linguistic features from the input text."""
        if not text or len(text.strip()) < 10:
            return TextFeatures()
        
        # Normalize text
        normalized_text = self.whitespace_pattern.sub(' ', text).strip()
        tokens = self.word_pattern.findall(normalized_text)
        sentences = self.sentence_pattern.split(normalized_text)
        word_count = len(tokens)
        
        if word_count == 0:
            return TextFeatures()
        
        # Calculate individual features
        signature_score = self._signature_score(normalized_text)
        entropy_diversity_index = self._calculate_entropy_diversity_index(tokens)
        verb_diversity = self._calculate_verb_diversity(tokens)
        hedging_score = self._calculate_hedging_score(normalized_text)
        transition_score = self._calculate_transition_score(normalized_text)
        repetition_score = self._calculate_repetition_score(tokens)
        avg_complexity = self._calculate_avg_sentence_complexity(sentences, tokens)
        punctuation_variability = self._calculate_punctuation_variability(text)
        
        # Calculate overall AI probability (weighted combination)
        # Higher weights for features that strongly indicate AI generation
        overall_ai_prob = (
            signature_score * 0.25 +
            entropy_diversity_index * 0.15 +
            verb_diversity * 0.10 +
            hedging_score * 0.15 +
            transition_score * 0.15 +
            repetition_score * 0.10 +
            avg_complexity * 0.05 +
            punctuation_variability * 0.05
        )
        
        # Ensure all values are within 0-100 range
        overall_ai_prob = max(0, min(100, overall_ai_prob))
        
        return TextFeatures(
            signature_score=round(signature_score, 2),
            entropy_diversity_index=round(entropy_diversity_index, 2),
            verb_diversity=round(verb_diversity, 2),
            hedging_phrases=round(hedging_score, 2),
            transition_markers=round(transition_score, 2),
            repetition_patterns=round(repetition_score, 2),
            avg_sentence_complexity=round(avg_complexity, 2),
            punctuation_variability=round(punctuation_variability, 2),
            overall_ai_probability=round(overall_ai_prob, 2)
        )

    def _signature_score(self, text: str) -> float:
        """
        Calculate signature score based on multiple AI model indicators.
        Normalized per 100 words to make it language-independent.
        """
        total_matches = 0
        word_count = len(self.word_pattern.findall(text))
        
        if word_count == 0:
            return 0.0
        
        # Check all signature types
        all_patterns = (
            self.compiled_gpt + self.compiled_claude + 
            self.compiled_llama + self.compiled_gemini
        )
        
        for pattern in all_patterns:
            matches = len(pattern.findall(text))
            total_matches += matches
        
        # Normalize to per 100 words
        normalized_score = (total_matches / word_count) * 100
        return min(100.0, normalized_score * 10)  # Boost factor for visibility

    def _calculate_entropy_diversity_index(self, tokens: List[str]) -> float:
        """
        Calculate Entropy Diversity Index (EDI) based on Shannon entropy.
        
        Methodology:
        1. Calculate word frequency distribution
        2. Compute Shannon entropy: H = -sum(p_i * log2(p_i)) where p_i is probability of word i
        3. Normalize by maximum possible entropy: H_max = log2(V) where V is vocabulary size
        4. Convert to percentage: EDI = (H / H_max) * 100
        
        Interpretation:
        - High EDI (80-100): Diverse vocabulary, likely human-written
        - Low EDI (0-30): Repetitive vocabulary, likely AI-generated
        """
        if not tokens:
            return 0.0
        
        # Count word frequencies
        word_counts = Counter(tokens)
        total_words = len(tokens)
        vocab_size = len(word_counts)
        
        if vocab_size <= 1:
            return 0.0  # No diversity
        
        # Calculate Shannon entropy
        entropy = 0.0
        for count in word_counts.values():
            probability = count / total_words
            if probability > 0:  # Avoid log(0)
                entropy -= probability * math.log2(probability)
        
        # Maximum possible entropy (when all words equally likely)
        max_entropy = math.log2(vocab_size) if vocab_size > 0 else 0.0
        
        # Normalize to [0, 1] then convert to percentage
        if max_entropy == 0:
            edi = 0.0
        else:
            edi = (entropy / max_entropy) * 100
        
        return max(0.0, min(100.0, edi))

    def _is_verb(self, word: str) -> bool:
        """
        Enhanced verb detection with multilingual support and reduced false positives.
        
        Strategy:
        1. Explicit verb list check (high precision)
        2. Noun blacklist filtering (reduce false positives)
        3. Heuristic pattern matching (context-aware)
        """
        word_lower = word.lower().strip()
        
        # Explicit verb list - high precision
        explicit_verbs = {
            # French verbs
            'être', 'avoir', 'faire', 'aller', 'pouvoir', 'vouloir', 'devoir',
            'dire', 'venir', 'voir', 'prendre', 'donner', 'savoir', 'penser',
            'croire', 'aimer', 'haïr', 'trouver', 'sembler', 'sembler',
            'sembler', 'sembler', 'sembler', 'sembler', 'sembler', 'sembler',
            'être', 'avoir', 'faire', 'aller', 'pouvoir', 'vouloir', 'devoir',
            'dire', 'venir', 'voir', 'prendre', 'donner', 'savoir', 'penser',
            'croire', 'aimer', 'haïr', 'trouver', 'sembler', 'sembler',
            
            # English verbs
            'be', 'have', 'do', 'go', 'can', 'will', 'would', 'could', 'should',
            'say', 'come', 'see', 'take', 'give', 'know', 'think', 'believe',
            'love', 'hate', 'find', 'seem', 'look', 'feel', 'make', 'get',
            'use', 'work', 'play', 'run', 'walk', 'talk', 'speak', 'read',
            'write', 'draw', 'sing', 'dance', 'sleep', 'eat', 'drink', 'buy',
            'sell', 'help', 'stop', 'turn', 'start', 'begin', 'continue',
            'finish', 'complete', 'create', 'build', 'construct', 'design',
            'develop', 'improve', 'enhance', 'modify', 'change', 'alter',
            'adapt', 'adjust', 'manage', 'handle', 'deal', 'cope', 'solve',
            'resolve', 'address', 'tackle', 'approach', 'consider', 'examine',
            'analyze', 'study', 'research', 'investigate', 'explore', 'discover'
        }
        
        if word_lower in explicit_verbs:
            return True
        
        # Check against noun blacklist to avoid false positives
        if self.noun_exclude_pattern.search(word_lower):
            return False
        
        # Heuristic checks for potential verb forms
        # French verb endings
        if re.search(self.verb_endings_fr, word_lower) and len(word) > 3:
            # Additional check to avoid common nouns ending in verb-like patterns
            if not any(noun.endswith(word_lower[-3:]) for noun in ['ordinateur', 'livre', 'table']):
                return True
        
        # English verb endings
        if re.search(self.verb_endings_en, word_lower) and len(word) > 3:
            # Additional check to avoid common nouns ending in verb-like patterns
            if not any(noun.endswith(word_lower[-3:]) for noun in ['computer', 'teacher', 'building', 'morning', 'evening']):
                return True
        
        # Contextual check: conjugated forms that don't match standard patterns
        # Common French conjugated endings
        french_conjugated = [
            'e', 'es', 'ons', 'ez', 'ent', 'ai', 'as', 'a', 'ons', 'ez', 'ent',
            'ais', 'ait', 'ions', 'iez', 'aient', 'ai', 'as', 'a', 'âmes', 'âtes', 'èrent',
            'rai', 'ras', 'ra', 'rons', 'rez', 'ront', 'erais', 'erait', 'erions', 'eriez', 'eraient'
        ]
        
        # Common English conjugated forms
        english_conjugated = [
            'ed', 'ing', 's', 'es', 'ies', 'ied', 'ying', 'yed'
        ]
        
        # Check if word ends with common conjugated endings but not noun-like
        for ending in french_conjugated:
            if word_lower.endswith(ending) and len(word) > len(ending) + 1:
                return True
        
        for ending in english_conjugated:
            if word_lower.endswith(ending) and len(word) > len(ending) + 1:
                return True
        
        return False

    def _calculate_verb_diversity(self, tokens: List[str]) -> float:
        """Calculate verb diversity ratio with improved accuracy."""
        if not tokens:
            return 0.0
        
        verbs = []
        for token in tokens:
            if self._is_verb(token):
                verbs.append(token.lower())
        
        if not verbs:
            return 0.0
        
        unique_verbs = set(verbs)
        verb_diversity = (len(unique_verbs) / len(verbs)) * 100
        
        return max(0.0, min(100.0, verb_diversity))

    def _calculate_hedging_score(self, text: str) -> float:
        """Calculate score based on hedging phrases."""
        total_matches = 0
        word_count = len(self.word_pattern.findall(text))
        
        if word_count == 0:
            return 0.0
        
        for pattern in self.compiled_hedging:
            matches = len(pattern.findall(text))
            total_matches += matches
        
        # Normalize to per 100 words
        normalized_score = (total_matches / word_count) * 100
        return min(100.0, normalized_score * 15)  # Boost factor

    def _calculate_transition_score(self, text: str) -> float:
        """Calculate score based on transition markers."""
        total_matches = 0
        word_count = len(self.word_pattern.findall(text))
        
        if word_count == 0:
            return 0.0
        
        for pattern in self.compiled_transitions:
            matches = len(pattern.findall(text))
            total_matches += matches
        
        # Normalize to per 100 words
        normalized_score = (total_matches / word_count) * 100
        return min(100.0, normalized_score * 12)  # Boost factor

    def _calculate_repetition_score(self, tokens: List[str]) -> float:
        """Calculate score based on repetitive patterns."""
        if len(tokens) < 2:
            return 0.0
        
        repetitions = 0
        total_possible = len(tokens) - 1
        
        for i in range(total_possible):
            if i < len(tokens) - 1 and tokens[i].lower() == tokens[i+1].lower():
                repetitions += 1
        
        if total_possible == 0:
            return 0.0
        
        repetition_ratio = (repetitions / total_possible) * 100
        return min(100.0, repetition_ratio * 5)  # Amplify subtle repetitions

    def _calculate_avg_sentence_complexity(self, sentences: List[str], tokens: List[str]) -> float:
        """Calculate average sentence complexity based on tokens per sentence."""
        valid_sentences = [s.strip() for s in sentences if len(s.strip()) > 0]
        
        if not valid_sentences or not tokens:
            return 0.0
        
        avg_tokens_per_sentence = len(tokens) / len(valid_sentences)
        # Normalize to 0-100 scale (assuming 1-50 tokens per sentence is reasonable range)
        normalized = ((avg_tokens_per_sentence - 1) / 49) * 100 if avg_tokens_per_sentence <= 50 else 100.0
        return max(0.0, min(100.0, normalized))

    def _calculate_punctuation_variability(self, text: str) -> float:
        """Calculate variability in punctuation usage."""
        if not text:
            return 0.0
        
        # Count different punctuation marks
        punct_marks = [char for char in text if char in '.!?;:,']
        unique_punct = set(punct_marks)
        
        # Calculate variety score
        variety = (len(unique_punct) / 6) * 100  # 6 common punctuation marks
        return max(0.0, min(100.0, variety))


class AIClassifier:
    """
    Classifies text as AI-generated or human-written based on extracted features.
    Uses weighted scoring approach with multilingual awareness.
    """
    
    def __init__(self):
        self.feature_extractor = FeatureExtractor()
    
    def classify(self, text: str) -> Dict[str, any]:
        """Classify text and return detailed results."""
        features = self.feature_extractor.extract_features(text)
        
        # Determine classification based on overall probability
        if features.overall_ai_probability >= 70:
            classification = "AI-generated"
            confidence = features.overall_ai_probability
        elif features.overall_ai_probability >= 40:
            classification = "Mixed/uncertain"
            confidence = abs(features.overall_ai_probability - 50) * 2
        else:
            classification = "Human-written"
            confidence = 100 - features.overall_ai_probability
        
        return {
            "classification": classification,
            "confidence": round(confidence, 2),
            "features": {
                "signature_score": features.signature_score,
                "entropy_diversity_index": features.entropy_diversity_index,
                "verb_diversity": features.verb_diversity,
                "hedging_phrases": features.hedging_phrases,
                "transition_markers": features.transition_markers,
                "repetition_patterns": features.repetition_patterns,
                "avg_sentence_complexity": features.avg_sentence_complexity,
                "punctuation_variability": features.punctuation_variability,
                "overall_ai_probability": features.overall_ai_probability
            },
            "interpretation": self._interpret_results(features)
        }
    
    def _interpret_results(self, features: TextFeatures) -> Dict[str, str]:
        """Provide interpretation of feature scores."""
        interpretations = {}
        
        # Signature score interpretation
        if features.signature_score > 50:
            interpretations["signature_score"] = "High signature score suggests strong AI model indicators"
        elif features.signature_score > 20:
            interpretations["signature_score"] = "Moderate signature score indicates some AI characteristics"
        else:
            interpretations["signature_score"] = "Low signature score indicates few AI-specific markers"
        
        # Entropy diversity index interpretation
        if features.entropy_diversity_index > 70:
            interpretations["entropy_diversity_index"] = "High vocabulary diversity suggests human writing"
        elif features.entropy_diversity_index > 40:
            interpretations["entropy_diversity_index"] = "Moderate vocabulary diversity"
        else:
            interpretations["entropy_diversity_index"] = "Low vocabulary diversity suggests AI generation"
        
        # Verb diversity interpretation
        if features.verb_diversity > 60:
            interpretations["verb_diversity"] = "High verb diversity suggests natural human language"
        elif features.verb_diversity > 30:
            interpretations["verb_diversity"] = "Moderate verb diversity"
        else:
            interpretations["verb_diversity"] = "Low verb diversity may indicate AI generation"
        
        # Hedging phrases interpretation
        if features.hedging_phrases > 40:
            interpretations["hedging_phrases"] = "High use of hedging suggests cautious AI language"
        elif features.hedging_phrases > 15:
            interpretations["hedging_phrases"] = "Moderate hedging phrases usage"
        else:
            interpretations["hedging_phrases"] = "Low hedging suggests more direct language"
        
        # Transition markers interpretation
        if features.transition_markers > 50:
            interpretations["transition_markers"] = "High transition marker usage suggests structured AI output"
        elif features.transition_markers > 20:
            interpretations["transition_markers"] = "Moderate transition marker usage"
        else:
            interpretations["transition_markers"] = "Low transition marker usage"
        
        return interpretations


class AITextDetector:
    """
    Main interface for AI text detection with multilingual support.
    Provides simple API while maintaining detailed analysis capabilities.
    """
    
    def __init__(self):
        self.classifier = AIClassifier()
    
    def detect_ai_text(self, text: str) -> Dict[str, any]:
        """
        Main method to detect if text is AI-generated.
        
        Args:
            text: Input text to analyze
            
        Returns:
            Dictionary containing classification results and detailed features
        """
        if not isinstance(text, str) or not text.strip():
            return {
                "error": "Invalid input: text must be a non-empty string",
                "classification": "unknown",
                "confidence": 0.0
            }
        
        return self.classifier.classify(text)


# Example usage
if __name__ == "__main__":
    detector = AITextDetector()
    
    # Test with various inputs
    test_texts = [
        # AI-generated example
        "As an AI language model, I must clarify that I am designed to be helpful, harmless, and honest. Indeed, I can provide information on various topics. Furthermore, I can assist with analysis. However, I must note that I am limited to the data I was trained on.",
        
        # Human-written example  
        "Yesterday I went to the store to buy groceries. The weather was nice and I felt happy. When I got home I cooked dinner and watched a movie.",
        
        # Mixed language example
        "Bonjour, je suis un modèle d'intelligence artificielle. As an AI model, I must specify that I am designed to assist. De plus, I can provide information. Moreover, I can help with tasks."
    ]
    
    for i, text in enumerate(test_texts, 1):
        print(f"\n--- Test {i} ---")
        result = detector.de
