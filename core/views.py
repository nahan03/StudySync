import json
import os
from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

GROQ_MODEL = 'llama-3.3-70b-versatile'

def _groq_client():
    api_key = os.environ.get('GROQ_API_KEY', '')
    if not api_key:
        raise ValueError('GROQ_API_KEY not configured on server')
    from groq import Groq
    return Groq(api_key=api_key)

def _groq_error(e):
    msg = str(e)
    if '429' in msg or 'rate_limit' in msg.lower():
        if 'per_day' in msg.lower() or 'daily' in msg.lower():
            detail = 'Daily quota exhausted — try again tomorrow or upgrade your Groq API plan.'
        else:
            detail = 'Too many requests — wait a few seconds and try again.'
        return JsonResponse({'error': detail}, status=429)
    return JsonResponse({'error': msg}, status=500)
@login_required(login_url='login')
def home(request):
    return render(request, 'core/home.html')



# def signup_view(request):
#     if request.method == "POST":
#         username = request.POST.get("username")
#         password = request.POST.get("password")

#         User.objects.create_user(username=username, password=password)
#         messages.success(request, "Account created successfully!")
#         return redirect('login')

#     return render(request, 'core/signup.html')
def signup_view(request):
    if request.method == 'POST':
        print(request.POST)
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')
        password2 = request.POST.get('password2', '')

        if password == password2:
            if User.objects.filter(username=username).exists():
                messages.error(request, 'Username already taken')
                return redirect('signup')
            else:
                user = User.objects.create_user(username=username, password=password)
                user.save()
                messages.success(request, 'Account created successfully')
                return redirect('login')
        else:
            messages.error(request, 'Passwords do not match')
            return redirect('signup')
    return render(request, 'core/signup.html')


def login_view(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            # redirect to 'next' page if present, else home
            next_page = request.GET.get('next', 'home')
            return redirect(next_page)
        else:
            messages.error(request, "Invalid credentials")
            return redirect('login')
    return render(request, 'core/login.html')

def logout_view(request):
    logout(request)
    messages.success(request, 'Logged out successfully')
    return redirect('login')

def daily_mode(request):
    return render(request, 'core/daily_mode.html')

def exam_mode(request):
    return render(request, 'core/exam_mode.html')

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
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)})


@login_required
@csrf_exempt
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
@csrf_exempt
def generate_questions(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST only'}, status=405)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    context_text  = body.get('context', '').strip()
    num_questions = min(int(body.get('num_questions', 10)), 50)
    types         = body.get('types', ['mcq'])

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
@csrf_exempt
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


@csrf_exempt
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


@csrf_exempt
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


