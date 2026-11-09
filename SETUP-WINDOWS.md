# Instalare pe Windows

Deschide PowerShell în folderul TeachFlow:

```powershell
node -v
npm -v
npm install
Copy-Item .env.example .env.local
npm run dev
```

Deschide `http://localhost:3000`.

Pentru verificare:
```powershell
npm run typecheck
npm run lint
npm run build
```

Dacă `npm` este blocat de politica PowerShell, folosește `npm.cmd` în loc de `npm`.
