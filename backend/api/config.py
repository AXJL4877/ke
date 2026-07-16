from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Prefix KE_ so shell settings are not overridden by global DATABASE_URL / etc.
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="KE_",
        extra="ignore",
    )

    database_url: str = "sqlite:///./data/ke.db"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 1440
    storage_backend: str = "local"
    storage_local_path: str = "./data/storage"
    storage_public_base_url: str = "http://localhost:8000/files"
    storage_s3_bucket: str | None = None
    storage_s3_endpoint: str | None = None
    storage_s3_access_key: str | None = None
    storage_s3_secret_key: str | None = None
    modules_dir: str = "./modules"
    cors_origins: str = "http://localhost:3000"
    task_sync: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()
