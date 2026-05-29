# 환경 무관 배포 (Podman) 설계

날짜: 2026-05-29
상태: 승인됨 (구현 대기)

## 배경 / 문제

현재 K8s Manager 배포는 머신마다 환경을 직접 맞춰야 한다:

- `build.sh`: Python venv 생성 + `pip install` + 사전 빌드된 `frontend/dist`를 `backend/static`으로 복사
- `run.sh`: venv 활성화 후 `uvicorn` 실행

배포 머신마다 Python/venv, 시스템 라이브러리, node(프론트 변경 시), kubeconfig, SSH 키를 직접 준비해야 해 이식성이 낮다.

## 목표

호스트에 **podman만** 설치돼 있으면 동일하게 빌드·실행되도록 한다. 빌드 머신에 Python/node/venv가 없어도 된다.

비목표: compose / quadlet / systemd 서비스화, 멀티 아키텍처 빌드, CI 파이프라인. (추후 이 Containerfile 위에 얹을 수 있음)

## 아키텍처

### 멀티스테이지 `Containerfile`

```
Stage 1 (frontend-builder): node:22-alpine
  - frontend/ 복사
  - npm ci
  - npm run build  →  /frontend/dist 산출

Stage 2 (runtime): python:3.12-slim
  - requirements.txt 설치
    (bcrypt / cryptography 는 wheel 제공 → 빌드 툴 불필요)
  - backend/ 복사
  - Stage 1 의 dist → backend/static 으로 복사
  - 비root 사용자 'app' 생성, 소유권 정리
  - WORKDIR /app/backend
  - uvicorn main:app --host 0.0.0.0 --port 8000 로 실행
```

호스트 요구사항: **podman 만**. node/python/venv 불필요.

### `.containerignore`

빌드 컨텍스트에서 제외하여 재현성·속도 확보:

```
backend/venv/
backend/__pycache__/
backend/data/
**/__pycache__/
frontend/node_modules/
frontend/dist/
*.db
.git/
```

> 주의: `frontend/dist`는 Stage 1 에서 새로 빌드하므로 제외한다. (호스트의 오래된 dist 가 컨텍스트로 들어가지 않게)

## 런타임 구성 & 자격증명 주입

`backend/config.py` 는 이미 `K8S_MANAGER_` 접두어 환경변수를 읽으므로(`env_prefix`) 백엔드 코드 변경은 불필요하다. 모든 외부 의존성은 볼륨 마운트 / 환경변수로 주입한다.

| 항목 | 컨테이너 경로 | 주입 방식 |
|---|---|---|
| kubeconfig | `/config/kube` (ro) | 호스트 `~/.kube/config` 볼륨 마운트 + `K8S_MANAGER_KUBECONFIG_PATH=/config/kube` |
| SSH 키 | `/home/app/.ssh` (ro) | 호스트 `~/.ssh` 볼륨 마운트 (paramiko 기본 키 탐색 경로) |
| DB·업로드 | `/app/backend/data` | 명명된 볼륨 `k8s-manager-data` |
| SECRET_KEY | — | `K8S_MANAGER_SECRET_KEY` 환경변수 |
| 포트 | `8000` | `-p 8000:8000` |

### 비root 사용자 처리

- 컨테이너는 `app` 사용자로 실행한다.
- paramiko 기본 키 탐색이 `~/.ssh/id_rsa`, `~/.ssh/id_ed25519` 를 보므로 `app` 의 홈을 `/home/app` 으로 두고 그 아래 `.ssh` 를 마운트한다.
- 명명 볼륨 `data` 디렉터리를 `app` 사용자가 쓸 수 있도록 Containerfile 에서 `data` 경로를 미리 만들고 소유권(`chown app`)을 맞춘다.

## 한 번에 실행하는 헬퍼: `run-podman.sh`

위 마운트/환경변수를 모두 묶고, 환경변수로 경로를 덮어쓸 수 있게 한다.

```bash
#!/bin/bash
set -e
IMAGE=${IMAGE:-k8s-manager:latest}
KUBECONFIG_SRC=${KUBECONFIG_SRC:-$HOME/.kube/config}
SSH_DIR=${SSH_DIR:-$HOME/.ssh}
PORT=${PORT:-8000}
SECRET_KEY=${SECRET_KEY:-change-me}

podman run -d --name k8s-manager \
  -p ${PORT}:8000 \
  -v ${KUBECONFIG_SRC}:/config/kube:ro,Z \
  -v ${SSH_DIR}:/home/app/.ssh:ro,Z \
  -v k8s-manager-data:/app/backend/data \
  -e K8S_MANAGER_KUBECONFIG_PATH=/config/kube \
  -e K8S_MANAGER_SECRET_KEY=${SECRET_KEY} \
  ${IMAGE}
```

배포 절차(두 단계):

```bash
podman build -t k8s-manager:latest .
./run-podman.sh
```

## 엣지 케이스 / 주의사항 (README 에 명시)

- **kubeconfig 의 API 서버가 `localhost`/`127.0.0.1`** 을 가리키면 컨테이너 내부에서 호스트에 닿지 않는다. 이 경우 `--network=host` 로 실행하거나 kubeconfig 의 `server:` 를 노드 IP 로 바꿔야 한다.
- SELinux 환경을 위해 볼륨 마운트에 `:Z` (또는 공유 시 `:z`) 옵션을 붙인다.
- 루트리스 podman 의 UID 매핑으로 호스트 파일 소유권과 컨테이너 내 `app` UID 가 다를 수 있다 → kubeconfig/SSH 는 `ro` 마운트라 읽기만 되면 충분.
- 운영 시 `SECRET_KEY` 기본값(`change-me`)을 반드시 교체.

## 산출물

1. `Containerfile` — 멀티스테이지 빌드
2. `.containerignore` — 빌드 컨텍스트 정리
3. `run-podman.sh` — 한 번에 실행하는 헬퍼 (실행권한 부여)
4. `README.md` 의 배포 섹션 — 빌드/실행/자격증명 주입/엣지케이스 안내

기존 `build.sh` / `run.sh` 는 로컬(비컨테이너) 개발용으로 그대로 둔다.

## 검증 기준

- `podman build -t k8s-manager:latest .` 가 호스트에 node/python 없이 성공한다.
- 컨테이너 기동 후 `http://localhost:8000` 에서 프론트엔드가 서빙된다.
- kubeconfig 마운트 시 클러스터 개요 API 가 노드/파드 데이터를 반환한다.
- 컨테이너 삭제 후 재생성해도 `k8s-manager-data` 볼륨의 DB(사용자/이력)가 유지된다.
