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

`http://localhost:8000` 접속. (기본은 **로컬호스트에만** 바인딩됩니다. 외부 인터페이스로 공개하려면 `BIND_ADDR=0.0.0.0`)

### 자격증명 / 데이터 주입

`run-podman.sh`는 다음을 컨테이너에 주입합니다(환경변수로 덮어쓰기 가능):

| 환경변수 | 기본값 | 용도 |
|---|---|---|
| `KUBECONFIG_SRC` | `$HOME/.kube/config` | 클러스터 접속용 kubeconfig (읽기전용 마운트). 없으면 기동 중단(아래 `ALLOW_NO_KUBECONFIG` 참고) |
| `SSH_DIR` | `$HOME/.ssh` | 노드 SSH 접속 키 (읽기전용 마운트) |
| `BIND_ADDR` | `127.0.0.1` | 바인딩 호스트 주소. 기본은 로컬호스트 전용. 외부 공개 시 `0.0.0.0` |
| `PORT` | `8000` | 노출 포트 |
| `SECRET_KEY` | 자동 생성 후 `.secret_key`에 저장 | JWT 서명 키. 미지정 시 `openssl rand`로 생성·영속화하여 재시작에도 유지. 직접 지정하려면 환경변수로 전달 |
| `ADMIN_PASSWORD` | 자동 생성 후 `.admin_password`에 저장 | `admin` 계정 초기 비밀번호. 미지정 시 강한 난수로 생성·영속화(첫 생성 시 1회 출력). 직접 지정하려면 환경변수로 전달 |
| `ALLOW_NO_KUBECONFIG` | `0` | `1`이면 kubeconfig 없이도 기동 허용(클러스터 기능은 호출 시 실패) |

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
- **초기 `admin` 비밀번호**: 권장 경로(`run-podman.sh`)는 약한 기본값(`admin123`)을 쓰지 않고 강한 난수를 생성해 `.admin_password`에 저장하며, 생성 시 1회 출력합니다. 직접 지정하려면 `ADMIN_PASSWORD=... ./run-podman.sh`. (비컨테이너 `run.sh` 로컬 개발 경로는 `K8S_MANAGER_ADMIN_PASSWORD` 미설정 시 여전히 `admin123`을 시드하므로 로컬 한정으로만 쓰세요.)
- **기본 바인딩은 `127.0.0.1`** 입니다. 외부에 공개하려면 `BIND_ADDR=0.0.0.0`으로 명시하되, 이 도구는 클러스터/노드 자격증명에 접근하므로 역프록시·방화벽 등 추가 보호를 두는 것을 권장합니다.
- `run-podman.sh`는 동작 중인 컨테이너를 지우기 **전에** 이미지 존재·kubeconfig·openssl 가용성을 먼저 검증하여, 교체 실패로 기존 서비스가 사라지는 것을 막습니다.

## 로컬 개발 (비컨테이너)

```bash
./build.sh   # venv + pip install + 프론트 dist 복사
./run.sh     # uvicorn 실행
```
