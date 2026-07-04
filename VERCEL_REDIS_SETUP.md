# Vercel + Redis 연결 및 배포 기록

이 문서는 `Bus Route` 앱을 Vercel에 배포하고 Redis를 연결한 과정을 정리한 운영 문서입니다.

비밀값은 문서에 적지 않습니다. Redis REST URL과 token 값은 Vercel 환경변수와 로컬 `.env.*.local` 파일에만 둡니다.

## 1. 현재 배포 상태

프로덕션 주소:

```text
https://bus-game-five.vercel.app
```

Vercel 프로젝트:

```text
xutuxs-projects/bus-game
```

현재 앱은 방 상태를 Redis REST에만 저장합니다.

1. `UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_TOKEN` 사용
2. 또는 같은 REST 값의 alias로 `KV_REST_API_URL`과 `KV_REST_API_TOKEN` 사용

Redis REST 환경변수가 없으면 앱은 방 상태를 저장할 수 없습니다.

## 2. 왜 Redis가 필요한가

처음 구현은 서버 메모리의 `Map`에 방 상태를 저장했습니다.

로컬 개발에서는 문제가 없지만, Vercel 배포 환경에서는 API 라우트가 서버리스 함수로 실행됩니다.

서버리스 환경에서는 다음 문제가 생길 수 있습니다.

- 요청마다 다른 인스턴스가 처리될 수 있습니다.
- 메모리 상태가 유지된다는 보장이 없습니다.
- 새 배포나 함수 재시작 시 방 데이터가 사라질 수 있습니다.

그래서 방 상태를 Redis에 저장하도록 바꿨습니다.

Redis에 저장하는 주요 데이터:

- 방 코드
- 참가자 목록
- 참가자 색상
- 게임판
- 버스 위치와 방향
- 손패
- 점수
- 이동/행동 제출 상태
- 로그
- 타이머 설정
- 현재 단계 마감 시간

## 3. Redis 연결 방식

별도 Redis SDK를 설치하지 않습니다.

Next.js 서버 코드에서 `fetch()`로 Redis REST API를 호출합니다.

## 4. Vercel 프로젝트 연결

로컬 프로젝트를 Vercel 프로젝트와 연결했습니다.

```bash
npx vercel link
```

연결 결과:

```text
xutuxs-projects/bus-game
```

이 명령을 실행하면 `.vercel/` 폴더가 생성됩니다.

`.vercel/`은 `.gitignore`에 포함되어 있으므로 Git에 올리지 않습니다.

## 5. 환경변수 가져오기

개발 환경변수를 pull했습니다.

```bash
npx vercel env pull .env.development.local
```

프로덕션 환경변수도 로컬 테스트용으로 pull했습니다.

```bash
npx vercel env pull .env.production.local --environment=production
```

주의:

- `.env.local`
- `.env.development.local`
- `.env.production.local`

이 파일들은 비밀값을 포함할 수 있으므로 Git에 올리지 않습니다.

현재 `.gitignore`의 `.env*` 규칙으로 무시됩니다.

## 6. 필요한 환경변수

운영에서 가장 중요한 값은 Redis REST URL과 token입니다.

```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

선택 환경변수:

```bash
ROOM_TTL_SECONDS=43200
MOVE_PHASE_SECONDS=180
ACTION_PHASE_SECONDS=120
```

각 값의 의미:

| 환경변수 | 기본값 | 의미 |
| --- | ---: | --- |
| `UPSTASH_REDIS_REST_URL` | 없음 | Redis REST API URL |
| `UPSTASH_REDIS_REST_TOKEN` | 없음 | Redis REST API token |
| `ROOM_TTL_SECONDS` | 43200 | 방 데이터 유지 시간. 기본 12시간 |
| `MOVE_PHASE_SECONDS` | 180 | 이동 단계 기본 시간. 기본 3분 |
| `ACTION_PHASE_SECONDS` | 120 | 행동 단계 기본 시간. 기본 2분 |

Vercel KV 호환 이름도 Redis REST alias로 지원합니다.

```bash
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

## 7. Vercel에서 Redis 연결 확인

CLI로 환경변수 목록을 확인할 수 있습니다.

```bash
npx vercel env ls
```

정상이라면 다음처럼 Redis REST 환경변수가 보여야 합니다.

```text
name                      value       environments
UPSTASH_REDIS_REST_URL    Encrypted   Preview, Production
UPSTASH_REDIS_REST_TOKEN  Encrypted   Preview, Production
```

값은 암호화되어 표시됩니다. 실제 URL을 터미널에 출력하지 않습니다.

## 8. 코드에서 Redis를 쓰는 방식

저장소 코드는 다음 파일에 있습니다.

```text
src/server/gameStore.ts
```

핵심 흐름:

```ts
const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
```

REST URL과 token이 있으면 `fetch()`로 Redis 명령을 보냅니다.

방 상태는 Redis key 하나에 JSON으로 저장합니다.

```text
room:ABCD -> RoomRecord JSON
```

저장 시 TTL을 함께 설정합니다.

```text
기본 TTL: 12시간
```

방에 변경이 생길 때마다 TTL이 다시 연장됩니다.

## 9. 동시 요청 처리

게임에서는 PLUS와 MINUS가 거의 동시에 제출할 수 있습니다.

그래서 저장할 때 `version` 값을 사용합니다.

저장 흐름:

1. Redis에서 현재 방 상태와 `version`을 읽습니다.
2. 게임 상태를 변경합니다.
3. 저장할 때 Redis에 있는 `version`이 읽었던 값과 같은지 확인합니다.
4. 같으면 저장하고 `version + 1`로 올립니다.
5. 다르면 다른 요청이 먼저 저장한 것이므로 다시 읽고 재시도합니다.

이 처리는 Redis `EVAL` 명령으로 원자적으로 실행합니다.

## 10. 배포 명령

로컬 변경사항을 직접 Vercel 프로덕션에 배포할 때 사용한 명령입니다.

```bash
npx vercel --prod --yes
```

배포가 성공하면 CLI에 다음 정보가 나옵니다.

```text
Production  https://...
Aliased     https://bus-game-five.vercel.app
readyState  READY
```

## 11. 배포 후 API 확인

브라우저 대신 API로 빠르게 확인할 수 있습니다.

새 방 생성:

```bash
curl -s -X POST https://bus-game-five.vercel.app/api/rooms
```

예상 응답:

```json
{"roomCode":"ABCD"}
```

방 상태 조회:

```bash
curl -s https://bus-game-five.vercel.app/api/game/ABCD/public
```

정상 응답에는 다음 정보가 포함됩니다.

```json
{
  "status": "LOBBY",
  "serverNow": 1783119007807,
  "roomExpiresAt": 1783162201467,
  "timerSettings": {
    "movePhaseSeconds": 180,
    "actionPhaseSeconds": 120
  }
}
```

## 12. 자주 생긴 문제

### Vercel 웹 화면에서 `This page couldn't load`가 뜨는 경우

Vercel 대시보드가 깨져도 CLI로 대부분 처리할 수 있습니다.

확인:

```bash
npx vercel env ls
```

배포:

```bash
npx vercel --prod --yes
```

### `.env.development.local`에 Redis REST 환경변수가 없는 경우

Redis REST 환경변수가 `Preview, Production`에만 있고 `Development`에는 없을 수 있습니다.

프로덕션 환경변수를 로컬로 확인하려면 다음을 사용합니다.

```bash
npx vercel env pull .env.production.local --environment=production
```

### 로컬에서 Redis REST 환경변수가 없는 경우

로컬 `.env.local`이나 `.env.development.local`에 Redis REST 환경변수가 없으면 방 생성과 상태 저장 요청이 실패합니다.

로컬에서도 Vercel에서 받은 `UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_TOKEN` 값을 설정해야 합니다.

## 13. 운영 체크리스트

배포 전:

```bash
npm run build
```

환경변수 확인:

```bash
npx vercel env ls
```

프로덕션 배포:

```bash
npx vercel --prod --yes
```

배포 후 방 생성 확인:

```bash
curl -s -X POST https://bus-game-five.vercel.app/api/rooms
```

## 14. Git에 올리면 안 되는 파일

다음 파일은 비밀값 또는 로컬 Vercel 연결 정보를 포함할 수 있습니다.

```text
.env.local
.env.development.local
.env.production.local
.vercel/
```

이 파일들은 Git에 올리지 않습니다.

## 15. Git에 올려야 하는 파일

다음 파일들은 코드와 문서이므로 커밋 대상입니다.

```text
package.json
package-lock.json
src/server/gameStore.ts
.env.example
README.md
VERCEL_REDIS_SETUP.md
```
