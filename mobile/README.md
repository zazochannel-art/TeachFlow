# TeachFlow Mobile (Expo / React Native)

Aplicația nativă pentru Android și iOS. Folosește **același proiect Supabase** ca aplicația web
(`../`), deci conturile și datele sunt comune: o lecție adăugată pe telefon apare imediat pe web și invers.
Aplicația se reîncarcă singură când revii în ea, la fiecare 30 de secunde cât e deschisă și la „trage în jos”.

## Ce conține

**Profesor:** panou (statistici, lecțiile de azi), calendar pe săptămână, lecții (creare, repetare săptămânală,
editare, marcare efectuată/anulată/absent, link online), elevi (adăugare, editare, contact), mesaje cu elevii,
teme (atribuire, verificare, notă, feedback), plăți (adăugare, marcare achitat), cursuri (vizualizare).

**Elev** (contul creat prin invitația profesorului): lecții, teme (predare răspuns), mesaje cu profesorul, plăți.

Rămân pe web: setări profil, abonament, invitarea elevilor, crearea cursurilor, tabla interactivă.
Aplicația are scurtături către ele.

## Rulare pe telefon în 2 minute (Expo Go)

1. Instalează **Expo Go** din Google Play / App Store.
2. Pe calculator:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
   (pe Windows: `npm.cmd install` și `npx.cmd expo start`)
3. Scanează codul QR din terminal cu Expo Go (Android) sau cu camera (iPhone). Telefonul și calculatorul
   trebuie să fie în aceeași rețea Wi‑Fi; altfel folosește `npx expo start --tunnel`.

## Fișier APK pentru Android (fără magazin)

Necesită un cont gratuit pe https://expo.dev.
```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```
La final primești un link de unde descarci `.apk`-ul și îl instalezi pe orice telefon Android.

## Publicare în magazine

- **Google Play:** cont Google Play Console (25 USD o singură dată).
  `npx eas-cli@latest build -p android --profile production`, apoi `npx eas-cli@latest submit -p android`.
- **App Store:** cont Apple Developer (99 USD/an).
  `npx eas-cli@latest build -p ios --profile production`, apoi `npx eas-cli@latest submit -p ios`.
  Nu ai nevoie de Mac: EAS construiește aplicația în cloud.

Identificatorul aplicației este `md.teachflow.app` (în `app.json`); schimbă-l înainte de prima publicare dacă vrei altul.

## Configurare

Adresa Supabase și cheia publică sunt în `src/lib/config.ts` (cheia publishable e făcută să fie publică;
datele sunt protejate de Row Level Security). Pot fi înlocuite cu variabile în `mobile/.env.local`:
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
EXPO_PUBLIC_WEB_URL=https://teach-flow-nine.vercel.app
```

## Comenzi

```bash
npx tsc --noEmit   # verificare tipuri
npx expo lint      # lint
npx expo start     # server de dezvoltare
```

`src/lib/time.ts` și `src/lib/types.ts` sunt copiate din aplicația web; țineți-le sincronizate.
