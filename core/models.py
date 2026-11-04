from django.conf import settings
from django.db import models


class StudySession(models.Model):
    """One completed focus session. Drives stats, streaks and the forest."""

    MODE_CHOICES = [
        ('daily', 'Daily'),
        ('exam', 'Exam'),
        ('custom', 'Custom'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='study_sessions'
    )
    date = models.DateField()
    subject = models.CharField(max_length=120, default='Study')
    hours = models.FloatField(default=0)
    mode = models.CharField(max_length=10, choices=MODE_CHOICES, default='daily')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date', 'id']
        indexes = [models.Index(fields=['user', 'date'])]

    def __str__(self):
        return f'{self.user} {self.date} {self.subject} ({self.hours:.2f}h, {self.mode})'

    def as_dict(self):
        return {
            'date': self.date.isoformat(),
            'subject': self.subject,
            'hours': self.hours,
            'mode': self.mode,
        }
