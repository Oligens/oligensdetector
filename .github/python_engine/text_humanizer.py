"""
=============================================================================
API INTEGRATION LAYER — Humanizer Backend avec Failover
=============================================================================

Module d'intégration backend pour exposer le humanizer via une API REST.
Inclut :
  - Route API principale avec failover automatique
  - Gestion des providers cloud (Gemini, Qwen, DeepSeek)
  - Interception d'erreurs et timeouts
  - Métadonnées de traçabilité complètes
  - Health check et monitoring

Architecture :
  Client → API Route → Cloud Provider (retry/timeout) → Local Fallback → Response

Dépendances : fastapi, httpx, pydantic (optionnel pour le déploiement)
Licence : MIT
=============================================================================
"""

import time
import logging
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
from contextlib import asynccontextmanager

# Pour un déploiement réel, décommenter :
# from fastapi import FastAPI, HTTPException, Request
# from fastapi.responses import JSONResponse
# from pydantic import BaseModel, Field
# import httpx

from text_humanizer_v2 import (
    TextHumanizer,
    HumanizerConfig,
    HumanizationResult,
    CloudProviderConfig,
    FailoverManager,
    LanguageDetector,
    humanize_text_with_failover,
)

logger = logging.getLogger(__name__)


# =============================================================================
# MODÈLES DE DONNÉES (Pydantic)
# =============================================================================

# Pour un déploiement réel, utiliser ces modèles Pydantic :

"""
class HumanizeRequest(BaseModel):
    '''Requête d'humanisation.'''
    text: str = Field(..., min_length=50, description="Texte à humaniser (min 50 caractères)")
    intensity: float = Field(default=0.65, ge=0.0, le=1.0, description="Intensité de l'humanisation")
    warmth: float = Field(default=0.5, ge=0.0, le=1.0, description="Chaleur du ton")
    use_cloud: bool = Field(default=True, description="Tenter d'abord les providers cloud")
    seed: Optional[int] = Field(default=None, description="Graine pour reproductibilité")

class HumanizeResponse(BaseModel):
    '''Réponse d'humanisation avec métadonnées.'''
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
    # Métadonnées de traçabilité
    engine_used: str
    fallback_engine: bool
    processing_time_ms: float
    timestamp: str
    detected_language: str
    error_message: Optional[str] = None

class HealthResponse(BaseModel):
    '''Réponse du health check.'''
    status: str
    version: str
    local_engine: str
    cloud_providers: List[Dict[str, Any]]
    uptime_seconds: float
"""


# =============================================================================
# CONFIGURATION DES PROVIDERS CLOUD
# =============================================================================

@dataclass
class CloudAPIConfig:
    """Configuration complète pour un provider cloud."""
    name: str
    base_url: str
    api_key_env_var: str  # Nom de la variable d'environnement
    model: str
    timeout_seconds: float = 30.0
    max_retries: int = 3
    retry_delay_seconds: float = 1.0
    enabled: bool = True
    priority: int = 0  # Ordre de tentative (0 = premier)


# Configuration par défaut des providers
DEFAULT_CLOUD_PROVIDERS = [
    CloudAPIConfig(
        name="gemini",
        base_url="https://generativelanguage.googleapis.com/v1beta",
        api_key_env_var="GEMINI_API_KEY",
        model="gemini-pro",
        timeout_seconds=30.0,
        max_retries=3,
        priority=0,
    ),
    CloudAPIConfig(
        name="qwen",
        base_url="https://dashscope.aliyuncs.com/api/v1",
        api_key_env_var="QWEN_API_KEY",
        model="qwen-turbo",
        timeout_seconds=25.0,
        max_retries=3,
        priority=1,
    ),
    CloudAPIConfig(
        name="deepseek",
        base_url="https://api.deepseek.com/v1",
        api_key_env_var="DEEPSEEK_API_KEY",
        model="deepseek-chat",
        timeout_seconds=25.0,
        max_retries=2,
        priority=2,
    ),
]


# =============================================================================
# CLIENT CLOUD ASYNCHRONE
# =============================================================================

class CloudHumanizerClient:
    """
    Client asynchrone pour les providers cloud d'humanisation.
    Gère les appels API avec retry, timeout et parsing des réponses.
    """
    
    def __init__(self, config: CloudAPIConfig):
        self.config = config
        self.api_key: Optional[str] = None
    
    def load_api_key(self) -> bool:
        """Charge la clé API depuis les variables d'environnement."""
        import os
        self.api_key = os.environ.get(self.config.api_key_env_var)
        return self.api_key is not None
    
    async def humanize(
        self,
        text: str,
        humanizer_config: HumanizerConfig
    ) -> HumanizationResult:
        """
        Appelle le provider cloud pour humaniser le texte.
        
        Args:
            text: Texte à humaniser
            humanizer_config: Configuration d'humanisation
            
        Returns:
            HumanizationResult
            
        Raises:
            Exception: Si l'appel échoue après tous les retries
        """
        if not self.api_key:
            raise ValueError(f"API key not loaded for {self.config.name}")
        
        last_exception = None
        
        for attempt in range(self.config.max_retries):
            try:
                logger.info(
                    f"[{self.config.name}] Tentative {attempt + 1}/{self.config.max_retries}"
                )
                
                # Appel API selon le provider
                if self.config.name == "gemini":
                    result = await self._call_gemini(text, humanizer_config)
                elif self.config.name == "qwen":
                    result = await self._call_qwen(text, humanizer_config)
                elif self.config.name == "deepseek":
                    result = await self._call_deepseek(text, humanizer_config)
                else:
                    raise ValueError(f"Provider inconnu: {self.config.name}")
                
                logger.info(f"[{self.config.name}] Succès à la tentative {attempt + 1}")
                return result
                
            except asyncio.TimeoutError as e:
                last_exception = e
                logger.warning(
                    f"[{self.config.name}] Timeout (tentative {attempt + 1})"
                )
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay_seconds)
                    
            except Exception as e:
                last_exception = e
                logger.warning(
                    f"[{self.config.name}] Erreur (tentative {attempt + 1}): {str(e)}"
                )
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay_seconds)
        
        raise last_exception or Exception(f"Échec de l'appel à {self.config.name}")
    
    async def _call_gemini(
        self, text: str, config: HumanizerConfig
    ) -> HumanizationResult:
        """Appel à l'API Gemini."""
        # Pour un déploiement réel :
        # async with httpx.AsyncClient(timeout=self.config.timeout_seconds) as client:
        #     prompt = self._build_humanizer_prompt(text, config)
        #     response = await client.post(
        #         f"{self.config.base_url}/models/{self.config.model}:generateContent",
        #         headers={"x-goog-api-key": self.api_key},
        #         json={
        #             "contents": [{"parts": [{"text": prompt}]}],
        #             "generationConfig": {
        #                 "temperature": 0.8,
        #                 "maxOutputTokens": 2048,
        #             }
        #         }
        #     )
        #     response.raise_for_status()
        #     data = response.json()
        #     humanized_text = data["candidates"][0]["content"]["parts"][0]["text"]
        #     return self._build_result(text, humanized_text)
        
        raise NotImplementedError(
            "Intégrez l'appel Gemini réel ici. "
            "Voir les commentaires pour le template."
        )
    
    async def _call_qwen(
        self, text: str, config: HumanizerConfig
    ) -> HumanizationResult:
        """Appel à l'API Qwen (DashScope)."""
        # Template pour l'implémentation réelle :
        # async with httpx.AsyncClient(timeout=self.config.timeout_seconds) as client:
        #     prompt = self._build_humanizer_prompt(text, config)
        #     response = await client.post(
        #         f"{self.config.base_url}/services/aigc/text-generation/generation",
        #         headers={
        #             "Authorization": f"Bearer {self.api_key}",
        #             "Content-Type": "application/json",
        #         },
        #         json={
        #             "model": self.config.model,
        #             "input": {"messages": [{"role": "user", "content": prompt}]},
        #             "parameters": {"temperature": 0.8, "max_tokens": 2048}
        #         }
        #     )
        #     response.raise_for_status()
        #     data = response.json()
        #     humanized_text = data["output"]["text"]
        #     return self._build_result(text, humanized_text)
        
        raise NotImplementedError("Intégrez l'appel Qwen réel ici.")
    
    async def _call_deepseek(
        self, text: str, config: HumanizerConfig
    ) -> HumanizationResult:
        """Appel à l'API DeepSeek."""
        # Template pour l'implémentation réelle :
        # async with httpx.AsyncClient(timeout=self.config.timeout_seconds) as client:
        #     prompt = self._build_humanizer_prompt(text, config)
        #     response = await client.post(
        #         f"{self.config.base_url}/chat/completions",
        #         headers={
        #             "Authorization": f"Bearer {self.api_key}",
        #             "Content-Type": "application/json",
        #         },
        #         json={
        #             "model": self.config.model,
        #             "messages": [{"role": "user", "content": prompt}],
        #             "temperature": 0.8,
        #             "max_tokens": 2048,
        #         }
        #     )
        #     response.raise_for_status()
        #     data = response.json()
        #     humanized_text = data["choices"][0]["message"]["content"]
        #     return self._build_result(text, humanized_text)
        
        raise NotImplementedError("Intégrez l'appel DeepSeek réel ici.")
    
    def _build_humanizer_prompt(self, text: str, config: HumanizerConfig) -> str:
        """Construit le prompt pour le provider cloud."""
        return f"""Tu es un expert en réécriture de texte. Ta mission est de réécrire le texte suivant pour le rendre plus naturel, plus humain, moins robotique.

Instructions :
- Garde le même sens et les mêmes informations
- Varie la longueur des phrases (alternance de phrases courtes et longues)
- Utilise un langage naturel avec des expressions idiomatiques si approprié
- Évite les connecteurs logiques trop formels (en outre, de plus, par ailleurs...)
- Ajoute une touche de subjectivité et de chaleur humaine
- Le texte doit sembler écrit par un humain, pas par une IA

Texte à réécrire :
{text}

Réécris le texte maintenant :"""
    
    def _build_result(self, original: str, humanized: str) -> HumanizationResult:
        """Construit un HumanizationResult à partir du texte humanisé."""
        # Évaluer le résultat avec l'évaluateur local
        evaluator = TextHumanizer()
        score = evaluator._evaluate_naturalness(humanized)
        
        return HumanizationResult(
            original_text=original,
            humanized_text=humanized,
            naturalness_score=score,
            burstiness_before=0.0,
            burstiness_after=0.0,
            entropy_before=0.0,
            entropy_after=0.0,
            feedback_loops=0,
            changes_applied=0,
            is_natural=score >= 72.0
        )


# =============================================================================
# GESTIONNAIRE DE FAILOVER ASYNCHRONE
# =============================================================================

class AsyncFailoverManager:
    """
    Gestionnaire de bascule asynchrone pour les appels cloud.
    Orchestre les tentatives vers les providers cloud avec bascule
    automatique vers le traitement local.
    """
    
    def __init__(
        self,
        cloud_configs: List[CloudAPIConfig],
        local_humanizer: TextHumanizer
    ):
        self.local_humanizer = local_humanizer
        self.cloud_clients: List[CloudHumanizerClient] = []
        self.start_time = time.time()
        self.stats = {
            "total_requests": 0,
            "cloud_successes": 0,
            "local_fallbacks": 0,
            "total_errors": 0,
        }
        
        # Initialiser les clients cloud
        for config in cloud_configs:
            if config.enabled:
                client = CloudHumanizerClient(config)
                if client.load_api_key():
                    self.cloud_clients.append(client)
                    logger.info(f"Provider {config.name} initialisé (priorité {config.priority})")
                else:
                    logger.warning(
                        f"Provider {config.name} désactivé "
                        f"(clé API manquante: {config.api_key_env_var})"
                    )
        
        # Trier par priorité
        self.cloud_clients.sort(
            key=lambda c: c.config.priority
        )
    
    async def humanize(
        self,
        text: str,
        config: HumanizerConfig,
        use_cloud: bool = True
    ) -> HumanizationResult:
        """
        Humanise le texte avec failover automatique.
        
        Args:
            text: Texte à humaniser
            config: Configuration
            use_cloud: Tenter d'abord les providers cloud
            
        Returns:
            HumanizationResult avec métadonnées complètes
        """
        start_time = time.time()
        timestamp = datetime.utcnow().isoformat()
        self.stats["total_requests"] += 1
        
        # Détection de langue
        detected_lang, lang_confidence = LanguageDetector.detect_language(text)
        logger.info(f"Langue détectée: {detected_lang} ({lang_confidence:.2f})")
        
        # Tenter les providers cloud si activé
        if use_cloud and self.cloud_clients:
            for client in self.cloud_clients:
                try:
                    logger.info(f"Tentative cloud: {client.config.name}")
                    result = await client.humanize(text, config)
                    
                    processing_time = (time.time() - start_time) * 1000
                    result.engine_used = f"cloud_{client.config.name}"
                    result.fallback_engine = False
                    result.processing_time_ms = processing_time
                    result.timestamp = timestamp
                    result.detected_language = detected_lang
                    
                    self.stats["cloud_successes"] += 1
                    logger.info(
                        f"Succès cloud ({client.config.name}) en {processing_time:.2f}ms"
                    )
                    return result
                    
                except Exception as e:
                    logger.warning(f"Échec cloud ({client.config.name}): {str(e)}")
                    continue
        
        # Bascule vers le traitement local
        logger.info("Bascule vers traitement local")
        try:
            result = self.local_humanizer.humanize(text)
            
            processing_time = (time.time() - start_time) * 1000
            result.engine_used = "local"
            result.fallback_engine = use_cloud and len(self.cloud_clients) > 0
            result.processing_time_ms = processing_time
            result.timestamp = timestamp
            result.detected_language = detected_lang
            
            self.stats["local_fallbacks"] += 1
            logger.info(f"Traitement local terminé en {processing_time:.2f}ms")
            return result
            
        except Exception as e:
            # Erreur critique
            logger.error(f"Erreur critique: {str(e)}")
            processing_time = (time.time() - start_time) * 1000
            self.stats["total_errors"] += 1
            
            return HumanizationResult(
                original_text=text,
                humanized_text=text,
                naturalness_score=0.0,
                burstiness_before=0.0,
                burstiness_after=0.0,
                entropy_before=0.0,
                entropy_after=0.0,
                feedback_loops=0,
                changes_applied=0,
                is_natural=False,
                engine_used="error",
                fallback_engine=True,
                processing_time_ms=processing_time,
                timestamp=timestamp,
                detected_language=detected_lang,
                error_message=str(e)
            )
    
    def get_health_status(self) -> Dict[str, Any]:
        """Retourne le statut de santé du système."""
        uptime = time.time() - self.start_time
        
        return {
            "status": "healthy",
            "version": "2.0.0",
            "uptime_seconds": round(uptime, 2),
            "local_engine": "active",
            "cloud_providers": [
                {
                    "name": client.config.name,
                    "model": client.config.model,
                    "enabled": True,
                    "priority": client.config.priority,
                }
                for client in self.cloud_clients
            ],
            "stats": self.stats,
        }


# =============================================================================
# APPLICATION FASTAPI (TEMPLATE)
# =============================================================================

# Pour un déploiement réel, décommenter et adapter :

"""
# Variables d'environnement
import os
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
QWEN_API_KEY = os.environ.get("QWEN_API_KEY", "")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")

# Configuration des providers
cloud_configs = [
    CloudAPIConfig(
        name="gemini",
        base_url="https://generativelanguage.googleapis.com/v1beta",
        api_key_env_var="GEMINI_API_KEY",
        model="gemini-pro",
        timeout_seconds=30.0,
        max_retries=3,
        priority=0,
        enabled=bool(GEMINI_API_KEY),
    ),
    CloudAPIConfig(
        name="qwen",
        base_url="https://dashscope.aliyuncs.com/api/v1",
        api_key_env_var="QWEN_API_KEY",
        model="qwen-turbo",
        timeout_seconds=25.0,
        max_retries=3,
        priority=1,
        enabled=bool(QWEN_API_KEY),
    ),
    CloudAPIConfig(
        name="deepseek",
        base_url="https://api.deepseek.com/v1",
        api_key_env_var="DEEPSEEK_API_KEY",
        model="deepseek-chat",
        timeout_seconds=25.0,
        max_retries=2,
        priority=2,
        enabled=bool(DEEPSEEK_API_KEY),
    ),
]

# Initialisation de l'application
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Démarrage de l'application Humanizer API")
    app.state.failover_manager = AsyncFailoverManager(
        cloud_configs=cloud_configs,
        local_humanizer=TextHumanizer()
    )
    yield
    # Shutdown
    logger.info("Arrêt de l'application Humanizer API")

app = FastAPI(
    title="Text Humanizer API",
    description="API d'humanisation de texte avec failover automatique",
    version="2.0.0",
    lifespan=lifespan,
)

# Middleware de logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    processing_time = (time.time() - start_time) * 1000
    logger.info(
        f"{request.method} {request.url.path} - "
        f"Status: {response.status_code} - "
        f"Time: {processing_time:.2f}ms"
    )
    return response

# Gestionnaire d'erreurs global
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Erreur non gérée: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc),
            "timestamp": datetime.utcnow().isoformat(),
        }
    )

# =============================================================================
# ROUTES API
# =============================================================================

@app.post("/api/v1/humanize", response_model=HumanizeResponse)
async def humanize_text(request: HumanizeRequest):
    '''
    Route principale d'humanisation de texte.
    
    Tente d'abord les providers cloud (Gemini, Qwen, DeepSeek),
    puis bascule automatiquement sur le traitement local en cas d'échec.
    
    La réponse inclut des métadonnées de traçabilité complètes :
    - engine_used : quel moteur a été utilisé
    - fallback_engine : si une bascule a eu lieu
    - processing_time_ms : temps de traitement
    - detected_language : langue détectée
    '''
    failover_manager: AsyncFailoverManager = request.app.state.failover_manager
    
    config = HumanizerConfig(
        intensity=request.intensity,
        warmth=request.warmth,
        seed=request.seed,
    )
    
    result = await failover_manager.humanize(
        text=request.text,
        config=config,
        use_cloud=request.use_cloud,
    )
    
    return JSONResponse(content=asdict(result))


@app.get("/api/v1/health", response_model=HealthResponse)
async def health_check(request: Request):
    '''
    Health check de l'API.
    Retourne le statut du système et des providers cloud.
    '''
    failover_manager: AsyncFailoverManager = request.app.state.failover_manager
    return JSONResponse(content=failover_manager.get_health_status())


@app.get("/api/v1/detect-language")
async def detect_language_endpoint(text: str):
    '''
    Endpoint utilitaire pour détecter la langue d'un texte.
    '''
    lang, confidence = LanguageDetector.detect_language(text)
    return JSONResponse(content={
        "language": lang,
        "confidence": round(confidence, 4),
    })


@app.get("/")
async def root():
    '''Page d'accueil.'''
    return {
        "service": "Text Humanizer API",
        "version": "2.0.0",
        "endpoints": {
            "humanize": "POST /api/v1/humanize",
            "health": "GET /api/v1/health",
            "detect_language": "GET /api/v1/detect-language",
        }
    }
"""


# =============================================================================
# EXEMPLE D'UTILISATION (SYNCHRONE — POUR TESTS)
# =============================================================================

def demo_sync():
    """Démonstration synchrone pour tests."""
    print("=" * 70)
    print("  TEXT HUMANIZER API — Démonstration synchrone")
    print("=" * 70)
    print()
    
    # Texte de test
    sample_text = """
    Artificial intelligence has become an increasingly important topic in
    contemporary discourse. Furthermore, it is important to note that the
    implications of AI extend far beyond mere technological advancement.
    Moreover, the ethical considerations surrounding AI development are
    multifaceted and complex. Additionally, stakeholders must navigate the
    delicate balance between innovation and responsibility.
    """
    
    # Test 1 : Détection de langue
    print("📝 Test 1 : Détection de langue")
    lang, confidence = LanguageDetector.detect_language(sample_text)
    print(f"   Langue : {lang} (confiance : {confidence:.2f})")
    print()
    
    # Test 2 : Traitement local
    print("📝 Test 2 : Traitement local")
    config = HumanizerConfig(intensity=0.65, warmth=0.5, seed=42)
    humanizer = TextHumanizer(config)
    result = humanizer.humanize(sample_text)
    print(f"   Score de naturalité : {result.naturalness_score:.2f}")
    print(f"   Burstiness avant → après : {result.burstiness_before:.4f} → {result.burstiness_after:.4f}")
    print(f"   Entropie avant → après : {result.entropy_before:.2f} → {result.entropy_after:.2f}")
    print(f"   Boucles de feedback : {result.feedback_loops}")
    print(f"   Changements appliqués : {result.changes_applied}")
    print()
    
    # Test 3 : Fonction avec failover (sans providers cloud)
    print("📝 Test 3 : Fonction avec failover (local uniquement)")
    result_dict = humanize_text_with_failover(sample_text, config)
    print(f"   Engine used : {result_dict['engine_used']}")
    print(f"   Fallback : {result_dict['fallback_engine']}")
    print(f"   Processing time : {result_dict['processing_time_ms']:.2f}ms")
    print(f"   Detected language : {result_dict['detected_language']}")
    print()
    
    # Test 4 : Texte français
    sample_fr = """
    L'intelligence artificielle est devenue un sujet de plus en plus
    important dans le discours contemporain. En outre, il est important
    de noter que les implications de l'IA vont bien au-delà du simple
    progrès technologique. Par ailleurs, les considérations éthiques
    entourant le développement de l'IA sont multifacettes et complexes.
    De plus, les parties prenantes doivent naviguer dans l'équilibre
    délicat entre innovation et responsabilité.
    """
    
    print("📝 Test 4 : Texte français")
    lang_fr, conf_fr = LanguageDetector.detect_language(sample_fr)
    print(f"   Langue détectée : {lang_fr} (confiance : {conf_fr:.2f})")
    result_fr = humanize_text_with_failover(sample_fr, config)
    print(f"   Score de naturalité : {result_fr['naturalness_score']:.2f}")
    print(f"   Engine used : {result_fr['engine_used']}")
    print()
    
    print("=" * 70)
    print("  Démonstration terminée.")
    print("=" * 70)


if __name__ == "__main__":
    demo_sync()