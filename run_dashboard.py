from __future__ import annotations

from backend.main import app
from backend.settings import DEFAULT_HOST, DEFAULT_UI_HOST, DEFAULT_UI_PORT

import uvicorn


if __name__ == "__main__":
    print(f"Robot host from app_config.py: {DEFAULT_HOST}")
    print(f"Dashboard URL: http://{DEFAULT_UI_HOST}:{DEFAULT_UI_PORT}")
    uvicorn.run(app, host=DEFAULT_UI_HOST, port=DEFAULT_UI_PORT, log_level="info")
