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


@override_settings(STORAGES=STATIC_OVERRIDE)
class TimerCycleTests(TestCase):
    """A tree grows over one run of the timer the user chose, not a fixed number of sessions."""

    def setUp(self):
        self.user = User.objects.create_user('alice', password='pw12345!')
        self.client.force_login(self.user)

    def record(self, payload):
        return self.client.post(reverse('record_sessions'), json.dumps(payload), content_type='application/json')

    def test_rounds_of_a_run_are_stored_and_returned(self):
        self.record({'sessions': [
            {'date': '2026-11-06', 'hours': 0.4, 'mode': 'study', 'run': 'rabc', 'round': 1, 'rounds': 3},
            {'date': '2026-11-06', 'hours': 0.4, 'mode': 'study', 'run': 'rabc', 'round': 2, 'rounds': 3},
        ]})
        sessions = self.client.get(reverse('list_sessions')).json()['sessions']
        self.assertEqual([(s['run'], s['round'], s['rounds']) for s in sessions], [('rabc', 1, 3), ('rabc', 2, 3)])

    def test_round_numbers_are_clamped_and_old_entries_have_no_run(self):
        self.record({'date': '2026-11-06', 'hours': 1, 'mode': 'study', 'run': 'r1', 'round': 50, 'rounds': 4})
        self.record({'date': '2026-11-06', 'hours': 1, 'mode': 'daily'})
        a, b = StudySession.objects.order_by('id')
        self.assertEqual((a.round, a.rounds), (4, 4))
        self.assertEqual(b.run, '')
        self.assertNotIn('run', b.as_dict())

    def test_garbage_cycle_values_do_not_break_saving(self):
        r = self.record({'date': '2026-11-06', 'hours': 1, 'run': 'r2', 'round': 'x', 'rounds': None})
        self.assertEqual(r.json(), {'saved': 1})
        self.assertEqual((StudySession.objects.get().round, StudySession.objects.get().rounds), (1, 1))

    def test_study_page_uses_the_tree_canvas_and_has_fullscreen(self):
        html = self.client.get(reverse('study')).content.decode()
        for marker in ('id="tg-canvas"', 'id="tg-pips"', 'id="st-fullscreen"'):
            self.assertIn(marker, html, marker)
        self.assertNotIn('tg-tree-svg', html)
        self.assertIn('js/tree_grow.js', html)

    def test_cycle_length_is_not_hardcoded_to_five(self):
        from django.conf import settings
        js = (settings.BASE_DIR / 'core' / 'static' / 'js' / 'study.js').read_text(encoding='utf-8')
        self.assertIn('run.cfg.rounds', js)
        import re
        self.assertIsNone(re.search(r'[\w)\]]\s*%\s*5(?!\d)(?!%)', re.sub(r"'[^']*'", "''", js)))


@override_settings(STORAGES=STATIC_OVERRIDE)
class SoundMixerTests(TestCase):
    """The global music bar is a built-in sound mixer: no embeds, every sound is defined in the script."""

    def setUp(self):
        from django.contrib.auth.models import User
        self.client.force_login(User.objects.create_user('mixer', password='x'))

    def test_study_page_has_the_mixer_controls_and_no_embeds(self):
        html = self.client.get(reverse('study')).content.decode()
        for marker in ('id="gmp-play"', 'id="gmp-grid"', 'id="gmp-presets"', 'id="gmp-sleep"', 'id="gmp-save"', 'id="gmp-master"'):
            self.assertIn(marker, html)
        for gone in ('gmp-embed-wrap', 'gmp-url-input', 'open.spotify.com'):
            self.assertNotIn(gone, html)

    def test_every_sound_and_preset_is_defined_in_the_script(self):
        import re
        from pathlib import Path
        js = (Path(__file__).parent / 'static' / 'js' / 'music_player.js').read_text(encoding='utf-8')
        ids = re.findall(r"\{ id: '(\w+)', name: '[^']+', icon:", js)
        self.assertEqual(len(ids), 13)
        for preset in re.findall(r"vols: \{([^}]*)\}", js):
            for sound in re.findall(r"(\w+):", preset):
                self.assertIn(sound, ids)

    def test_saved_mixes_sync_to_the_account(self):
        from .models import UserState
        self.assertIn('studySyncMixer', UserState.SYNCED_KEYS)


@override_settings(STORAGES=STATIC_OVERRIDE)
class ToolPageTests(TestCase):
    """Library, coach and flashcards are standalone tools; the old study modes are gone."""

    def setUp(self):
        self.client.force_login(User.objects.create_user('tools', password='x'))

    def test_library_and_flashcards_render_without_any_timer(self):
        for name, marker in (('library', 'id="coach-toggle"'), ('flashcards', 'id="fc-deck"'), ('practice', 'id="generate-questions-btn"')):
            html = self.client.get(reverse(name)).content.decode()
            self.assertIn(marker, html)
            for gone in ('timer-start-btn', 'focus-start', 'id="cp-overlay"', 'Daily Mode', 'Exam Mode', 'Custom Mode'):
                self.assertNotIn(gone, html, f'{name}: {gone}')

    def test_old_mode_addresses_redirect(self):
        for old, new in (('/daily/', '/library/'), ('/exam/', '/flashcards/'), ('/custom/', '/study/')):
            r = self.client.get(old)
            self.assertEqual((r.status_code, r['Location']), (301, new))

    def test_study_page_offers_ring_and_font_choices(self):
        html = self.client.get(reverse('study')).content.decode()
        for marker in ('id="st-rings"', 'id="st-fonts"', 'id="st-tsize"', 'id="st-minbar"', 'id="st-knob"'):
            self.assertIn(marker, html)

    def test_flashcards_page_has_no_countdown_or_practice_questions(self):
        html = self.client.get(reverse('flashcards')).content.decode()
        for gone in ('id="ec-set-btn"', 'EXAM COUNTDOWN', 'id="generate-questions-btn"', 'id="practice-questions-list"'):
            self.assertNotIn(gone, html)

    def test_home_lists_the_tools_without_a_second_schedule_link(self):
        html = self.client.get(reverse('home')).content.decode()
        self.assertIn('href="/practice/"', html)
        self.assertNotIn('class="tool-card" href="/schedule/"', html)

    def test_shared_answer_judge_is_defined_outside_the_flashcards_block(self):
        """The practice page runs the same script without the flashcard deck, so judgeAnswer must not live inside the deck-only block."""
        from pathlib import Path
        js = (Path(__file__).parent / 'static' / 'js' / 'exam_features.js').read_text(encoding='utf-8')
        self.assertLess(js.index('function judgeAnswer'), js.index("if ($('fc-deck')) {"))

    def test_revealed_answers_hide_themselves_after_a_minute_by_default(self):
        from pathlib import Path
        js = (Path(__file__).parent / 'static' / 'js' / 'exam_features.js').read_text(encoding='utf-8')
        self.assertIn('window.PRACTICE_REVEAL_SECONDS) || 60', js)
        self.assertIn('function startMemorise', js)
