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
| `SECRET_KEY` | 자동 생성 후 `.secret_key`에 저장 | JWT 서명 키. 미지정 시 `openssl rand`로 생성·영속화하여 재시작에도 유지. 직접 지정하려면 환경변수로 전달 |

상태 데이터(DB·업로드)는 명명 볼륨 `k8s-manager-data`에 영속화되어, 컨테이너를 재생성해도 유지됩니다.

예시(포트/키 변경):

```bash
PORT=9000 SECRET_KEY="$(openssl rand -hex 32)" ./run-podman.sh
```

### 주의사항

- **kubeconfig의 API 서버가 `localhost`/`127.0.0.1`을 가리키는 경우**, 컨테이너 내부에서 호스트에 닿지 않습니다. `--network=host`로 실행하거나 kubeconfig의 `server:` 주소를 노드 IP로 바꾸세요.
- SELinux 환경에서는 마운트에 `:z`(공유 라벨) 옵션이 적용됩니다(스크립트에 포함됨). 호스트의 kubeconfig/SSH 디렉터리에 공유 라벨이 부여되며, 컨테이너 전용으로 격리하는 `:Z`는 호스트 SSH를 방해할 수 있어 쓰지 않습니다.
- 루트리스 podman의 UID 매핑 때문에 호스트 파일 소유권과 다를 수 있으나, kubeconfig/SSH는 읽기전용 마운트라 읽기만 되면 됩니다.
- `SECRET_KEY`는 첫 실행 시 강한 난수로 자동 생성되어 `.secret_key`에 저장됩니다(버전관리 제외). 직접 지정하려면 `SECRET_KEY=... ./run-podman.sh`.

## 로컬 개발 (비컨테이너)

```bash
./build.sh   # venv + pip install + 프론트 dist 복사
./run.sh     # uvicorn 실행
```
