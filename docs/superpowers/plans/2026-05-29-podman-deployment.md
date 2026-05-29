# 환경 무관 Podman 배포 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 호스트에 podman만 있으면 K8s Manager를 동일하게 빌드·실행할 수 있는 멀티스테이지 컨테이너 배포 구성을 추가한다.

**Architecture:** 멀티스테이지 Containerfile(node:22-alpine로 프론트 빌드 → python:3.12-slim 런타임)로 단일 이미지를 만든다. kubeconfig·SSH 키·상태 데이터는 볼륨 마운트와 `K8S_MANAGER_` 환경변수로 주입하므로 백엔드 코드는 변경하지 않는다. `run-podman.sh` 헬퍼가 모든 마운트/환경변수를 묶어 두 단계 배포(`podman build` + `./run-podman.sh`)를 가능하게 한다.

**Tech Stack:** Podman, Containerfile(OCI), node 22 / npm, Python 3.12, FastAPI/uvicorn

**참고:** 이 프로젝트에는 단위 테스트 프레임워크(pytest 등)가 없고, 산출물은 Containerfile·셸 스크립트·문서다. 따라서 각 태스크의 "테스트"는 실제 빌드/실행 명령과 그 출력 확인으로 한다(build가 성공하는지, 컨테이너가 서빙하는지 등).

**사전 확인됨:**
- vite 기본 outDir = `frontend/dist` (vite.config.ts에 override 없음)
- 영속 대상은 `backend/data/`(= `k8s-manager.db` + `uploads/`) 한 곳
- `backend/config.py`는 `env_prefix = "K8S_MANAGER_"`로 환경변수를 읽음 → 코드 변경 불필요

---

### Task 1: `.containerignore` 추가

빌드 컨텍스트에서 불필요/오래된 산출물을 제외해 재현성과 빌드 속도를 확보한다. (Stage 1에서 dist를 새로 빌드하므로 호스트의 기존 `frontend/dist`는 반드시 제외)

**Files:**
- Create: `.containerignore`

- [ ] **Step 1: `.containerignore` 작성**

```
.git/
backend/venv/
backend/data/
**/__pycache__/
**/*.py[cod]
frontend/node_modules/
frontend/dist/
*.db
.env
docs/
```

- [ ] **Step 2: 커밋**

```bash
git add .containerignore
git commit -m "build: 컨테이너 빌드 컨텍스트 제외 목록 추가"
```

---

### Task 2: 멀티스테이지 `Containerfile` 작성

node로 프론트를 빌드하고 python 런타임으로 백엔드를 실행하는 단일 이미지를 만든다. 비root `app` 사용자로 실행하고, paramiko 기본 키 탐색 경로(`/home/app/.ssh`)와 데이터 디렉터리 소유권을 맞춘다.

**Files:**
- Create: `Containerfile`

- [ ] **Step 1: `Containerfile` 작성**

```dockerfile
# syntax=docker/dockerfile:1

# ---- Stage 1: 프론트엔드 빌드 ----
FROM node:22-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
# 산출물: /frontend/dist

# ---- Stage 2: 런타임 ----
FROM python:3.12-slim AS runtime

# 비root 사용자 (홈 /home/app — paramiko 기본 SSH 키 탐색 경로 확보)
RUN useradd --create-home --home-dir /home/app --shell /usr/sbin/nologin app

WORKDIR /app/backend

# 파이썬 의존성 (bcrypt/cryptography는 wheel 제공 → 빌드 툴 불필요)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 백엔드 소스
COPY backend/ ./

# 프론트 빌드 산출물을 static으로
COPY --from=frontend-builder /frontend/dist ./static

# 데이터 디렉터리 생성 + 소유권 (명명 볼륨 마운트 지점)
RUN mkdir -p /app/backend/data && chown -R app:app /app/backend/data /home/app

ENV K8S_MANAGER_KUBECONFIG_PATH=/config/kube \
    PYTHONUNBUFFERED=1

USER app
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: 이미지 빌드 (호스트에 node/python 없이 성공해야 함)**

Run: `podman build -t k8s-manager:latest .`
Expected: 두 스테이지 모두 성공, 마지막에 `Successfully tagged ...` / 이미지 ID 출력. 에러 없이 종료(exit 0).

만약 `npm ci`가 lockfile 불일치로 실패하면 → 원인을 조사(`package-lock.json`이 최신인지). 임의로 `npm install`로 바꾸지 말 것(재현성 손상).

- [ ] **Step 3: 이미지에 산출물이 들어갔는지 확인**

Run: `podman run --rm k8s-manager:latest ls static/index.html`
Expected: `static/index.html` 출력(프론트 빌드본이 static에 복사됨).

- [ ] **Step 4: 커밋**

```bash
git add Containerfile
git commit -m "build: 멀티스테이지 Containerfile 추가 (node 빌드 + python 런타임)"
```

---

### Task 3: `run-podman.sh` 헬퍼 스크립트 작성

모든 볼륨 마운트/환경변수를 묶어 한 번에 실행한다. 경로는 환경변수로 덮어쓸 수 있게 한다.

**Files:**
- Create: `run-podman.sh`

- [ ] **Step 1: `run-podman.sh` 작성**

```bash
#!/bin/bash
set -e

IMAGE=${IMAGE:-k8s-manager:latest}
NAME=${NAME:-k8s-manager}
KUBECONFIG_SRC=${KUBECONFIG_SRC:-$HOME/.kube/config}
SSH_DIR=${SSH_DIR:-$HOME/.ssh}
PORT=${PORT:-8000}
SECRET_KEY=${SECRET_KEY:-change-me}

if [ ! -f "$KUBECONFIG_SRC" ]; then
    echo "경고: kubeconfig를 찾을 수 없습니다: $KUBECONFIG_SRC"
    echo "      KUBECONFIG_SRC 환경변수로 경로를 지정하세요."
fi

# 기존 컨테이너 정리
podman rm -f "$NAME" 2>/dev/null || true

exec podman run -d --name "$NAME" \
  -p "${PORT}:8000" \
  -v "${KUBECONFIG_SRC}:/config/kube:ro,Z" \
  -v "${SSH_DIR}:/home/app/.ssh:ro,Z" \
  -v k8s-manager-data:/app/backend/data \
  -e K8S_MANAGER_KUBECONFIG_PATH=/config/kube \
  -e "K8S_MANAGER_SECRET_KEY=${SECRET_KEY}" \
  "$IMAGE"
```

- [ ] **Step 2: 실행 권한 부여**

Run: `chmod +x run-podman.sh`
Expected: 출력 없음(성공).

- [ ] **Step 3: 실행 후 기동 확인**

Run:
```bash
./run-podman.sh && sleep 3 && podman ps --filter name=k8s-manager --format '{{.Status}}'
```
Expected: `Up ...` 상태 출력(컨테이너가 떠 있음).

- [ ] **Step 4: 프론트엔드 서빙 확인**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/`
Expected: `200`

- [ ] **Step 5: 정리 + 커밋**

```bash
podman rm -f k8s-manager
git add run-podman.sh
git commit -m "build: 한 번에 실행하는 run-podman.sh 헬퍼 추가"
```

---

### Task 4: 영속성 검증 (명명 볼륨)

컨테이너를 지웠다 다시 만들어도 `k8s-manager-data` 볼륨의 DB가 유지되는지 확인한다. (설계의 핵심 검증 기준)

**Files:** (코드 변경 없음 — 검증만)

- [ ] **Step 1: 컨테이너 기동 후 볼륨에 DB 생성 확인**

Run:
```bash
./run-podman.sh && sleep 3
podman exec k8s-manager ls -la /app/backend/data/
```
Expected: `k8s-manager.db` 파일이 보임(앱이 init_db로 생성). `app` 사용자 소유로 쓰기 가능.

- [ ] **Step 2: 컨테이너 삭제 후 재생성, DB 유지 확인**

Run:
```bash
podman rm -f k8s-manager
./run-podman.sh && sleep 3
podman exec k8s-manager ls /app/backend/data/k8s-manager.db
```
Expected: `/app/backend/data/k8s-manager.db` 출력(볼륨에 보존되어 그대로 존재).

- [ ] **Step 3: 정리**

Run: `podman rm -f k8s-manager`
Expected: 컨테이너 이름 출력(삭제됨). 볼륨은 유지됨.

이 태스크는 검증 전용이므로 커밋 없음.

---

### Task 5: README 배포 섹션 작성

빌드/실행/자격증명 주입/엣지케이스를 문서화한다.

**Files:**
- Create: `README.md`

- [ ] **Step 1: `README.md` 작성**

```markdown
# K8s Manager

쿠버네티스 클러스터 관리 웹 도구 (FastAPI + React).

## Podman으로 배포 (권장)

호스트에 **podman만** 있으면 됩니다. node/python/venv 설치 불필요.

### 1. 빌드

```bash
podman build -t k8s-manager:latest .
```

### 2. 실행

```bash
./run-podman.sh
```

`http://localhost:8000` 접속.

### 자격증명 / 데이터 주입

`run-podman.sh`는 다음을 컨테이너에 주입합니다(환경변수로 덮어쓰기 가능):

| 환경변수 | 기본값 | 용도 |
|---|---|---|
| `KUBECONFIG_SRC` | `$HOME/.kube/config` | 클러스터 접속용 kubeconfig (읽기전용 마운트) |
| `SSH_DIR` | `$HOME/.ssh` | 노드 SSH 접속 키 (읽기전용 마운트) |
| `PORT` | `8000` | 호스트 노출 포트 |
| `SECRET_KEY` | `change-me` | JWT 서명 키 — **운영 시 반드시 교체** |

상태 데이터(DB·업로드)는 명명 볼륨 `k8s-manager-data`에 영속화되어, 컨테이너를 재생성해도 유지됩니다.

예시(포트/키 변경):

```bash
PORT=9000 SECRET_KEY="$(openssl rand -hex 32)" ./run-podman.sh
```

### 주의사항

- **kubeconfig의 API 서버가 `localhost`/`127.0.0.1`을 가리키는 경우**, 컨테이너 내부에서 호스트에 닿지 않습니다. `--network=host`로 실행하거나 kubeconfig의 `server:` 주소를 노드 IP로 바꾸세요.
- SELinux 환경에서는 마운트에 `:Z` 옵션이 적용됩니다(스크립트에 포함됨).
- 루트리스 podman의 UID 매핑 때문에 호스트 파일 소유권과 다를 수 있으나, kubeconfig/SSH는 읽기전용 마운트라 읽기만 되면 됩니다.

## 로컬 개발 (비컨테이너)

```bash
./build.sh   # venv + pip install + 프론트 dist 복사
./run.sh     # uvicorn 실행
```
```

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "docs: Podman 배포 안내 README 추가"
```

---

## Self-Review

**Spec coverage:**
- 멀티스테이지 빌드(node→python) → Task 2 ✓
- `.containerignore` → Task 1 ✓
- kubeconfig/SSH/데이터/SECRET_KEY/포트 주입 → Task 3 (run-podman.sh) ✓
- 비root `app` 사용자 + `/home/app/.ssh` + data 소유권 → Task 2 ✓
- 명명 볼륨 영속성 → Task 3 마운트 + Task 4 검증 ✓
- README(빌드/실행/주입/엣지케이스) → Task 5 ✓
- 기존 build.sh/run.sh 유지 → Task 5 README에 명시, 삭제하지 않음 ✓

**Placeholder scan:** 모든 step에 실제 파일 내용/명령/기대출력 포함. placeholder 없음.

**Type/이름 일관성:** 컨테이너 경로(`/config/kube`, `/home/app/.ssh`, `/app/backend/data`), 환경변수명(`K8S_MANAGER_KUBECONFIG_PATH`, `K8S_MANAGER_SECRET_KEY`), 볼륨명(`k8s-manager-data`), 이미지 태그(`k8s-manager:latest`)가 Task 2/3/5 전반에서 일치함. ✓
