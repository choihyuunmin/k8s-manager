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
