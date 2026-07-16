from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.config import get_settings

settings = get_settings()

connect_args = {}
engine_url = settings.database_url
if engine_url.startswith("sqlite"):
    db_path = engine_url.replace("sqlite:///", "", 1)
    if db_path and db_path != ":memory:":
        abs_path = Path(db_path)
        if not abs_path.is_absolute():
            abs_path = (Path(__file__).resolve().parents[1] / abs_path).resolve()
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        engine_url = f"sqlite:///{abs_path.as_posix()}"
    connect_args = {"check_same_thread": False}

engine = create_engine(engine_url, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
