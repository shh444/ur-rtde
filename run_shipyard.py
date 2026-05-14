"""Shipyard 용접 대시보드 단독 실행 진입점.

레거시 통합 대시보드(run_dashboard.py, 8008)와 별개 프로세스/포트로 뜸.

사용:
    python run_shipyard.py
브라우저:
    http://<SHIPYARD_HOST>:<SHIPYARD_PORT>/
포트 설정:
    app_config.py 의 SHIPYARD_HOST / SHIPYARD_PORT 에서 변경.
"""
from __future__ import annotations

import uvicorn

from backend.shipyard_app import app
from backend.settings import (
    DEFAULT_HOST,
    DEFAULT_MODBUS_HOST,
    DEFAULT_SHIPYARD_HOST,
    DEFAULT_SHIPYARD_PORT,
)


if __name__ == "__main__":
    print(f"RTDE host       : {DEFAULT_HOST}")
    print(f"Modbus host     : {DEFAULT_MODBUS_HOST}")
    print(f"Shipyard URL    : http://{DEFAULT_SHIPYARD_HOST}:{DEFAULT_SHIPYARD_PORT}/")
    uvicorn.run(
        app,
        host=DEFAULT_SHIPYARD_HOST,
        port=DEFAULT_SHIPYARD_PORT,
        log_level="info",
    )
