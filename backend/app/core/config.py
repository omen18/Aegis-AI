"""Application settings, loaded from environment (12-factor)."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="NEXUS_", extra="ignore")

    # --- app ---
    app_name: str = "NEXUS AI"
    env: str = "development"
    debug: bool = True
    api_prefix: str = "/api/v1"

    # --- security ---
    jwt_secret: str = "change-me-in-prod-please-use-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_ttl_min: int = 60
    refresh_token_ttl_days: int = 14
    google_client_id: str = ""  # for Google Sign-In id_token verification

    # --- datastores ---
    database_url: str = "postgresql+asyncpg://nexus:nexus@localhost:5432/nexus"
    redis_url: str = "redis://localhost:6379/0"

    # --- model layer (pluggable) ---
    # If a key/model is unset, agents fall back to deterministic demo output so
    # the whole pipeline still runs offline. Drop in real creds to go live.
    llm_provider: str = "demo"            # "openai" | "azure" | "demo"
    llm_model: str = "gpt-5.5"            # any model string your provider supports
    openai_api_key: str = ""
    whisper_model: str = "whisper-1"
    yolo_weights: str = ""                # path to YOLO .pt weights
    sam_checkpoint: str = ""              # path to Segment-Anything checkpoint

    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
