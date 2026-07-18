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
    # Anti-mock: strip demo fields & reject mock params unless explicitly enabled
    allow_mock: bool = False
    # Force MODULE_SPEC §10 capabilities[] on load (comma-separated ids exempt)
    require_capabilities: bool = True
    capabilities_exempt: str = "echo"
    # Flag done tasks faster than this as suspicious (ms)
    fast_completion_ms: int = 3000
    # When integration.contract.json present: require source module.json on disk
    require_integration_source: bool = True
    # When contract present: missing provenance / mock → task failed (not done)
    enforce_integration_evidence: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def capabilities_exempt_ids(self) -> set[str]:
        return {x.strip() for x in self.capabilities_exempt.split(",") if x.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()
