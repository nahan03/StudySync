import json
import os
import re
import secrets
import subprocess
import sys
from unittest import mock

from django.conf import settings
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.urls import reverse

STATIC_OVERRIDE = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def fake_groq(content):
    """A stand-in Groq client whose completion returns `content`."""
    client = mock.Mock()
    client.chat.completions.create.return_value = mock.Mock(
        choices=[mock.Mock(message=mock.Mock(content=content))]
    )
    return client


AI_ENDPOINTS = ('generate_flashcards', 'generate_questions', 'study_coach', 'pdf_chat', 'pdf_summary')


@override_settings(STORAGES=STATIC_OVERRIDE)
class AIEndpointTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('alice', password='pw12345!')

    def post(self, name, payload):
        return self.client.post(reverse(name), json.dumps(payload), content_type='application/json')

    def test_ai_endpoints_require_login(self):
        for name in AI_ENDPOINTS:
            self.assertEqual(self.post(name, {'message': 'x'}).status_code, 302, name)

    def test_post_only(self):
        self.client.force_login(self.user)
        for name in AI_ENDPOINTS:
            self.assertEqual(self.client.get(reverse(name)).status_code, 405, name)

    @mock.patch.dict('os.environ', {'GROQ_API_KEY': ''})
    def test_missing_api_key_is_503_with_clear_message(self):
        self.client.force_login(self.user)
        r = self.post('generate_flashcards', {'context': 'notes'})
        self.assertEqual(r.status_code, 503)
        self.assertIn('GROQ_API_KEY', r.json()['error'])

    @mock.patch('core.views._groq_client')
    def test_flashcards_ok_and_strips_code_fences(self, client):
        client.return_value = fake_groq('```json\n[{"front":"a","back":"b"}]\n```')
        self.client.force_login(self.user)
        r = self.post('generate_flashcards', {'context': 'notes'})
        self.assertEqual(r.json(), {'cards': [{'front': 'a', 'back': 'b'}]})

    @mock.patch('core.views._groq_client')
    def test_flashcards_requires_content(self, client):
        self.client.force_login(self.user)
        self.assertEqual(self.post('generate_flashcards', {'context': '  '}).status_code, 400)
        client.assert_not_called()

    @mock.patch('core.views._groq_client')
    def test_garbled_ai_output_is_502(self, client):
        client.return_value = fake_groq('sorry, no json here')
        self.client.force_login(self.user)
        self.assertEqual(self.post('generate_flashcards', {'context': 'n'}).status_code, 502)

    @mock.patch('core.views._groq_client')
    def test_rate_limit_is_429(self, client):
        client.return_value.chat.completions.create.side_effect = Exception('Error 429 rate_limit')
        self.client.force_login(self.user)
        r = self.post('study_coach', {'message': 'hi'})
        self.assertEqual(r.status_code, 429)
        self.assertIn('Too many requests', r.json()['error'])

    @mock.patch('core.views._groq_client')
    def test_daily_quota_message(self, client):
        client.return_value.chat.completions.create.side_effect = Exception('429 rate_limit per_day')
        self.client.force_login(self.user)
        r = self.post('study_coach', {'message': 'hi'})
        self.assertIn('Daily quota', r.json()['error'])

    @mock.patch('core.views._groq_client')
    def test_unexpected_error_does_not_leak_details(self, client):
        client.return_value.chat.completions.create.side_effect = Exception('secret-internal-detail')
        self.client.force_login(self.user)
        r = self.post('study_coach', {'message': 'hi'})
        self.assertEqual(r.status_code, 500)
        self.assertNotIn('secret-internal-detail', r.content.decode())

    @mock.patch('core.views._groq_client')
    def test_questions_caps_count_and_validates(self, client):
        groq = fake_groq('[{"type":"mcq","question":"q","answer":"a"}]')
        client.return_value = groq
        self.client.force_login(self.user)
        r = self.post('generate_questions', {'context': 'n', 'num_questions': 9999, 'types': ['mcq']})
        self.assertEqual(r.status_code, 200)
        prompt = groq.chat.completions.create.call_args.kwargs['messages'][0]['content']
        self.assertIn('exactly 50 questions', prompt)
        self.assertEqual(
            self.post('generate_questions', {'context': 'n', 'num_questions': 'abc'}).status_code, 400)
        self.assertEqual(
            self.post('generate_questions', {'context': 'n', 'types': 'mcq'}).status_code, 400)

    @mock.patch('core.views._groq_client')
    def test_study_coach_and_pdf_chat_reply(self, client):
        client.return_value = fake_groq('hello')
        self.client.force_login(self.user)
        self.assertEqual(self.post('study_coach', {'message': 'hi', 'notes': []}).json(), {'reply': 'hello'})
        self.assertEqual(self.post('pdf_chat', {'message': 'hi', 'pdf_text': 'doc'}).json(), {'reply': 'hello'})
        self.assertEqual(self.post('study_coach', {'message': ''}).status_code, 400)

    @mock.patch('core.views._groq_client')
    def test_pdf_summary_parses_json(self, client):
        client.return_value = fake_groq(
            'Here: {"summary":"s","key_concepts":[],"definitions":[],"keywords":[]}')
        self.client.force_login(self.user)
        r = self.post('pdf_summary', {'pdf_text': 'text', 'page_num': 2})
        self.assertEqual(r.json()['summary'], 's')
        self.assertEqual(self.post('pdf_summary', {'pdf_text': ' '}).status_code, 400)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


@override_settings(STORAGES=STATIC_OVERRIDE)
class MusicSearchTests(TestCase):
    ITUNES = {'results': [{'trackId': 1, 'trackName': 'Song', 'artistName': 'Art',
                           'artworkUrl60': 'u', 'previewUrl': 'p'}]}
    YOUTUBE = {'items': [{'id': {'videoId': 'abc'},
                          'snippet': {'title': 'Vid', 'channelTitle': 'Ch',
                                      'thumbnails': {'default': {'url': 't'}}}}]}

    def setUp(self):
        self.user = User.objects.create_user('alice', password='pw12345!')
        self.client.force_login(self.user)

    def urlopen(self, fail_youtube=False):
        def fake(url, timeout=0):
            if 'itunes' in url:
                return FakeResponse(self.ITUNES)
            if fail_youtube:
                raise OSError('quota exceeded')
            return FakeResponse(self.YOUTUBE)
        return mock.patch('urllib.request.urlopen', side_effect=fake)

    def search(self):
        return self.client.get(reverse('music_search'), {'q': 'lofi'}).json()

    def test_requires_login(self):
        self.client.logout()
        self.assertEqual(self.client.get(reverse('music_search'), {'q': 'x'}).status_code, 302)

    def test_empty_query(self):
        self.assertEqual(self.client.get(reverse('music_search')).json(), {'results': []})

    @mock.patch.dict('os.environ', {'YOUTUBE_API_KEY': ''})
    def test_without_youtube_key_only_itunes(self):
        with self.urlopen():
            data = self.search()
        self.assertEqual([r['source'] for r in data['results']], ['itunes'])
        self.assertEqual(data['errors'], [])

    @mock.patch.dict('os.environ', {'YOUTUBE_API_KEY': 'k'})
    def test_youtube_results_come_first(self):
        with self.urlopen():
            data = self.search()
        self.assertEqual([r['source'] for r in data['results']], ['youtube', 'itunes'])

    @mock.patch.dict('os.environ', {'YOUTUBE_API_KEY': 'k'})
    def test_youtube_failure_degrades_gracefully(self):
        with self.urlopen(fail_youtube=True):
            data = self.search()
        self.assertEqual([r['source'] for r in data['results']], ['itunes'])
        self.assertTrue(data['errors'][0].startswith('YouTube'))


class ProductionSettingsTests(TestCase):
    """Run manage.py in a subprocess so DJANGO_DEBUG=False takes effect."""

    def run_manage(self, *args, **env):
        base = {k: v for k, v in os.environ.items() if not k.startswith('DJANGO_')}
        return subprocess.run(
            [sys.executable, 'manage.py', *args], cwd=settings.BASE_DIR,
            capture_output=True, text=True, env={**base, **env},
        )

    def test_check_deploy_is_clean(self):
        r = self.run_manage(
            'check', '--deploy',
            DJANGO_DEBUG='False', DJANGO_SECRET_KEY=secrets.token_urlsafe(60),
            DJANGO_ALLOWED_HOSTS='example.com', DJANGO_HSTS_SECONDS='31536000',
        )
        # HSTS subdomains/preload are deliberate opt-ins that affect a whole domain.
        codes = set(re.findall(r'security\.W\d+', r.stdout + r.stderr))
        self.assertLessEqual(codes, {'security.W005', 'security.W021'}, r.stdout + r.stderr)

    def test_prod_refuses_default_secret_key(self):
        r = self.run_manage('check', DJANGO_DEBUG='False', DJANGO_ALLOWED_HOSTS='example.com')
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('DJANGO_SECRET_KEY', r.stderr)
