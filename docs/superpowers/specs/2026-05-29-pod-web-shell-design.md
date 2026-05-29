# 파드 웹 셸 (kubectl exec) 설계

날짜: 2026-05-29
상태: 승인됨 (구현 대기)

## 목표

Rancher의 "Execute Shell"처럼, 웹 UI에서 파드 컨테이너에 직접 셸로 접속해
명령을 실행할 수 있게 한다. 기존 로그 스트리밍의 WebSocket + 토큰 인증 패턴을
양방향으로 확장해 재활용한다.

## 비목표 (YAGNI)

- 세션 녹화/재생
- 다중 탭/다중 세션 관리
- 파일 업로드·다운로드
- 멀티 클러스터 (현재 단일 kubeconfig 유지)

## 아키텍처

로그 WebSocket 패턴을 양방향으로 미러링한다.

```
브라우저(xterm) ⇄ FastAPI WebSocket(/api/exec) ⇄ k8s WSClient(exec stream) ⇄ 파드 컨테이너
```

## 백엔드

### 1. `services/k8s_client.py` — `exec_stream` 추가

- `kubernetes.stream.stream`으로 `core_v1.connect_get_namespaced_pod_exec` 호출.
- 파라미터: `namespace, pod, container`.
- 옵션: `stdin=True, stdout=True, stderr=True, tty=True, _preload_content=False`.
- 셸 command: `["/bin/sh", "-c", "exec /bin/bash 2>/dev/null || exec /bin/sh"]`
  (bash 있으면 bash, 없으면 sh 폴백).
- 반환: 살아있는 `WSClient` 객체.

### 2. `routers/exec.py` — 새 라우터 (`/api/exec`)

- `WS /api/exec/{namespace}/{pod}` (쿼리: `container`, `token`).
- 토큰 검증: `logs.py`와 동일 (`verify_token`, 실패 시 close code 4001).
- 양방향 브리지:
  - WSClient는 동기 → `asyncio.get_event_loop().run_in_executor`(또는 `asyncio.to_thread`)로 감싼다.
  - **파드→브라우저**: 루프에서 `ws_client.is_open()` 동안 `ws_client.read_stdout/read_stderr` 결과를
    FastAPI WebSocket으로 `send_text`.
  - **브라우저→파드**: FastAPI WebSocket `receive_text` → 제어 메시지면 분기, 아니면 `ws_client.write_stdin`.
  - 제어 메시지 형식: `{"type":"resize","cols":N,"rows":M}` → resize 채널
    (`ws_client.write_channel(4, json.dumps({"Width":cols,"Height":rows}))`).
  - 두 방향을 `asyncio.gather`로 동시 구동, 한쪽 종료 시 다른 쪽 취소 + `ws_client.close()`.
- 에러: exec 실패/파드 없음 → `send_text("[ERROR] ...")` 후 close.

### 3. `main.py` — exec 라우터 등록

## 프론트엔드

### 4. 의존성 추가

- `@xterm/xterm`, `@xterm/addon-fit` (package.json).

### 5. `hooks/useExecSocket.ts` — 양방향 WS 훅

- 기존 `useWebSocket`은 수신 전용이라 별도 훅으로 분리.
- `connect({namespace, pod, container})`, `send(data)`, `sendResize(cols, rows)`, `disconnect()`,
  `onData(cb)` (수신 콜백), `isConnected`.
- URL: `${proto}//${host}/api/exec/${ns}/${pod}?container=&token=` (토큰은 localStorage에서).

### 6. `components/PodTerminal.tsx` — 터미널 컴포넌트

- props: `namespace, pod, container, onClose`.
- xterm 인스턴스 + FitAddon. 컨테이너 div에 mount.
- `term.onData(d => exec.send(d))`, `exec.onData(d => term.write(d))`.
- ResizeObserver/창 리사이즈 시 `fit()` 후 `exec.sendResize(cols, rows)`.
- 연결 끊김 시 안내 + "재연결" 버튼.
- 언마운트 시 `term.dispose()`, `exec.disconnect()`.

### 7. `pages/ClusterPage.tsx` — Pods 탭에 "셸" 액션

- describe 모달과 같은 패턴으로 행별 "셸" 버튼.
- 클릭 → `list_pod_containers` 조회 → 컨테이너 2개 이상이면 선택 UI, 1개면 바로 → 터미널 모달 오픈.
- 모달 안에 `<PodTerminal>` 렌더.

## 데이터 흐름

1. Pods 탭에서 파드 행 "셸" 클릭.
2. 컨테이너 목록 조회 → (멀티면) 선택.
3. 터미널 모달 오픈 → `useExecSocket.connect`.
4. 백엔드 토큰 검증 → `exec_stream` 오픈 → 양방향 펌프.
5. 사용자가 모달 닫거나 셸 종료(exit) → 양쪽 정리.

## 에러 처리

| 상황 | 처리 |
|---|---|
| 토큰 없음/무효 | WS close 4001 (로그와 동일) |
| 파드/컨테이너 없음·exec 실패 | 터미널에 `[ERROR] ...` 출력 후 종료 |
| 셸 없는 이미지(distroless) | sh 폴백도 실패 → 에러 메시지 표시 |
| 연결 끊김 | 모달에 "연결 끊김" + 재연결 버튼 |

## 검증

로컬 클러스터 없음 (실제 클러스터는 운영 환경 전용). 따라서:

1. **단위 테스트** (`backend`): `exec_stream`이 올바른 인자(command/stdin/tty 등)로
   `connect_get_namespaced_pod_exec`를 호출하는지 — `stream`/`core_v1` 모킹으로 검증.
2. **빌드/타입체크**: `npx tsc --noEmit`, 프론트 빌드 통과.
3. **운영 환경 수동 체크리스트** (배포 후 사용자 수행):
   - [ ] 파드 행 "셸" 클릭 → 터미널 오픈, 프롬프트 표시
   - [ ] `ls`, `whoami` 등 명령 실행 → 출력 정상
   - [ ] 멀티 컨테이너 파드에서 컨테이너 선택 동작
   - [ ] 창 크기 변경 시 터미널 리사이즈 반영
   - [ ] distroless 등 셸 없는 파드에서 에러 메시지 표시
   - [ ] 모달 닫으면 세션 정리(좀비 연결 없음)
