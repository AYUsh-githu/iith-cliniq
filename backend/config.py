from typing import Literal, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database & cache
    DATABASE_URL: str = "postgresql://cliniq:cliniq@localhost/cliniq"
    REDIS_URL: str = "redis://localhost:6379/0"

    # LLM providers / API keys
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None

    LLM_PROVIDER: Literal["openai", "anthropic", "ollama"] = "anthropic"
    OLLAMA_URL: str = "http://localhost:11434"

    # External services
    HAPI_VALIDATOR_URL: str = "http://localhost:8090"

    # Application limits
    MAX_PDF_SIZE_MB: int = 50


settings = Settings()

