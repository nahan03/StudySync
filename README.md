# StudySync

A Django study companion with focus timers, an AI study coach, flashcards, and a growing forest that rewards study time.

## Features

- **Daily mode** – focus timer with a session goal, timeline and automatic breaks
- **Exam mode** – AI-generated flashcards and practice questions, PDF chat and summaries
- **Custom mode** – build your own session setup
- **Schedule and stats** – plan study time and track progress
- **Forest** – trees grow as you study
- **Music player** – YouTube-powered study music search

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

## Deployment

Static files are served with WhiteNoise. Before deploying, run:

```bash
python manage.py collectstatic --noinput
```

and set `DJANGO_DEBUG=False`, a strong `DJANGO_SECRET_KEY`, and `DJANGO_ALLOWED_HOSTS`.

## Data and sync

Study sessions are stored in the database (`StudySession`). The schedule, flashcards, saved decks, streak, profile, goals and tree progress are stored per user in `UserState`. The pages keep using localStorage as a working copy: `core/static/js/sync.js` loads the server copy on page load and pushes later changes back. Running timers and music-player state stay per device. Only keys listed in `UserState.SYNCED_KEYS` are accepted.

## Tests

```bash
python manage.py test
```

The AI and music-search tests mock Groq, iTunes and YouTube, so they need no API keys or network.
