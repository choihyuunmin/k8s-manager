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
