# TeachFlow pentru Android (Expo)

Aplicația Android afișează **site-ul TeachFlow** (https://teach-flow-nine.vercel.app) pe tot ecranul și adaugă
ce un browser nu poate face. Contul, datele și toate funcțiile sunt aceleași ca pe web: profesor, elev, părinte,
lecții, apeluri video, tabla, teste, bibliotecă, facturi. Orice schimbare publicată pe web apare imediat și în
aplicație, fără un APK nou.

Ce adaugă aplicația:

- **Notificări push pe telefon** (lecții, teme, teste, mesaje), chiar și cu aplicația închisă. Atingi
  notificarea și se deschide pagina potrivită.
- **Camera și microfonul** pentru apeluri: Android cere permisiunea prima dată.
- **Ecranul rămâne aprins în timpul apelului** (din versiunea 2.1.0), ca să nu se oprească camera când elevul doar urmărește lecția.
- **Fișiere**: încărcare din galerie sau cameră, descărcări (CSV, facturi) în „Descărcări”, iar tabla salvată
  ca imagine se trimite prin meniul de partajare.
- **Butonul „Înapoi”** de pe Android merge înapoi prin pagini.
- **Linkurile externe** (WhatsApp, telefon, e-mail, alte site-uri) se deschid în aplicația potrivită.
- **Ecran „Nu există conexiune”** cu butonul „Încearcă din nou”.
- **Tema întunecată**: bara de sus urmează tema aleasă în TeachFlow.
- Rămâi conectat între deschideri.

Limitare: **partajarea ecranului** nu e posibilă pe Android (nici în Chrome pe telefon). Profesorul o face de pe
calculator.

## 1. APK de test fără niciun cont (GitHub Actions)

La fiecare schimbare din `mobile/`, GitHub construiește singur un APK.

1. Deschide pe GitHub **Actions → Android APK** și alege ultima rulare verde (sau apasă „Run workflow”).
2. Jos, la **Artifacts**, descarcă `teachflow-android-apk` (un .zip cu fișierul `.apk`).
3. Trimite `.apk`-ul pe telefon, deschide-l și permite „Instalare din surse necunoscute”.

APK-ul e semnat cu cheia standard de test. E bun pentru telefoane, nu pentru Google Play.

## 2. Notificări push (o singură dată)

Fără acești pași aplicația merge complet, doar notificările push sunt oprite. Pe web notificările merg ca înainte.

1. **SQL**: rulează `supabase/migrations/0022_native_push_tokens.sql` în Supabase → SQL Editor.
2. **Cont Expo** (gratuit) pe https://expo.dev, apoi în `mobile/`:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init      # scrie extra.eas.projectId în app.json — fă commit
   ```
3. **Firebase** (gratuit) pe https://console.firebase.google.com: creează un proiect, adaugă o aplicație Android cu
   pachetul `md.teachflow.app` și descarcă `google-services.json`.
   - pentru EAS: `npx eas-cli@latest env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret`
   - pentru APK-ul din GitHub: pune conținutul fișierului în base64 ca secret `GOOGLE_SERVICES_JSON_B64`
     (Settings → Secrets and variables → Actions) și ID-ul proiectului Expo ca variabilă `EAS_PROJECT_ID`.
4. **Cheia FCM pentru Expo**: în Firebase → Project settings → Service accounts → „Generate new private key”, apoi
   `npx eas-cli@latest credentials` → Android → „Google Service Account Key for Push Notifications (FCM V1)” și
   încarci fișierul JSON.
5. Serverul (Vercel) are nevoie doar de `SUPABASE_SECRET_KEY`, pe care îl are deja. Opțional, `EXPO_ACCESS_TOKEN`
   dacă activezi „Enhanced push security” în Expo.

Apoi construiești un APK nou, intri în cont și aplicația cere permisiunea pentru notificări. În Setări → Notificări
apare „Notificările sunt active în aplicația TeachFlow” și butonul de test.

## 3. Google Play

1. Cont Google Play Console: **25 $, o singură dată**, la https://play.google.com/console.
2. Construiești pachetul pentru magazin cu EAS:
   ```bash
   cd mobile
   npx eas-cli@latest build -p android --profile production   # fișier .aab, cheia de semnare o păstrează Expo
   npx eas-cli@latest submit -p android                       # sau îl încarci manual în Play Console
   ```
3. În Play Console completezi fișa aplicației (descriere, capturi de ecran, pictogramă 512×512), politica de
   confidențialitate (https://teach-flow-nine.vercel.app/privacy), formularul „Data safety” și ratingul de conținut.
   Conturile personale noi trebuie să facă întâi un test închis cu cel puțin 12 testeri timp de 14 zile.

## Dezvoltare

```bash
cd mobile
npm install
npx expo start                 # merge și în Expo Go, dar fără notificări push
npm run typecheck && npm run lint
```

- Alt site (de ex. un preview Vercel): `EXPO_PUBLIC_WEB_URL=https://... npx expo start`.
- Codul: `src/app/index.tsx` (ecranul cu WebView), `src/lib/bridge.ts` (legătura cu site-ul), `src/lib/push.ts`
  (permisiune și token). Pe web: `src/lib/native.ts`, `src/components/NativeBridge.tsx`,
  `src/components/PushToggle.tsx`, `src/lib/push/server.ts` (trimite prin Expo).
- Legătura site ↔ aplicație: aplicația pune `window.TeachFlowNative` (platformă, versiune, starea push) și cookie-ul
  `tf-native-push`; site-ul trimite mesaje `ready`, `push:enable`, `theme`, `file:save`, `open`, `keep-awake`.
- La ieșirea din cont, serverul șterge tokenul telefonului (după cookie), ca să nu mai primească notificările contului.
