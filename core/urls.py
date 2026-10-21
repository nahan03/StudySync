from django.urls import path
from . import views

urlpatterns = [
    path('',views.home, name='home'),
    path('signup/', views.signup_view, name='signup'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    # path('focus/', views.focus, name='focus'),
    # path('studytracker/', views.studytracker, name='studytracker'),
    # path('notes/', views.notes, name='notes'),
    path('daily/', views.daily_mode, name='daily_mode'),
    path('exam/', views.exam_mode, name='exam_mode'),
    path('custom/', views.custom_mode, name='custom_mode'),
    path('schedule/', views.schedule, name='schedule'),
    path('forest/', views.forest, name='forest'),
    path('stats/', views.stats, name='stats'),
    path('api/test-api/', views.test_api, name='test_api'),
    path('api/generate-flashcards/', views.generate_flashcards, name='generate_flashcards'),
    path('api/generate-questions/', views.generate_questions, name='generate_questions'),
    path('api/study-coach/', views.study_coach, name='study_coach'),
    path('api/music-search/', views.music_search, name='music_search'),
    path('api/pdf-chat/', views.pdf_chat, name='pdf_chat'),
    path('api/pdf-summary/', views.pdf_summary, name='pdf_summary'),
]
