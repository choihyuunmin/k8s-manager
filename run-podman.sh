#!/bin/bash
set -e

IMAGE=${IMAGE:-k8s-manager:latest}
NAME=${NAME:-k8s-manager}
KUBECONFIG_SRC=${KUBECONFIG_SRC:-$HOME/.kube/config}
SSH_DIR=${SSH_DIR:-$HOME/.ssh}
PORT=${PORT:-8000}
# SECRET_KEY: 명시적으로 주면 그대로 사용. 없으면 로컬 .secret_key에 생성·영속화
# (재시작 시 동일 키 유지 → 기존 토큰 무효화 방지)
SECRET_KEY_FILE="${SECRET_KEY_FILE:-$(dirname "$0")/.secret_key}"
if [ -z "$SECRET_KEY" ]; then
    if [ -f "$SECRET_KEY_FILE" ]; then
        SECRET_KEY=$(cat "$SECRET_KEY_FILE")
    else
        SECRET_KEY=$(openssl rand -hex 32)
        echo "$SECRET_KEY" > "$SECRET_KEY_FILE"
        chmod 600 "$SECRET_KEY_FILE"
        echo "SECRET_KEY를 생성하여 $SECRET_KEY_FILE 에 저장했습니다 (다음 실행에도 재사용)."
    fi
fi

if [ ! -f "$KUBECONFIG_SRC" ]; then
    echo "경고: kubeconfig를 찾을 수 없습니다: $KUBECONFIG_SRC"
    echo "      KUBECONFIG_SRC 환경변수로 경로를 지정하세요."
fi

# 기존 컨테이너 정리
podman rm -f "$NAME" 2>/dev/null || true

exec podman run -d --name "$NAME" \
  -p "${PORT}:8000" \
  -v "${KUBECONFIG_SRC}:/config/kube:ro,z" \
  -v "${SSH_DIR}:/home/app/.ssh:ro,z" \
  -v k8s-manager-data:/app/backend/data \
  -e K8S_MANAGER_KUBECONFIG_PATH=/config/kube \
  -e "K8S_MANAGER_SECRET_KEY=${SECRET_KEY}" \
  "$IMAGE"
