"""Application configuration via pydantic-settings.

Reads from the environment (and a local ``.env`` during development). All settings
are typed; the Postgres DSN is computed from the individual components so the same
config works for asyncpg (app) and psycopg/SQLAlchemy-sync (Alembic).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Delta Exchange India
    delta_base_url: str = "https://api.india.delta.exchange"
    delta_ws_url: str = "wss://socket.india.delta.exchange/v2"
    delta_api_key: str = ""
    delta_api_secret: str = ""
    delta_use_sandbox: bool = True

    # Postgres
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "delta_trader"
    postgres_user: str = "trader"
    postgres_password: str = "trader_dev_pw"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # App
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "INFO"
    live_trading_enabled: bool = False

    # Underlyings (Phase 1: BTC only)
    underlyings: str = "BTC"

    # Risk & vol
    risk_free_rate: float = 0.07
    rv_historical_window_days: int = 30
    rv_intraday_window_minutes: int = 60

    # Archival
    parquet_dir: str = "./data/parquet"
    parquet_enabled: bool = True

    # Paper engine (Phase 2)
    paper_impact_k: float = 0.0001
    paper_impact_illiquid_floor: float = 0.005
    paper_atomic_default: bool = True

    # Live monitor (Phase 3) — read-only by default
    auth_rate_limit_per_sec: float = 10.0
    sl_debounce_ticks: int = 3

    @computed_field  # type: ignore[prop-decorator]
    @property
    def underlying_list(self) -> list[str]:
        return [u.strip().upper() for u in self.underlyings.split(",") if u.strip()]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def pg_dsn(self) -> str:
        """asyncpg DSN used by the application."""
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def pg_dsn_sync(self) -> str:
        """Synchronous DSN used by Alembic migrations."""
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()


settings = get_settings()
