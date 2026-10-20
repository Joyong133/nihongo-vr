# 桜の村 — VR 벚꽃 마을

Meta Quest 브라우저에서 걸어 다니는 실제 크기의 일본 마을입니다. 마치야 거리, 붉은 아치 다리, 도리이와 신사, 5층탑, 논, 멀리 후지산이 있고, 건물·나무에 부딪히며 다리와 신사 계단은 올라갈 수 있습니다.

- 주소: **https://joyong133.github.io/nihongo-vr/village/**
- 일본어 학습 앱과 따로 떨어진 정적 페이지입니다. 빌드 과정이 없고, three.js는 `index.html`의 import map으로 CDN(jsdelivr)에서 받습니다. 이 폴더만 어느 정적 호스팅에 올려도 그대로 동작합니다.

| | Quest VR | PC |
| --- | --- | --- |
| 걷기 | 왼쪽 스틱 | WASD · 방향키 |
| 달리기 | 그립 쥐기 | Shift |
| 회전 | 오른쪽 스틱 좌우 (30°씩) | 화면 클릭 후 마우스 |
| 입구로 돌아가기 | A | R |

## 파일

- `index.html`, `style.css`, `main.js` — 페이지와 WebXR 이동·충돌 처리
- `models/village_vr.glb` — 마을 모델 (약 3만 9천 삼각형, 재질별 메쉬 32개)
- `blender/vr_village.py` — 모델을 만드는 Blender 스크립트. Blender의 Scripting 탭에서 실행하면 `village_vr.glb`가 생기고, 그 파일을 `models/`에 덮어쓰면 됩니다.

## 로컬에서 보기

```bash
cd village
python3 -m http.server 8000   # http://localhost:8000
```

PC 브라우저에서 `?iwer`를 붙이면 Quest 3 에뮬레이터로 VR 모드를 시험할 수 있습니다.
