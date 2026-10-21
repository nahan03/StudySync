// alerts.js
// alert.js

function showGlobalAlert(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('global-toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.className = `toast`;
    }, duration);
}
