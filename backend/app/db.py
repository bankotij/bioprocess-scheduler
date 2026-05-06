from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine


def _db_path() -> str:
    base = Path(__file__).resolve().parents[1]
    return str(base / "bbp.sqlite")


engine = create_engine(
    f"sqlite:///{_db_path()}",
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session

