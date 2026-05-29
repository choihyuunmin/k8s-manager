#!/bin/bash
set -e

IMAGE=${IMAGE:-k8s-manager:latest}
NAME=${NAME:-k8s-manager}
KUBECONFIG_SRC=${KUBECONFIG_SRC:-$HOME/.kube/config}
SSH_DIR=${SSH_DIR:-$HOME/.ssh}
PORT=${PORT:-8000}
# 기본은 로컬호스트만 노출(외부 인터페이스로 공개하지 않음).
# 외부에 공개하려면 BIND_ADDR=0.0.0.0 으로 명시(역프록시/인증 보강 권장).
BIND_ADDR=${BIND_ADDR:-127.0.0.1}

SCRIPT_DIR="$(dirname "$0")"

# 비밀값을 생성하지 못하면(=openssl 부재) 파괴적 작업 전에 즉시 중단
if [ -z "$SECRET_KEY" ] || [ -z "$ADMIN_PASSWORD" ]; then
    command -v openssl >/dev/null 2>&1 || {
        echo "오류: openssl 이 필요합니다(SECRET_KEY/ADMIN_PASSWORD 생성용). 설치 후 다시 실행하세요." >&2
        exit 1
    }
fi

# 생성·영속화 헬퍼: 환경변수로 주면 그대로 쓰고, 없으면 파일에서 읽거나 새로 생성.
# (재시작 시 동일 값 유지 → 토큰 무효화·비밀번호 변동 방지)
persist_secret() {
    local current="$1" file="$2" label="$3"
    if [ -n "$current" ]; then
        printf '%s' "$current"
        return
    fi
    if [ -f "$file" ]; then
        cat "$file"
        return
    fi
    local generated
    generated=$(openssl rand -hex 32)
    printf '%s' "$generated" > "$file"
    chmod 600 "$file"
    echo "$label 를 생성하여 $file 에 저장했습니다 (다음 실행에도 재사용)." >&2
    printf '%s' "$generated"
}

SECRET_KEY=$(persist_secret "$SECRET_KEY" "${SECRET_KEY_FILE:-$SCRIPT_DIR/.secret_key}" "SECRET_KEY")
ADMIN_PASSWORD=$(persist_secret "$ADMIN_PASSWORD" "${ADMIN_PASSWORD_FILE:-$SCRIPT_DIR/.admin_password}" "ADMIN_PASSWORD(admin 초기 비밀번호)")

# --- 사전 검증: 동작 중인 컨테이너를 지우기 전에 교체가 가능한지 먼저 확인 ---
podman image exists "$IMAGE" || {
    echo "오류: 이미지 '$IMAGE' 가 없습니다. 먼저 'podman build -t $IMAGE .' 를 실행하세요." >&2
    exit 1
}

if [ ! -f "$KUBECONFIG_SRC" ]; then
    if [ "${ALLOW_NO_KUBECONFIG:-0}" = "1" ]; then
        echo "경고: kubeconfig 없음($KUBECONFIG_SRC). ALLOW_NO_KUBECONFIG=1 이므로 계속 진행합니다." >&2
    else
        echo "오류: kubeconfig 를 찾을 수 없습니다: $KUBECONFIG_SRC" >&2
        echo "      KUBECONFIG_SRC 로 경로를 지정하거나, 클러스터 없이 띄우려면 ALLOW_NO_KUBECONFIG=1 을 설정하세요." >&2
        exit 1
    fi
fi

# 사전 검증 통과 후에만 기존 컨테이너 정리
podman rm -f "$NAME" 2>/dev/null || true

exec podman run -d --name "$NAME" \
  -p "${BIND_ADDR}:${PORT}:8000" \
  -v "${KUBECONFIG_SRC}:/config/kube:ro,z" \
  -v "${SSH_DIR}:/home/app/.ssh:ro,z" \
  -v k8s-manager-data:/app/backend/data \
  -e K8S_MANAGER_KUBECONFIG_PATH=/config/kube \
  -e "K8S_MANAGER_SECRET_KEY=${SECRET_KEY}" \
  -e "K8S_MANAGER_ADMIN_PASSWORD=${ADMIN_PASSWORD}" \
  "$IMAGE"
