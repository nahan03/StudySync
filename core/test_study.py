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

    def test_page_has_appearance_controls(self):
        self.client.force_login(self.user)
        html = self.client.get(reverse('study')).content.decode()
        for marker in ('id="st-root"', 'data-theme=', 'id="st-appearance"', 'id="st-themes"', 'id="st-bgs"', 'id="st-bgfile"',
                       'id="bg-canvas"', 'js/live_bg.js'):
            self.assertIn(marker, html, marker)

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
            'studySyncStudyBgImage': '"data:image/jpeg;base64,AAAA"',
            'studySyncStudyRun': '{"running":true}',   # per-device state must be refused
        }}), content_type='application/json')
        self.assertEqual(r.json(), {'saved': 3})
        self.assertEqual(set(UserState.objects.values_list('key', flat=True)),
                         {'studySyncStudyPrefs', 'studySyncTimerPresets', 'studySyncStudyBgImage'})

    def test_every_live_wallpaper_is_defined_and_selectable(self):
        """Each id offered in the picker must exist in the engine, and vice versa."""
        import re
        from django.conf import settings
        root = settings.BASE_DIR / 'core' / 'static' / 'js'
        engine = (root / 'live_bg.js').read_text(encoding='utf-8')
        study = (root / 'study.js').read_text(encoding='utf-8')
        scenes = set(re.findall(r'^  scenes\.(\w+) = \{', engine, re.M))
        offered = set(re.search(r"const SCENES = \[(.*?)\];", study).group(1).replace("'", '').replace(' ', '').split(','))
        self.assertEqual(scenes, offered)
        self.assertEqual(len(scenes), 8)


@override_settings(STORAGES=STATIC_OVERRIDE)
class FootageTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('alice', password='pw12345!')

    def test_requires_login(self):
        self.assertEqual(self.client.get(reverse('wallpaper_list')).status_code, 302)

    def test_lists_only_playable_clips_with_optional_posters(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / 'core' / 'static' / 'wallpapers'
            folder.mkdir(parents=True)
            for name in ('rain-window.mp4', 'rain-window.jpg', 'deep_forest.webm', 'notes.txt', 'clip.mov', 'README.md'):
                (folder / name).write_bytes(b'x')
            with override_settings(BASE_DIR=Path(tmp)):
                self.client.force_login(self.user)
                items = self.client.get(reverse('wallpaper_list')).json()['wallpapers']
        self.assertEqual([i['name'] for i in items], ['Deep Forest', 'Rain Window'])
        by_id = {i['id']: i for i in items}
        self.assertTrue(by_id['rain-window']['url'].endswith('wallpapers/rain-window.mp4'))
        self.assertTrue(by_id['rain-window']['poster'].endswith('wallpapers/rain-window.jpg'))
        self.assertEqual(by_id['deep_forest']['poster'], '')

    def test_missing_folder_is_an_empty_list(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as tmp, override_settings(BASE_DIR=Path(tmp)):
            self.client.force_login(self.user)
            self.assertEqual(self.client.get(reverse('wallpaper_list')).json(), {'wallpapers': []})

    def test_study_page_has_footage_controls(self):
        self.client.force_login(self.user)
        html = self.client.get(reverse('study')).content.decode()
        for marker in ('id="bg-video"', 'id="st-footage"', 'id="st-videofile"', 'data-wallpapers='):
            self.assertIn(marker, html, marker)
