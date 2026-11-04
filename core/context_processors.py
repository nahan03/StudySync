def session_history(request):
    """Expose the user's saved sessions to templates (used by static/js/sync.js)."""
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return {}
    from .models import StudySession
    return {
        'sync_payload': {
            'user': user.get_username(),
            'sessions': [s.as_dict() for s in StudySession.objects.filter(user=user)],
        }
    }
