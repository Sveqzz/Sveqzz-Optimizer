# Sveqzz Optimizer 2.0

> **Aviso:** Sveqzz Optimizer cambia ajustes de Windows. Todo es reversible (Historial → Deshacer, o «Deshacer todo» en Inicio) y crea un punto de restauración antes de aplicar varios ajustes, pero úsalo bajo tu responsabilidad. El `.exe` no está firmado: Windows SmartScreen mostrará un aviso (Más información → Ejecutar de todas formas) y algunos antivirus pueden marcarlo. Si un ajuste te da problemas, mira «Diagnóstico de crashes».
>
> **Portátiles:** en laptops los modos solo aplican ajustes de riesgo bajo (sin forzar CPU/GPU al máximo, sin MSI/HAGS/preemption), pensados para no sobrecalentar.


Optimizador de PC para Windows 10/11. **No hace falta instalar nada**: abre `Sveqzz-Optimizer.exe` (pide permisos de administrador).

## Qué hace
- **303 tweaks** (los que no aplican a tu PC se ocultan solos): Windows, NVIDIA, AMD, Intel, red, input lag, kernel/timer, memoria, servicios, privacidad, portátil… Cada uno con su riesgo, y todos reversibles (guarda el valor original antes de tocar).
- **9 modos**: Normal, Eficiente, Trabajo, **Laptop Gaming** (FPS sin sobrecalentar), Gaming, Streaming, Competitivo, Ultimate y Extremo.
- **Detecta tu PC**: componentes, discos, RAM (XMP), monitor, programas de inicio, y te dice qué mejorar. «Copiar informe» para enviarlo a quien quieras.
- **Centro de juegos**: detecta el juego al abrirlo, lo optimiza y lo revierte al cerrar. **Overlay** arriba a la izquierda (FPS, 1% low, ping, CPU, GPU, temperatura) con fondo translúcido; atajo Ctrl+Mayús+O.
- **Discord**: «Jugando a Sveqzz Optimizer» con tu logo (ver Ajustes → Discord; necesitas crear una aplicación en discord.com/developers y pegar su Application ID).
- Limpieza, liberar RAM, ping/DNS/regiones, programas de inicio, historial con «Deshacer todo» y punto de restauración.

## Para desarrollar
`npm install` · `npm start` (Electron) · `node dev-server.js` (navegador, modo simulado) · `npm test` · `npm run dist` (genera el .exe en `dist/`).
