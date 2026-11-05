import json

from django.contrib.auth.models import User
from django.test import Client, TestCase, override_settings
from django.urls import reverse

from .models import UserState
from .test_views import STATIC_OVERRIDE


@override_settings(STORAGES=STATIC_OVERRIDE)
class StateApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('alice', password='pw12345!')
        self.other = User.objects.create_user('bob', password='pw12345!')
        self.client.force_login(self.user)

    def save(self, changes):
        return self.client.post(
            reverse('save_state'), json.dumps({'changes': changes}), content_type='application/json'
        )

    def test_requires_login(self):
        self.client.logout()
        self.assertEqual(self.save({'studySyncPlanner': '{}'}).status_code, 302)
        self.assertEqual(self.client.get(reverse('get_state')).status_code, 302)

    def test_save_and_get_roundtrip(self):
        self.assertEqual(self.save({'studySyncPlanner': '{"Mon":[]}'}).json(), {'saved': 1})
        self.assertEqual(self.client.get(reverse('get_state')).json()['state'],
                         {'studySyncPlanner': '{"Mon":[]}'})

    def test_update_overwrites_and_null_deletes(self):
        self.save({'studySyncStreak': '{"count":1}'})
        self.save({'studySyncStreak': '{"count":2}'})
        self.assertEqual(UserState.objects.get().value, '{"count":2}')
        self.save({'studySyncStreak': None})
        self.assertEqual(UserState.objects.count(), 0)

    def test_unknown_transient_and_oversized_values_are_ignored(self):
        r = self.save({
            'evil': 'x',
            'studySyncTimerState': '{}',          # per-device, must not sync
            'studySyncMusicUrl': 'x',
            'studySyncFlashcards': 'x' * (UserState.MAX_VALUE_CHARS + 1),
            'studySyncDecks': 123,                # not a string
        })
        self.assertEqual(r.json(), {'saved': 0})
        self.assertEqual(UserState.objects.count(), 0)

    def test_bad_payloads(self):
        for body in ('nope', '{"changes": []}', '[]'):
            r = self.client.post(reverse('save_state'), body, content_type='application/json')
            self.assertEqual(r.status_code, 400, body)

    def test_state_is_per_user_and_embedded_in_pages(self):
        UserState.objects.create(user=self.other, key='studySyncPlanner', value='BOBS')
        UserState.objects.create(user=self.user, key='studySyncPlanner', value='ALICES')
        self.assertEqual(self.client.get(reverse('get_state')).json()['state'],
                         {'studySyncPlanner': 'ALICES'})
        html = self.client.get(reverse('home')).content.decode()
        self.assertIn('ALICES', html)
        self.assertNotIn('BOBS', html)
        self.assertIn('name="csrf-token"', html)


@override_settings(STORAGES=STATIC_OVERRIDE)
class AuthTests(TestCase):
    def signup(self, **kw):
        data = {'username': 'carol', 'password': 'Str0ng-pass-93', 'password2': 'Str0ng-pass-93'}
        data.update(kw)
        return self.client.post(reverse('signup'), data)

    def test_signup_ok(self):
        r = self.signup()
        self.assertRedirects(r, reverse('login'))
        self.assertTrue(User.objects.filter(username='carol').exists())

    def test_signup_rejections(self):
        for kw in ({'username': '  '}, {'password2': 'different'},
                   {'password': 'short1', 'password2': 'short1'},
                   {'password': 'password', 'password2': 'password'},
                   {'password': '12345678', 'password2': '12345678'}):
            self.signup(**kw)
        self.assertEqual(User.objects.count(), 0)

    def test_signup_duplicate_username_is_case_insensitive(self):
        self.signup()
        self.signup(username='CAROL')
        self.assertEqual(User.objects.count(), 1)

    def test_signup_error_is_shown(self):
        r = self.client.post(reverse('signup'), {'username': 'x', 'password': 'a', 'password2': 'b'}, follow=True)
        self.assertContains(r, 'Passwords do not match')

    def test_login_next_redirect(self):
        User.objects.create_user('dave', password='pw12345!')
        url = reverse('login')
        data = {'username': 'dave', 'password': 'pw12345!'}
        self.assertRedirects(self.client.post(url + '?next=/schedule/', data),
                             '/schedule/', fetch_redirect_response=False)
        self.client.logout()
        for evil in ('https://evil.example/', '//evil.example', 'javascript:alert(1)'):
            r = self.client.post(url + '?next=' + evil, data)
            self.assertRedirects(r, reverse('home'), fetch_redirect_response=False)
            self.client.logout()

    def test_login_failure_keeps_next(self):
        r = self.client.post(reverse('login') + '?next=/schedule/', {'username': 'x', 'password': 'y'})
        self.assertEqual(r.status_code, 302)
        self.assertIn('next=/schedule/', r['Location'])

    def test_mode_pages_require_login(self):
        for name in ('daily_mode', 'exam_mode', 'custom_mode', 'schedule', 'forest', 'stats'):
            self.assertEqual(self.client.get(reverse(name)).status_code, 302, name)


@override_settings(STORAGES=STATIC_OVERRIDE)
class CsrfTests(TestCase):
    def test_ai_endpoints_enforce_csrf(self):
        User.objects.create_user('erin', password='pw12345!')
        c = Client(enforce_csrf_checks=True)
        c.login(username='erin', password='pw12345!')
        for name in ('generate_flashcards', 'generate_questions', 'study_coach', 'pdf_chat', 'pdf_summary'):
            r = c.post(reverse(name), '{}', content_type='application/json')
            self.assertEqual(r.status_code, 403, name)
