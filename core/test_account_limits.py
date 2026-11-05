import json
from unittest import mock

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse

from .models import StudySession, UserState
from .test_views import STATIC_OVERRIDE, fake_groq


@override_settings(STORAGES=STATIC_OVERRIDE)
class RateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.a = User.objects.create_user('alice', password='pw12345!')
        self.b = User.objects.create_user('bob', password='pw12345!')

    def tearDown(self):
        cache.clear()

    def ask(self, user):
        self.client.force_login(user)
        return self.client.post(
            reverse('study_coach'), json.dumps({'message': 'hi'}), content_type='application/json'
        )

    @mock.patch.dict('os.environ', {'AI_RATE_LIMIT': '2', 'AI_RATE_WINDOW': '60'})
    @mock.patch('core.views._groq_client')
    def test_limit_applies_per_user(self, client):
        client.return_value = fake_groq('ok')
        self.assertEqual(self.ask(self.a).status_code, 200)
        self.assertEqual(self.ask(self.a).status_code, 200)
        blocked = self.ask(self.a)
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked['Retry-After'], '60')
        self.assertEqual(client.return_value.chat.completions.create.call_count, 2)
        self.assertEqual(self.ask(self.b).status_code, 200)  # other users unaffected

    @mock.patch.dict('os.environ', {'AI_RATE_LIMIT': '1'})
    def test_get_requests_are_not_counted(self):
        self.client.force_login(self.a)
        for _ in range(3):
            self.assertEqual(self.client.get(reverse('study_coach')).status_code, 405)


@override_settings(STORAGES=STATIC_OVERRIDE)
class AccountTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('alice', password='Old-pass-93kx')
        self.client.force_login(self.user)

    def test_pages_require_login(self):
        self.client.logout()
        for name in ('account', 'export_data'):
            self.assertEqual(self.client.get(reverse(name)).status_code, 302, name)
        self.assertEqual(self.client.post(reverse('delete_account'), {'password': 'x'}).status_code, 302)

    def test_account_page_renders(self):
        self.assertContains(self.client.get(reverse('account')), 'Change password')

    def test_change_password_keeps_user_logged_in(self):
        r = self.client.post(reverse('account'), {
            'action': 'password', 'old_password': 'Old-pass-93kx',
            'new_password1': 'New-pass-77qz', 'new_password2': 'New-pass-77qz',
        })
        self.assertRedirects(r, reverse('account'))
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('New-pass-77qz'))
        self.assertEqual(self.client.get(reverse('account')).status_code, 200)

    def test_change_password_rejects_wrong_old_or_weak_new(self):
        self.client.post(reverse('account'), {
            'action': 'password', 'old_password': 'nope',
            'new_password1': 'New-pass-77qz', 'new_password2': 'New-pass-77qz'})
        self.client.post(reverse('account'), {
            'action': 'password', 'old_password': 'Old-pass-93kx',
            'new_password1': 'password', 'new_password2': 'password'})
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Old-pass-93kx'))

    def test_export_contains_only_own_data(self):
        other = User.objects.create_user('bob', password='pw12345!')
        StudySession.objects.create(user=self.user, date='2026-01-01', subject='Math', hours=1)
        StudySession.objects.create(user=other, date='2026-01-02', subject='Secret', hours=1)
        UserState.objects.create(user=self.user, key='studySyncPlanner', value='MINE')
        UserState.objects.create(user=other, key='studySyncPlanner', value='THEIRS')
        r = self.client.get(reverse('export_data'))
        self.assertIn('attachment', r['Content-Disposition'])
        body = r.content.decode()
        data = json.loads(body)
        self.assertEqual(data['username'], 'alice')
        self.assertEqual([s['subject'] for s in data['sessions']], ['Math'])
        self.assertEqual(data['state'], {'studySyncPlanner': 'MINE'})
        self.assertNotIn('THEIRS', body)

    def test_delete_requires_correct_password(self):
        self.client.post(reverse('delete_account'), {'password': 'wrong'})
        self.assertTrue(User.objects.filter(username='alice').exists())

    def test_delete_removes_account_and_data(self):
        StudySession.objects.create(user=self.user, date='2026-01-01', hours=1)
        UserState.objects.create(user=self.user, key='studySyncPlanner', value='x')
        r = self.client.post(reverse('delete_account'), {'password': 'Old-pass-93kx'})
        self.assertRedirects(r, reverse('login'))
        self.assertFalse(User.objects.filter(username='alice').exists())
        self.assertEqual(StudySession.objects.count(), 0)
        self.assertEqual(UserState.objects.count(), 0)
        self.assertEqual(self.client.get(reverse('home')).status_code, 302)  # logged out

    def test_delete_is_post_only(self):
        self.assertEqual(self.client.get(reverse('delete_account')).status_code, 405)
