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
| `GROQ_API_KEY` | Powers the AI features. Get one at https://console.groq.com. |
| `YOUTUBE_API_KEY` | Powers music search. |

## Deployment

Static files are served with WhiteNoise. Before deploying, run:

```bash
python manage.py collectstatic --noinput
```

and set `DJANGO_DEBUG=False`, a strong `DJANGO_SECRET_KEY`, and `DJANGO_ALLOWED_HOSTS`.
