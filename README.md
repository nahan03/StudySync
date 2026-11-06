# StudySync

A Django study companion with a focus timer, an AI study coach, flashcards, and a growing forest that rewards study time.

## Features

- **Study page** – one configurable timer: presets or your own focus, breaks, rounds and alarms. Every finished cycle grows a tree
- **Looks** – themes (including a clear Glass theme), eight live wallpapers, real-footage and your own picture or video, eight timer ring styles and eight timer fonts
- **Music** – a built-in sound mixer (rain, thunder, wind, fire, ocean, birds, crickets, café, noise, lo-fi keys, ambient pad) with saved mixes and a sleep timer; paste any Spotify, Apple Music, YouTube, SoundCloud or Deezer playlist link; or play audio files and folders from your own computer
- **Flashcards & practice** – AI flashcards, saved decks, Guess It, practice questions and an exam countdown
- **Library & AI coach** – resources, PDF reader with summaries, note graph and a study coach
- **Schedule and stats** – plan study time and track progress
- **Forest** – trees grow as you study; each subject gets its own kind of tree

## Setup

Requires Python 3.10+.

```bash
git clone https://github.com/nahan03/StudySync.git
cd StudySync
python -m venv venv
venv\Scripts\activate        # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # Windows: copy .env.example .env
python manage.py migrate
python manage.py runserver
```

Then open http://127.0.0.1:8000/.

## Configuration

Set these in `.env`:

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Django secret key. Required in production. |
| `DJANGO_DEBUG` | `True` for development, `False` in production. |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hostnames, for example `example.com,www.example.com`. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Comma-separated origins with scheme, for example `https://example.com`. |
| `DJANGO_SSL_REDIRECT` | Defaults to `True` when `DJANGO_DEBUG=False`. Set `False` if TLS is not terminated in front of the app. |
| `DJANGO_HSTS_SECONDS` | HSTS max-age in production (default `3600`; raise it once HTTPS is confirmed). |
| `GROQ_API_KEY` | Powers the AI features. Get one at https://console.groq.com. |
| `YOUTUBE_API_KEY` | Powers music search. |
| `DATABASE_URL` | Production database, for example `postgres://user:pass@host:5432/dbname`. Falls back to local SQLite when unset. |
| `AI_RATE_LIMIT` / `AI_RATE_WINDOW` | Max AI requests per user (default `30`) per window in seconds (default `600`). |

## Deployment

The repo includes a `Procfile` (`gunicorn` web process plus a `migrate` release step) that works on Heroku-style hosts such as Render, Railway or Fly. On a plain VPS, run `gunicorn StudySync.wsgi` behind a reverse proxy that terminates HTTPS.

1. Set `DJANGO_DEBUG=False`, a strong `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `DATABASE_URL`, `GROQ_API_KEY` and `YOUTUBE_API_KEY`.
2. Build step: `pip install -r requirements.txt && python manage.py collectstatic --noinput`.
3. Release step: `python manage.py migrate --noinput`.

Static files are served with WhiteNoise. Use a persistent database (Postgres) in production, because SQLite files are lost on hosts with ephemeral disks. The AI rate limit uses Django's cache, which is per-process by default; configure a shared cache if you run several workers and need an exact cap.

Users can change their password, download their data, and delete their account from `/account/`.

## Data and sync

Study sessions are stored in the database (`StudySession`). The schedule, flashcards, saved decks, streak, profile, goals and tree progress are stored per user in `UserState`. The pages keep using localStorage as a working copy: `core/static/js/sync.js` loads the server copy on page load and pushes later changes back. Running timers and music-player state stay per device. Only keys listed in `UserState.SYNCED_KEYS` are accepted.

## Tests

```bash
python manage.py test
```

The AI and music-search tests mock Groq, iTunes and YouTube, so they need no API keys or network.

## Wallpapers

The Study page has eight animated wallpapers (drawn live on a canvas, see `core/static/js/live_bg.js`) and supports real footage. Drop looping `.mp4`/`.webm` clips into `core/static/wallpapers/` (see the README there) and they appear in Appearance -> Real footage; users can also play a clip from their own device with **My video**. Only use footage you have the rights to.
