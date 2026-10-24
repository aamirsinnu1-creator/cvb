# SignBridge – Sign language to text and speech

Tracks **one or two hands** through the webcam and turns signs into a sentence and spoken audio.
Plain HTML, CSS and JavaScript plus Google MediaPipe Hand Landmarker. No backend, no build step.

## Run
The camera needs HTTPS or `localhost`, and ES modules do not load from `file://`.

**GitHub Pages:** unzip, push the files to a repo root, then Settings > Pages > Deploy from a branch > main / (root).

**Locally:** `python -m http.server 8000`, then open http://localhost:8000

## Built-in signs
One to Four (1-4 fingers), Hello (open hand), Yes (fist), Good (thumb up), No (thumb down), Call me,
I love you, and two-hand signs: Namaste (palms together), Welcome (open hands apart), Very good (both thumbs up), Stop (both fists).

## Teach your own signs
Type a word, press **Record**, wait for the 3-second countdown, then hold the sign for 3 seconds (one or both hands).
Record each sign 2-3 times at slightly different angles. Signs are saved in your browser; use **Export / Import** to back them up or move them.
The **Matching strictness** slider controls how close a sign must be to your recordings.

## How it works
- `gestures.js` – finger-state rules for built-in signs; a 129-number feature vector (both hands plus the distance between them); nearest-neighbour matching for recorded signs.
- `app.js` – camera, tracking, hold-to-confirm, sentence, speech (English, Hindi, Malayalam if your device has the voice), recording.

## Limits
Recognition is per-frame hand shape and position, so it works best for static signs. Real sign languages (ISL, ASL, BSL)
also use movement and facial expression. Record your own versions of the signs you need, and use good light and a plain background.
