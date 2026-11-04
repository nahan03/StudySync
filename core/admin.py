from django.contrib import admin

from .models import StudySession


@admin.register(StudySession)
class StudySessionAdmin(admin.ModelAdmin):
    list_display = ('user', 'date', 'subject', 'hours', 'mode')
    list_filter = ('mode', 'date')
    search_fields = ('user__username', 'subject')
