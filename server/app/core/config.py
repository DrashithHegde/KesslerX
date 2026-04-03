from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    env: str = "development"
    log_level: str = "info"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    tle_source: str = "spacetrack"
    spacetrack_user: str = ""
    spacetrack_pass: str = ""
    redis_url: str = "redis://localhost:6379/0"
    database_url: str = "postgresql://kesslerx:password@localhost:5432/kesslerx"
    gemini_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def parsed_cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]



@lru_cache
def get_settings() -> Settings:
    return Settings()
