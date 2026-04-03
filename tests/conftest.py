import sys
from pathlib import Path


# Pytest 실행 시 rootdir가 sys.path에 포함되지 않는 환경이 있어
# app 패키지 import을 보장하기 위해 명시적으로 경로를 추가한다.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

