importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
firebase.initializeApp({apiKey:"AIzaSyB8hBE2gn4CTTnOCQt2aAIvGZ435V7SYso",authDomain:"muffin-night.firebaseapp.com",projectId:"muffin-night",storageBucket:"muffin-night.firebasestorage.app",messagingSenderId:"560670888509",appId:"1:560670888509:web:d251c6bd1d501cb31d5054"});
const messaging=firebase.messaging();
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(L=>{for(const c of L){if('focus' in c)return c.focus()}return clients.openWindow('./')}))});
