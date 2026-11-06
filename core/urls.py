from django.urls import path
from django.views.generic import RedirectView
from . import views

urlpatterns = [
    path('',views.home, name='home'),
    path('signup/', views.signup_view, name='signup'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    # path('focus/', views.focus, name='focus'),
    # path('studytracker/', views.studytracker, name='studytracker'),
    # path('notes/', views.notes, name='notes'),
    path('study/', views.study, name='study'),
    path('library/', views.library, name='library'),
    path('flashcards/', views.flashcards, name='flashcards'),
    path('practice/', views.practice, name='practice'),
    # the old study "modes" no longer exist; keep their addresses working
    path('daily/', RedirectView.as_view(pattern_name='library', permanent=True)),
    path('exam/', RedirectView.as_view(pattern_name='flashcards', permanent=True)),
    path('custom/', RedirectView.as_view(pattern_name='study', permanent=True)),
    path('schedule/', views.schedule, name='schedule'),
    path('forest/', views.forest, name='forest'),
    path('stats/', views.stats, name='stats'),
    path('account/', views.account, name='account'),
    path('account/export/', views.export_data, name='export_data'),
    path('account/delete/', views.delete_account, name='delete_account'),
    path('api/sessions/', views.list_sessions, name='list_sessions'),
    path('api/sessions/record/', views.record_sessions, name='record_sessions'),
    path('api/wallpapers/', views.wallpaper_list, name='wallpaper_list'),
    path('api/state/', views.get_state, name='get_state'),
    path('api/state/save/', views.save_state, name='save_state'),
    path('api/test-api/', views.test_api, name='test_api'),
    path('api/generate-flashcards/', views.generate_flashcards, name='generate_flashcards'),
    path('api/generate-questions/', views.generate_questions, name='generate_questions'),
    path('api/study-coach/', views.study_coach, name='study_coach'),
    path('api/music-search/', views.music_search, name='music_search'),
    path('api/pdf-chat/', views.pdf_chat, name='pdf_chat'),
    path('api/pdf-summary/', views.pdf_summary, name='pdf_summary'),
]
