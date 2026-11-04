import json

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.urls import reverse

from .models import StudySession


@override_settings(STORAGES={
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
})
class SessionApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('alice', password='pw12345!')
        self.other = User.objects.create_user('bob', password='pw12345!')

    def post(self, payload):
        return self.client.post(
            reverse('record_sessions'), json.dumps(payload), content_type='application/json'
        )

    def test_requires_login(self):
        self.assertEqual(self.post({'date': '2026-01-01'}).status_code, 302)
        self.assertEqual(StudySession.objects.count(), 0)

    def test_record_single(self):
        self.client.force_login(self.user)
        r = self.post({'date': '2026-01-01', 'subject': 'Math', 'hours': 0.5, 'mode': 'exam'})
        self.assertEqual(r.json(), {'saved': 1})
        s = StudySession.objects.get()
        self.assertEqual((s.user, s.subject, s.mode), (self.user, 'Math', 'exam'))

    def test_record_batch_skips_invalid(self):
        self.client.force_login(self.user)
        r = self.post({'sessions': [
            {'date': '2026-01-01', 'hours': 1},
            {'date': 'nope', 'hours': 1},
            {'date': '2026-01-02', 'hours': 99},
            'junk',
        ]})
        self.assertEqual(r.json(), {'saved': 1})

    def test_unknown_mode_defaults_to_daily(self):
        self.client.force_login(self.user)
        self.post({'date': '2026-01-01', 'hours': 1, 'mode': 'weird'})
        self.assertEqual(StudySession.objects.get().mode, 'daily')

    def test_bad_json(self):
        self.client.force_login(self.user)
        r = self.client.post(reverse('record_sessions'), 'x', content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_list_is_per_user(self):
        StudySession.objects.create(user=self.other, date='2026-01-01', hours=1)
        StudySession.objects.create(user=self.user, date='2026-01-02', hours=2)
        self.client.force_login(self.user)
        sessions = self.client.get(reverse('list_sessions')).json()['sessions']
        self.assertEqual([s['hours'] for s in sessions], [2])

    def test_home_embeds_server_history(self):
        StudySession.objects.create(user=self.user, date='2026-01-02', hours=2)
        self.client.force_login(self.user)
        html = self.client.get(reverse('home')).content.decode()
        self.assertIn('id="server-session-history"', html)
