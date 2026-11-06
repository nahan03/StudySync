from django.conf import settings
from django.db import models


class StudySession(models.Model):
    """One completed focus session. Drives stats, streaks and the forest."""

    MODE_CHOICES = [
        ('daily', 'Daily'),
        ('exam', 'Exam'),
        ('custom', 'Custom'),
        ('study', 'Study'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='study_sessions'
    )
    date = models.DateField()
    subject = models.CharField(max_length=120, default='Study')
    hours = models.FloatField(default=0)
    mode = models.CharField(max_length=10, choices=MODE_CHOICES, default='daily')
    # A tree grows over one run of the user's timer: `rounds` focus rounds planned,
    # this entry is round number `round` of run `run`. Older entries have run == ''.
    run = models.CharField(max_length=40, blank=True, default='')
    round = models.PositiveSmallIntegerField(default=0)
    rounds = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date', 'id']
        indexes = [models.Index(fields=['user', 'date'])]

    def __str__(self):
        return f'{self.user} {self.date} {self.subject} ({self.hours:.2f}h, {self.mode})'

    def as_dict(self):
        d = {
            'date': self.date.isoformat(),
            'subject': self.subject,
            'hours': self.hours,
            'mode': self.mode,
        }
        if self.run:
            d.update({'run': self.run, 'round': self.round, 'rounds': self.rounds})
        return d


class UserState(models.Model):
    """Per-user copy of a browser-side data blob (schedule, flashcards, streak, ...).

    `value` holds the exact string the front-end keeps in localStorage.
    Only keys in SYNCED_KEYS are accepted; transient per-device state
    (running timers, music player) is deliberately excluded.
    """

    SYNCED_KEYS = frozenset({
        'studySyncPlanner',          # weekly schedule
        'studySyncFlashcards',       # flashcards
        'studySyncDecks',            # saved flashcard decks
        'studySyncFcStats',          # flashcard study stats
        'studySyncStreak',           # study streak
        'studySyncProfile',          # onboarding profile
        'studySyncGoals',
        'studySyncSubjectSessions',
        'studySyncDailyRefs',
        'studySyncCustomNotes',
        'studySyncStudyPrefs',       # Study page: timer, break and alarm settings
        'studySyncTimerPresets',     # Study page: user-made timer presets
        'studySyncMixer',            # sound mixer: volumes and saved mixes
        'studySyncStudyBgImage',     # Study page: user's custom background picture (data URL)
        'studySyncTree_daily',       # forest / tree progress
        'studySyncTree_custom',
        'studySyncTree_exam',
    })
    MAX_VALUE_CHARS = 1_000_000

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='states'
    )
    key = models.CharField(max_length=64)
    value = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'key'], name='uniq_user_state_key')]

    def __str__(self):
        return f'{self.user}:{self.key}'
