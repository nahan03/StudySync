import json
import os
from functools import wraps
from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.forms import PasswordChangeForm
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.templatetags.static import static
from django.views.decorators.http import require_POST
from datetime import date as _date
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils.http import url_has_allowed_host_and_scheme
from .models import StudySession, UserState

GROQ_MODEL = 'llama-3.3-70b-versatile'


def ai_rate_limit(view):
    """Per-user cap on AI POST requests so one account can't burn the shared Groq quota.

    Configure with AI_RATE_LIMIT (requests) and AI_RATE_WINDOW (seconds). The counter
    lives in Django's cache, which is per-process with the default local-memory cache;
    configure a shared cache (Redis/Memcached) for an exact cap across workers.
    """
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if request.method == 'POST':
            limit = int(os.environ.get('AI_RATE_LIMIT', '30'))
            window = int(os.environ.get('AI_RATE_WINDOW', '600'))
            key = f'ai-rate:{request.user.pk}'
            cache.add(key, 0, window)
            try:
                count = cache.incr(key)
            except ValueError:  # expired between add and incr
                cache.set(key, 1, window)
                count = 1
            if count > limit:
                resp = JsonResponse(
                    {'error': 'You have made a lot of AI requests recently. Please wait a few minutes.'},
                    status=429,
                )
                resp['Retry-After'] = str(window)
                return resp
        return view(request, *args, **kwargs)
    return wrapper


class AIUnavailable(Exception):
    """Raised when the AI backend is not configured on this server."""


def _groq_client():
    api_key = os.environ.get('GROQ_API_KEY', '')
    if not api_key:
        raise AIUnavailable('AI features are not configured on this server (missing GROQ_API_KEY).')
    from groq import Groq
    return Groq(api_key=api_key)

def _groq_error(e):
    if isinstance(e, AIUnavailable):
        return JsonResponse({'error': str(e)}, status=503)
    if isinstance(e, json.JSONDecodeError):
        return JsonResponse(
            {'error': 'The AI returned an unreadable response — please try again.'}, status=502
        )
    msg = str(e)
    if '429' in msg or 'rate_limit' in msg.lower():
        if 'per_day' in msg.lower() or 'daily' in msg.lower():
            detail = 'Daily quota exhausted — try again tomorrow or upgrade your Groq API plan.'
        else:
            detail = 'Too many requests — wait a few seconds and try again.'
        return JsonResponse({'error': detail}, status=429)
    return JsonResponse({'error': 'AI request failed. Please try again.'}, status=500)


@login_required(login_url='login')
def home(request):
    return render(request, 'core/home.html')



def signup_view(request):
    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')
        password2 = request.POST.get('password2', '')

        if not username:
            messages.error(request, 'Username is required')
            return redirect('signup')
        if password != password2:
            messages.error(request, 'Passwords do not match')
            return redirect('signup')
        if User.objects.filter(username__iexact=username).exists():
            messages.error(request, 'Username already taken')
            return redirect('signup')
        try:
            validate_password(password, User(username=username))
        except ValidationError as e:
            for msg in e.messages:
                messages.error(request, msg)
            return redirect('signup')
        User.objects.create_user(username=username, password=password)
        messages.success(request, 'Account created successfully')
        return redirect('login')
    return render(request, 'core/signup.html')


def login_view(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            # redirect to 'next' page if present, else home
            next_page = request.GET.get('next', '')
            if next_page and url_has_allowed_host_and_scheme(
                next_page, allowed_hosts={request.get_host()}, require_https=request.is_secure()
            ):
                return redirect(next_page)
            return redirect('home')
        else:
            messages.error(request, "Invalid credentials")
            return redirect(request.get_full_path())
    return render(request, 'core/login.html')

def logout_view(request):
    logout(request)
    messages.success(request, 'Logged out successfully')
    return redirect('login')

@login_required
def study(request):
    """The single study page: user-configured timer, breaks and alarms plus the growing tree."""
    return render(request, 'core/study.html')


@login_required
def daily_mode(request):
    return render(request, 'core/daily_mode.html')

@login_required
def exam_mode(request):
    return render(request, 'core/exam_mode.html')

@login_required
def custom_mode(request):
    return render(request, 'core/custom_mode.html')

@login_required
def schedule(request):
    return render(request, 'core/schedule.html')

@login_required
def forest(request):
    return render(request, 'core/forest.html')

@login_required
def stats(request):
    return render(request, 'core/stats.html')


@login_required
def test_api(request):
    try:
        client = _groq_client()
        r = client.chat.completions.create(model=GROQ_MODEL, messages=[{"role": "user", "content": 'Say ok'}])
        return JsonResponse({'status': 'ok', 'response': r.choices[0].message.content.strip()})
    except AIUnavailable as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=503)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)})


def _clean_session(item):
    """Validate one session dict from the client. Returns StudySession kwargs or None."""
    if not isinstance(item, dict):
        return None
    try:
        day = _date.fromisoformat(str(item.get('date', ''))[:10])
        hours = float(item.get('hours', 0))
    except (ValueError, TypeError):
        return None
    if not (0 <= hours <= 24):
        return None
    mode = item.get('mode', 'daily')
    if mode not in dict(StudySession.MODE_CHOICES):
        mode = 'daily'
    subject = str(item.get('subject') or 'Study')[:120]
    return {'date': day, 'subject': subject, 'hours': hours, 'mode': mode}


@login_required
@require_POST
def record_sessions(request):
    """Save one session ({...}) or a batch ({"sessions": [...]}) for the current user."""
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    items = body.get('sessions') if isinstance(body, dict) and 'sessions' in body else [body]
    if not isinstance(items, list) or len(items) > 1000:
        return JsonResponse({'error': 'Invalid payload'}, status=400)
    rows = [StudySession(user=request.user, **c) for c in map(_clean_session, items) if c]
    StudySession.objects.bulk_create(rows)
    return JsonResponse({'saved': len(rows)})


@login_required
@require_POST
def save_state(request):
    """Upsert synced browser data: {"changes": {key: string | null}}. null deletes the key."""
    try:
        changes = json.loads(request.body).get('changes')
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    if not isinstance(changes, dict):
        return JsonResponse({'error': 'Invalid payload'}, status=400)
    saved = 0
    for key, value in changes.items():
        if key not in UserState.SYNCED_KEYS:
            continue
        if value is None:
            UserState.objects.filter(user=request.user, key=key).delete()
        elif isinstance(value, str) and len(value) <= UserState.MAX_VALUE_CHARS:
            UserState.objects.update_or_create(
                user=request.user, key=key, defaults={'value': value}
            )
        else:
            continue
        saved += 1
    return JsonResponse({'saved': saved})


@login_required
def get_state(request):
    return JsonResponse({'state': dict(
        UserState.objects.filter(user=request.user).values_list('key', 'value')
    )})


@login_required
def list_sessions(request):
    return JsonResponse({'sessions': [s.as_dict() for s in StudySession.objects.filter(user=request.user)]})


@login_required
@ai_rate_limit
def generate_flashcards(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST only'}, status=405)
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    context_text = body.get('context', '').strip()
    if not context_text:
        return JsonResponse({'error': 'No content provided'}, status=400)

    try:
        client = _groq_client()
        prompt = f"""You are a study assistant. Read the study notes below and extract the most important key terms and their definitions or explanations.

Return ONLY a valid JSON array. No markdown, no code fences — just the raw JSON array starting with [ and ending with ].
Each element must have exactly two fields:
  "front": the key term, concept, or question (keep it short — under 10 words)
  "back": the definition, explanation, or answer (1–3 sentences max)

Extract between 5 and 15 of the most important concepts. Focus on terms that are worth memorising.

Study notes:
{context_text}

Remember: output ONLY the JSON array. Start with [ and end with ]."""

        r = client.chat.completions.create(model=GROQ_MODEL, messages=[{"role": "user", "content": prompt}])
        raw = r.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```', 2)[1]
            if raw.startswith('json'):
                raw = raw[4:]
            raw = raw.rsplit('```', 1)[0]
        cards = json.loads(raw)
        return JsonResponse({'cards': cards})
    except Exception as e:
        return _groq_error(e)


@login_required
@ai_rate_limit
def generate_questions(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST only'}, status=405)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    context_text  = body.get('context', '').strip()
    try:
        num_questions = max(1, min(int(body.get('num_questions', 10)), 50))
    except (TypeError, ValueError):
        return JsonResponse({'error': 'num_questions must be a number'}, status=400)
    types         = body.get('types', ['mcq'])
    if not isinstance(types, list):
        return JsonResponse({'error': 'types must be a list'}, status=400)

    if not context_text:
        return JsonResponse({'error': 'No content provided'}, status=400)

    try:
        client = _groq_client()
        prompt = _build_prompt(context_text, num_questions, types)
        r = client.chat.completions.create(model=GROQ_MODEL, messages=[{"role": "user", "content": prompt}])
        raw = r.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```', 2)[1]
            if raw.startswith('json'):
                raw = raw[4:]
            raw = raw.rsplit('```', 1)[0]
        questions = json.loads(raw)
        return JsonResponse({'questions': questions})
    except Exception as e:
        return _groq_error(e)


@login_required
def music_search(request):
    """
    Search music using:
    - iTunes Search API (always free, no key needed) for songs/albums
    - YouTube Data API (optional, free quota) for videos — set YOUTUBE_API_KEY env var
    """
    import urllib.request, urllib.parse, threading
    q = request.GET.get('q', '').strip()
    if not q:
        return JsonResponse({'results': []})

    yt_key  = os.environ.get('YOUTUBE_API_KEY', '')
    results = []
    errors  = []
    lock    = threading.Lock()

    def search_itunes():
        try:
            url = ('https://itunes.apple.com/search?'
                   + urllib.parse.urlencode({
                       'term': q, 'media': 'music', 'entity': 'song',
                       'limit': 8, 'country': 'US',
                   }))
            with urllib.request.urlopen(url, timeout=6) as r:
                data = json.loads(r.read().decode())
            items = []
            for t in data.get('results', []):
                items.append({
                    'id':         str(t.get('trackId', '')),
                    'title':      t.get('trackName', ''),
                    'channel':    t.get('artistName', ''),
                    'thumb':      t.get('artworkUrl60', ''),
                    'preview':    t.get('previewUrl', ''),
                    'source':     'itunes',
                })
            with lock:
                results.extend(items)
        except Exception as e:
            with lock:
                errors.append('iTunes: ' + str(e))

    def search_youtube():
        if not yt_key:
            return
        try:
            url = ('https://www.googleapis.com/youtube/v3/search?'
                   + urllib.parse.urlencode({
                       'part': 'snippet', 'q': q, 'type': 'video',
                       'maxResults': 6, 'videoCategoryId': '10', 'key': yt_key,
                   }))
            with urllib.request.urlopen(url, timeout=6) as r:
                data = json.loads(r.read().decode())
            items = [{
                'id':      item['id']['videoId'],
                'title':   item['snippet']['title'],
                'channel': item['snippet']['channelTitle'],
                'thumb':   item['snippet']['thumbnails']['default']['url'],
                'preview': '',
                'source':  'youtube',
            } for item in data.get('items', []) if item.get('id', {}).get('videoId')]
            with lock:
                results.extend(items)
        except Exception as e:
            with lock:
                errors.append('YouTube: ' + str(e))

    t1 = threading.Thread(target=search_itunes)
    t2 = threading.Thread(target=search_youtube)
    t1.start(); t2.start()
    t1.join();  t2.join()

    # YouTube results first (full songs), then iTunes
    yt = [r for r in results if r.get('source') == 'youtube']
    it = [r for r in results if r.get('source') == 'itunes']
    merged = yt + it

    return JsonResponse({'results': merged, 'errors': errors})


@login_required
@ai_rate_limit
def study_coach(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST only'}, status=405)
    try:
        data    = json.loads(request.body)
        message = data.get('message', '').strip()
        notes   = data.get('notes', [])[:10]
        subject = data.get('subject', 'General')
        if not message:
            return JsonResponse({'error': 'No message'}, status=400)

        client = _groq_client()
        notes_ctx = '\n\n'.join(
            f"### {n.get('title','Untitled')}\n{n.get('body','')}" for n in notes
        ) or 'No notes yet.'
        prompt = (
            f"You are a helpful AI study coach for a student studying {subject}.\n"
            f"Their notes:\n{notes_ctx}\n\n"
            "Guidelines: Answer concisely in 2-5 sentences unless a longer answer is clearly needed. "
            "Use markdown for structure. For quizzes, give one question at a time.\n\n"
            f"Student: {message}"
        )
        r = client.chat.completions.create(model=GROQ_MODEL, messages=[{"role": "user", "content": prompt}])
        return JsonResponse({'reply': r.choices[0].message.content})
    except Exception as e:
        return _groq_error(e)


@login_required
@ai_rate_limit
def pdf_chat(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST only'}, status=405)
    try:
        data     = json.loads(request.body)
        message  = data.get('message', '').strip()
        pdf_text = data.get('pdf_text', '')[:60000]
        if not message:
            return JsonResponse({'error': 'No message'}, status=400)
        client = _groq_client()
        prompt = (
            "You are a study assistant. Answer the student's question using ONLY the document below. "
            "Be concise but thorough. Use markdown for structure when helpful.\n\n"
            f"DOCUMENT:\n{pdf_text}\n\n"
            f"STUDENT QUESTION: {message}"
        )
        r = client.chat.completions.create(model=GROQ_MODEL, messages=[{"role": "user", "content": prompt}])
        return JsonResponse({'reply': r.choices[0].message.content})
    except Exception as e:
        return _groq_error(e)


@login_required
@ai_rate_limit
def pdf_summary(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST only'}, status=405)
    try:
        data     = json.loads(request.body)
        pdf_text = data.get('pdf_text', '')[:8000]
        page_num = data.get('page_num')
        if not pdf_text.strip():
            return JsonResponse({'error': 'No text provided'}, status=400)
        import re
        client = _groq_client()
        page_ctx = f'page {page_num}' if page_num else 'this page'
        prompt = (
            f'Analyse {page_ctx} from a study document and return ONLY valid JSON (no markdown fences, no extra text) '
            'with exactly these fields:\n'
            '{\n'
            '  "summary": "2-3 sentence overview of this page",\n'
            '  "key_concepts": ["concept1", "concept2", ...],\n'
            '  "definitions": [{"term": "...", "definition": "..."}, ...],\n'
            '  "keywords": ["word1", "word2", ...]\n'
            '}\n'
            'key_concepts: max 6 items. definitions: max 4 items. keywords: max 8 items.\n\n'
            f'PAGE TEXT:\n{pdf_text}'
        )
        r = client.chat.completions.create(model=GROQ_MODEL, messages=[{"role": "user", "content": prompt}])
        raw = r.choices[0].message.content.strip()
        raw = re.sub(r'^```(?:json)?\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)
        raw = raw.strip()
        m = re.search(r'\{[\s\S]*\}', raw)
        if m:
            raw = m.group(0)
        result = json.loads(raw)
        return JsonResponse(result)
    except Exception as e:
        return _groq_error(e)


def _build_prompt(context, n, types):
    type_rules = {
        'mcq': (
            'Multiple Choice: write a clear question, then exactly 4 options (A/B/C/D). '
            'Only ONE option is correct. The other 3 must be plausible but wrong. '
            '"answer" must be the exact text of the correct option (not A/B/C/D, the actual text). '
            '"options" is an array of 4 strings.'
        ),
        'truefalse': (
            'True/False: write a factual statement that is clearly True or clearly False based on the material. '
            '"answer" must be exactly "True" or "False". Omit "options".'
        ),
        'shortanswer': (
            'Short Answer: write an open-ended question that requires 1–3 sentences. '
            '"answer" is a concise model answer. Omit "options".'
        ),
        'fillinblank': (
            'Fill in the Blank: take a key sentence from the material and replace the most important term with _____. '
            '"answer" is the exact word or phrase that fills the blank. Omit "options".'
        ),
    }

    active_rules = '\n'.join(
        f'- {type_rules[t]}' for t in types if t in type_rules
    )
    type_values = json.dumps(types)

    return f"""You are an expert study assistant. Your ONLY job is to generate practice questions strictly based on the study material provided below.

RULES:
1. Generate exactly {n} questions total, distributed evenly across these types: {', '.join(types)}.
2. Every question MUST be directly answerable from the study material. Do NOT invent facts or go beyond what is written.
3. Questions must be clear, specific, and educational — not vague or trivial.
4. Vary the difficulty: mix straightforward recall with deeper understanding questions.

TYPE-SPECIFIC RULES:
{active_rules}

OUTPUT FORMAT:
Return ONLY a valid JSON array. No markdown, no code fences, no explanation — just the raw JSON array.
Each element must have:
  "type"        : one of {type_values}
  "question"    : the question text
  "options"     : array of 4 strings (MCQ only — omit for all other types)
  "answer"      : the correct answer string
  "explanation" : one concise sentence explaining why the answer is correct

STUDY MATERIAL:
{context}

Remember: output ONLY the JSON array. Start your response with [ and end with ].
"""


@login_required
def account(request):
    """Change password, export data, delete account."""
    form = PasswordChangeForm(request.user)
    if request.method == 'POST' and request.POST.get('action') == 'password':
        form = PasswordChangeForm(request.user, request.POST)
        if form.is_valid():
            user = form.save()
            update_session_auth_hash(request, user)  # keep the user logged in
            messages.success(request, 'Password updated')
            return redirect('account')
    return render(request, 'core/account.html', {'form': form})


@login_required
def export_data(request):
    data = {
        'username': request.user.get_username(),
        'sessions': [s.as_dict() for s in StudySession.objects.filter(user=request.user)],
        'state': dict(UserState.objects.filter(user=request.user).values_list('key', 'value')),
    }
    resp = HttpResponse(json.dumps(data, indent=2), content_type='application/json')
    resp['Content-Disposition'] = 'attachment; filename="studysync-data.json"'
    return resp


@login_required
@require_POST
def delete_account(request):
    if not request.user.check_password(request.POST.get('password', '')):
        messages.error(request, 'Incorrect password. Your account was not deleted.')
        return redirect('account')
    user = request.user
    logout(request)
    user.delete()  # sessions and synced data cascade
    messages.success(request, 'Your account and data were deleted')
    return redirect('login')


WALLPAPER_EXTS = ('.mp4', '.webm')


@login_required
def wallpaper_list(request):
    """Real-footage wallpapers: every .mp4/.webm dropped into core/static/wallpapers/ is offered.

    An optional picture with the same name (clip.jpg next to clip.mp4) is used as its preview.
    """
    folder = settings.BASE_DIR / 'core' / 'static' / 'wallpapers'
    items = []
    if folder.is_dir():
        for f in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
            if f.is_file() and f.suffix.lower() in WALLPAPER_EXTS:
                poster = f.with_suffix('.jpg')
                items.append({
                    'id': f.stem,
                    'name': f.stem.replace('-', ' ').replace('_', ' ').title(),
                    'url': static('wallpapers/' + f.name),
                    'poster': static('wallpapers/' + poster.name) if poster.is_file() else '',
                })
    return JsonResponse({'wallpapers': items})
