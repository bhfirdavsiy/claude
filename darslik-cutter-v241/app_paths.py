from __future__ import annotations
import os, sys
from pathlib import Path

APP_NAME = "DarslikCutter"

def app_data_dir() -> Path:
    if sys.platform.startswith("win"):
        base = Path(os.getenv("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
    else:
        base = Path(os.getenv("XDG_DATA_HOME") or (Path.home() / ".local" / "share"))
    p = base / APP_NAME
    p.mkdir(parents=True, exist_ok=True)
    return p

def cache_dir() -> Path:
    p = app_data_dir() / "cache"
    p.mkdir(parents=True, exist_ok=True)
    return p

def log_dir() -> Path:
    p = app_data_dir() / "logs"
    p.mkdir(parents=True, exist_ok=True)
    return p

def resource_path(rel: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / rel
