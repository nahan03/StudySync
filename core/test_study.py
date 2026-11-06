import json

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.urls import reverse

from .models import StudySession, UserState
from .test_views import STATIC_OVERRIDE


@override_settings(STORAGES=STATIC_OVERRIDE)
class StudyPageTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('alice', password='pw12345!')

    def test_requires_login(self):
        self.assertEqual(self.client.get(reverse('study')).status_code, 302)

    def test_page_renders_setup_run_and_overlay(self):
        self.client.force_login(self.user)
        html = self.client.get(reverse('study')).content.decode()
        for marker in ('id="st-setup"', 'id="st-run"', 'id="st-done"', 'id="tree-growth-overlay"',
                       'id="st-focus-sound"', 'id="st-preset-save"', 'js/study.js', 'css/tree_overlay.css'):
            self.assertIn(marker, html, marker)

    def test_home_has_single_study_entry_and_no_mode_cards(self):
        self.client.force_login(self.user)
        html = self.client.get(reverse('home')).content.decode()
        self.assertIn('href="/study/"', html)
        self.assertNotIn('class="mode-card"', html)
        self.assertNotIn('id="planForm"', html)

    def test_study_sessions_are_recorded_with_their_mode(self):
        self.client.force_login(self.user)
        r = self.client.post(
            reverse('record_sessions'),
            json.dumps({'date': '2026-11-06', 'subject': 'Biology', 'hours': 0.42, 'mode': 'study'}),
            content_type='application/json',
        )
        self.assertEqual(r.json(), {'saved': 1})
        self.assertEqual(StudySession.objects.get().mode, 'study')

    def test_timer_settings_and_presets_sync_but_the_running_timer_does_not(self):
        self.client.force_login(self.user)
        r = self.client.post(reverse('save_state'), json.dumps({'changes': {
            'studySyncStudyPrefs': '{"focus":30}',
            'studySyncTimerPresets': '[{"id":"u1","name":"Mine"}]',
            'studySyncStudyRun': '{"running":true}',   # per-device state must be refused
        }}), content_type='application/json')
        self.assertEqual(r.json(), {'saved': 2})
        self.assertEqual(set(UserState.objects.values_list('key', flat=True)),
                         {'studySyncStudyPrefs', 'studySyncTimerPresets'})
