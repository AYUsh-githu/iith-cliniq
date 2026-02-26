import os
from dotenv import load_dotenv


# Load environment variables from a .env file (if present)
load_dotenv()


DATABASE_URL: str | None = os.getenv("DATABASE_URL")
REDIS_URL: str | None = os.getenv("REDIS_URL")
ANTHROPIC_API_KEY: str | None = os.getenv("ANTHROPIC_API_KEY")
LLM_PROVIDER: str | None = os.getenv("LLM_PROVIDER")


__all__ = [
    "DATABASE_URL",
    "REDIS_URL",
    "ANTHROPIC_API_KEY",
    "LLM_PROVIDER",
]

