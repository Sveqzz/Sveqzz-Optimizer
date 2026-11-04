'use strict';
// Catálogo de Sveqzz Optimizer. Cada tweak = lista de operaciones reversibles (reg/svc/task/keydef/ps).
//  risk: safe | medium | advanced     reboot / relog: pide reinicio / cerrar sesión
//  tier: 1 gaming, 2 competitivo, 3 ultimate, 4 extremo     eco / work: modos Eficiente / Trabajo
//  noStream: no entra en Streaming   lap: entra en modo Laptop   noLaptop: se omite en laptops
//  req: 'nvidia'|'amd'|'intel'|'laptop'|'desktop'|'win11' = solo si el hardware lo cumple
const PS = String.raw;
const T = [];
const add = (id, cat, name, desc, risk, ops, x = {}) => T.push({ id, cat, name, desc, risk, ops, ...x });

const R = (h, p, n, k, v) => ({ t: 'reg', h, p, n, k, v });
const SVC = (n, start = 4) => (start === 4 ? { t: 'svc', n, start } : { t: 'svc', n, start, nostop: 1 });
const TASK = (path, name) => ({ t: 'task', path, name });
const KEYDEF = (h, p) => ({ t: 'keydef', h, p });
const CU = 'HKCU', LM = 'HKLM';
const EXP = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced';
const PERS = 'Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
const CDM = 'Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager';
const SYSPROF = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile';
const MM = 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management';
const WU = 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate';
const EDGE = 'SOFTWARE\\Policies\\Microsoft\\Edge';
const DEF = 'SOFTWARE\\Policies\\Microsoft\\Windows Defender';
const GUID_ULT = '99999999-9999-9999-9999-999999999999';
const EW = { eco: 1, work: 1 };

// powercfg sobre el plan activo. ac (y dc opcional). Guarda "ac,dc" originales para revertir.
function pcfg(sub, setting, ac, dc = null) {
  const base = `$m=[regex]::Matches((powercfg /q SCHEME_CURRENT ${sub} ${setting} | Out-String),'0x[0-9a-fA-F]{8}');`;
  const getAC = `${base} if($m.Count -ge 2){[Convert]::ToInt32($m[$m.Count-2].Value,16)}`;
  const getBoth = `${base} if($m.Count -ge 2){ '{0},{1}' -f [Convert]::ToInt32($m[$m.Count-2].Value,16),[Convert]::ToInt32($m[$m.Count-1].Value,16) }`;
  return {
    t: 'ps', s: getBoth,
    a: `powercfg -setacvalueindex SCHEME_CURRENT ${sub} ${setting} ${ac};` + (dc != null ? ` powercfg -setdcvalueindex SCHEME_CURRENT ${sub} ${setting} ${dc};` : '') + ' powercfg -setactive SCHEME_CURRENT',
    r: PS`if($prev -match '^(\d+),(\d+)$'){ powercfg -setacvalueindex SCHEME_CURRENT ${sub} ${setting} $Matches[1]; powercfg -setdcvalueindex SCHEME_CURRENT ${sub} ${setting} $Matches[2]; powercfg -setactive SCHEME_CURRENT }`,
    c: `$(${getAC}) -eq ${ac}`,
  };
}
const SUB_PROC = '54533251-82be-4824-96c1-47b60b740d00', SUB_PCIE = '501a4d13-42af-4429-9fd1-a8218c268e20';
const SUB_USB = '2a737441-1930-4402-8d77-b2bebba308a3', SUB_SLEEP = '238c9fa8-0aad-41ed-83f4-97be242c8f20', SUB_DISK = '0012ee47-9041-4b5d-9b77-535fba8b1442';
const PROCMIN = '893dee8e-2bef-41e0-89c6-b55d0929964c', PROCMAX = 'bc5038f7-23e0-4960-96da-33abaf5935ec', CPMINCORES = '0cc5b647-c1df-4637-891a-dec35c318583';
const BOOSTMODE = 'be337238-0d82-4146-a960-4f3749d470c7', EPP = '36687f9e-e3a5-4dbf-b1dc-15eb381c6863', COOLPOL = '94d3a615-a899-4ac5-ae2b-e4d8f634367f';
const IDLEDIS = '5d76a2ca-e8c0-402f-a133-2158492d58ad', ASPM = 'ee12f906-d277-404b-b6da-e5fa1a576df5', USBSS = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226';
const WAKETMR = 'bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d', DISKOFF = '6738e2c4-e8a5-4a42-b16a-e040e769756e';

// bcdedit
const bcd = (name, val, pat) => ({ t: 'ps', a: `bcdedit /set ${name} ${val}`, r: `bcdedit /deletevalue ${name}`, c: PS`[bool]((bcdedit /enum '{current}') -match '${name}\s+(${pat || val})')` });
// TCP / offload / NIC
const tcp = (prop, val) => ({ t: 'ps', s: `(Get-NetTCPSetting -SettingName InternetCustom).${prop}`, a: `Set-NetTCPSetting -SettingName InternetCustom -${prop} ${val}`,
  r: PS`if($prev -match '^[A-Za-z0-9]+$'){ Set-NetTCPSetting -SettingName InternetCustom -${prop} $prev }`, c: `(Get-NetTCPSetting -SettingName InternetCustom).${prop} -eq '${val}'` });
const offl = (prop, val) => ({ t: 'ps', s: `(Get-NetOffloadGlobalSetting).${prop}`, a: `Set-NetOffloadGlobalSetting -${prop} ${val}`,
  r: PS`if($prev -match '^[A-Za-z]+$'){ Set-NetOffloadGlobalSetting -${prop} $prev }`, c: `(Get-NetOffloadGlobalSetting).${prop} -eq '${val}'` });
const nic = (kw, val, def) => ({ t: 'ps',
  a: `Get-NetAdapter -Physical | ForEach-Object { Set-NetAdapterAdvancedProperty -Name $_.Name -RegistryKeyword '${kw}' -RegistryValue ${val} -ErrorAction SilentlyContinue }`,
  r: `Get-NetAdapter -Physical | ForEach-Object { Set-NetAdapterAdvancedProperty -Name $_.Name -RegistryKeyword '${kw}' -RegistryValue ${def} -ErrorAction SilentlyContinue }`,
  c: PS`$v=@(Get-NetAdapter -Physical | ForEach-Object { (Get-NetAdapterAdvancedProperty -Name $_.Name -RegistryKeyword '${kw}' -ErrorAction SilentlyContinue).RegistryValue }); ($v.Count -gt 0) -and (@($v | Where-Object { "$_" -ne '${val}' }).Count -eq 0)` });
// Propiedades dentro de la clave de clase de driver (GPU {4d36e968…} / red {4d36e972…}) filtradas por condición.
const CLS_GPU = '{4d36e968-e325-11ce-bfc1-08002be10318}', CLS_NET = '{4d36e972-e325-11ce-bfc1-08002be10318}';
function classProps(cls, cond, props, pre = '') {
  const base = `HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\${cls}`;
  const list = (inner) => PS`${pre} Get-ChildItem '${base}' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object ${inner}`;
  const names = Object.keys(props);
  const eq = names.map((n) => `$q.${n} -eq ${props[n]}`).join(' -and ');
  return {
    t: 'ps',
    a: list(`{ $p=Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue; if(${cond}){ ${names.map((n) => `New-ItemProperty -Path $_.PSPath -Name ${n} -Value ${props[n]} -PropertyType DWord -Force | Out-Null`).join('; ')} } }`),
    r: list(`{ $p=Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue; if(${cond}){ ${names.map((n) => `Remove-ItemProperty -Path $_.PSPath -Name ${n} -ErrorAction SilentlyContinue`).join('; ')} } }`),
    c: PS`${pre} @(Get-ChildItem '${base}' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | Where-Object { $p=Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue; $q=$p; (${cond}) -and (${eq}) }).Count -gt 0`,
  };
}
const gpuProps = (re, props) => classProps(CLS_GPU, `$p.DriverDesc -match '${re}'`, props);
// MSI (interrupciones por mensaje) para GPU y/o tarjetas de red
const msi = (classes) => {
  const dev = `Get-PnpDevice -Class ${classes} -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like 'PCI\\*' }`;
  const key = `('HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\' + $_.InstanceId + '\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties')`;
  return { t: 'ps',
    a: `${dev} | ForEach-Object { $k=${key}; if(-not (Test-Path $k)){ New-Item -Path $k -Force | Out-Null }; New-ItemProperty -Path $k -Name MSISupported -Value 1 -PropertyType DWord -Force | Out-Null }`,
    r: `${dev} | ForEach-Object { $k=${key}; Remove-ItemProperty -Path $k -Name MSISupported -ErrorAction SilentlyContinue }`,
    c: `$d=@(${dev}); ($d.Count -gt 0) -and (@($d | Where-Object { $k=${key}; (Get-ItemProperty $k -ErrorAction SilentlyContinue).MSISupported -eq 1 }).Count -eq $d.Count)` };
};
const CATEGORIES = [
  ['basico', 'Básico'], ['rendimiento', 'Rendimiento'], ['juegos', 'Juegos'], ['gpu', 'Gráficos NVIDIA/AMD/Windows'], ['energia', 'CPU y energía'],
  ['red', 'Red y latencia'], ['input', 'Input lag'], ['kernel', 'Kernel y timer'], ['memoria', 'Memoria'], ['almacenamiento', 'Almacenamiento'],
  ['visual', 'Efectos visuales'], ['servicios', 'Servicios'], ['tareas', 'Tareas programadas'], ['privacidad', 'Privacidad y telemetría'],
  ['actualizaciones', 'Actualizaciones'], ['seguridad', 'Seguridad'], ['personalizacion', 'Personalización'], ['laptop', 'Laptop y temperatura'], ['experimental', 'Experimental (riesgo)'],
];

// ───────── BÁSICO ─────────
add('menu-delay', 'basico', 'Menús sin retraso', 'Los menús se abren al instante en lugar de esperar 400 ms.', 'safe', [R(CU, 'Control Panel\\Desktop', 'MenuShowDelay', 'SZ', '0')], { relog: 1, eco: 1, work: 1, tier: 1 });
add('fast-shutdown', 'basico', 'Cierre rápido de apps colgadas', 'Windows cierra antes las apps que no responden y los servicios al apagar (1-2 s en vez de 5-20 s).', 'safe',
  [R(CU, 'Control Panel\\Desktop', 'AutoEndTasks', 'SZ', '1'), R(CU, 'Control Panel\\Desktop', 'HungAppTimeout', 'SZ', '1500'), R(CU, 'Control Panel\\Desktop', 'WaitToKillAppTimeout', 'SZ', '3000'), R(LM, 'SYSTEM\\CurrentControlSet\\Control', 'WaitToKillServiceTimeout', 'SZ', '3000')], { relog: 1, eco: 1, work: 1, tier: 1 });
add('startup-delay', 'basico', 'Quitar el retraso de arranque de apps', 'Windows espera ~10 s antes de lanzar tus programas de inicio. Esto lo elimina.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize', 'StartupDelayInMSec', 'DWORD', 0)], { relog: 1, eco: 1, work: 1, tier: 1 });
add('sticky-keys', 'basico', 'Desactivar teclas especiales (Shift x5)', 'Evita el popup de Teclas adhesivas, Filtro y Alternar al pulsar Shift/Num Lock repetidamente en pleno juego.', 'safe',
  [R(CU, 'Control Panel\\Accessibility\\StickyKeys', 'Flags', 'SZ', '506'), R(CU, 'Control Panel\\Accessibility\\Keyboard Response', 'Flags', 'SZ', '122'), R(CU, 'Control Panel\\Accessibility\\ToggleKeys', 'Flags', 'SZ', '58')], { tier: 1 });
add('no-animations', 'basico', 'Desactivar animaciones de Windows', 'Quita animaciones de ventanas y barra de tareas. Interfaz más ágil.', 'safe',
  [R(CU, 'Control Panel\\Desktop\\WindowMetrics', 'MinAnimate', 'SZ', '0'), R(CU, EXP, 'TaskbarAnimations', 'DWORD', 0), R(CU, 'Software\\Microsoft\\Windows\\DWM', 'EnableAeroPeek', 'DWORD', 0)], { relog: 1, eco: 1, work: 1, tier: 1 });
add('no-transparency', 'basico', 'Desactivar transparencia', 'Quita el efecto acrílico/mica. Ahorra algo de GPU.', 'safe', [R(CU, PERS, 'EnableTransparency', 'DWORD', 0)], { relog: 1, eco: 1, tier: 1 });
add('explorer-thispc', 'basico', 'Explorador abre en "Este equipo"', 'En vez de "Acceso rápido", que indexa carpetas recientes y es más lento.', 'safe', [R(CU, EXP, 'LaunchTo', 'DWORD', 1)], { eco: 1, work: 1 });
add('show-ext', 'basico', 'Mostrar extensiones de archivo', 'Verás .exe, .zip, etc. Ayuda a detectar archivos falsos (foto.jpg.exe).', 'safe', [R(CU, EXP, 'HideFileExt', 'DWORD', 0)], { work: 1 });
add('show-hidden', 'basico', 'Mostrar archivos y carpetas ocultos', 'El Explorador muestra archivos ocultos (útil para limpiar y depurar).', 'safe', [R(CU, EXP, 'Hidden', 'DWORD', 1)], { work: 1 });
add('no-shortcut-suffix', 'basico', 'Quitar "- Acceso directo" de los accesos', 'Los accesos nuevos ya no llevan el sufijo.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer', 'link', 'BINARY', '00000000')], { relog: 1 });
add('onedrive-nav-off', 'basico', 'Ocultar OneDrive del panel del Explorador', 'Quita la entrada de OneDrive de la barra lateral.', 'safe', [R(CU, 'Software\\Classes\\CLSID\\{018D5C66-4533-4307-9B53-224DE2ED1FE6}', 'System.IsPinnedToNameSpaceTree', 'DWORD', 0)], { relog: 1, eco: 1, work: 1 });
add('no-lowdisk-warning', 'basico', 'Quitar aviso de poco espacio en disco', 'Windows no muestra la notificación de espacio bajo.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'NoLowDiskSpaceChecks', 'DWORD', 1)]);
add('no-recent', 'basico', 'No guardar archivos recientes ni frecuentes', 'El Explorador deja de registrar tus archivos y carpetas recientes.', 'safe', [R(CU, EXP, 'Start_TrackDocs', 'DWORD', 0), R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer', 'ShowRecent', 'DWORD', 0), R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer', 'ShowFrequent', 'DWORD', 0)], EW);
add('long-paths', 'basico', 'Permitir rutas largas (+260 caracteres)', 'Quita el límite de 260 caracteres de ruta. Útil para desarrollo y proyectos grandes.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\FileSystem', 'LongPathsEnabled', 'DWORD', 1)], { work: 1 });
add('no-lockscreen', 'basico', 'Saltar la pantalla de bloqueo', 'Va directo a la contraseña/PIN al arrancar o despertar.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization', 'NoLockScreen', 'DWORD', 1)], { eco: 1, work: 1 });
add('no-startup-sound', 'basico', 'Quitar sonido de inicio de Windows', 'Arranque silencioso.', 'safe', [R(LM, 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\LogonUI\\BootAnimation', 'DisableStartupSound', 'DWORD', 1)]);
add('numlock-boot', 'basico', 'Bloq Num activado al iniciar', 'El teclado numérico arranca encendido.', 'safe', [R(CU, 'Control Panel\\Keyboard', 'InitialKeyboardIndicators', 'SZ', '2')], { work: 1 });
add('taskbar-end-task', 'basico', 'Botón "Finalizar tarea" en la barra (Win11)', 'Clic derecho en un programa de la barra → Finalizar tarea.', 'safe', [R(CU, EXP + '\\TaskbarDeveloperSettings', 'TaskbarEndTask', 'DWORD', 1)], { req: 'win11', work: 1 });
add('search-highlights-off', 'basico', 'Quitar "Destacados" de la búsqueda', 'La barra de búsqueda no muestra ilustraciones ni noticias del día.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings', 'IsDynamicSearchBoxEnabled', 'DWORD', 0)], EW);

// ───────── RENDIMIENTO ─────────
add('cpu-scheduling', 'rendimiento', 'Prioridad al programa en primer plano', 'Ajusta Win32PrioritySeparation (0x26): cuantos cortos de tamaño fijo y mayor prioridad al foreground. Estándar en optimización de juegos.', 'medium', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'Win32PrioritySeparation', 'DWORD', 38)], { tier: 1 });
add('mmcss-responsiveness', 'rendimiento', 'MMCSS: reservar menos CPU a segundo plano', 'SystemResponsiveness=0 (por defecto Windows reserva 20% para tareas multimedia de fondo).', 'safe', [R(LM, SYSPROF, 'SystemResponsiveness', 'DWORD', 0)], { tier: 1 });
add('mmcss-games', 'rendimiento', 'MMCSS: prioridad alta para juegos', 'Sube la prioridad de CPU, GPU y disco de la tarea "Games" del planificador multimedia.', 'safe',
  [R(LM, SYSPROF + '\\Tasks\\Games', 'GPU Priority', 'DWORD', 8), R(LM, SYSPROF + '\\Tasks\\Games', 'Priority', 'DWORD', 6), R(LM, SYSPROF + '\\Tasks\\Games', 'Scheduling Category', 'SZ', 'High'), R(LM, SYSPROF + '\\Tasks\\Games', 'SFIO Priority', 'SZ', 'High')], { tier: 1 });
add('mmcss-lowlatency', 'rendimiento', 'MMCSS: tarea de juegos sensible a latencia', 'Marca la tarea Games como "Latency Sensitive" y no de fondo, con reloj de 1 ms.', 'medium',
  [R(LM, SYSPROF + '\\Tasks\\Games', 'Latency Sensitive', 'SZ', 'True'), R(LM, SYSPROF + '\\Tasks\\Games', 'Background Only', 'SZ', 'False'), R(LM, SYSPROF + '\\Tasks\\Games', 'Clock Rate', 'DWORD', 10000)], { tier: 2 });
add('power-throttling-off', 'rendimiento', 'Desactivar Power Throttling', 'Windows 10/11 limita la CPU de apps en segundo plano para ahorrar energía. Esto lo desactiva globalmente.', 'medium', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling', 'PowerThrottlingOff', 'DWORD', 1)], { tier: 2, noLaptop: 1 });
add('bg-apps-off', 'rendimiento', 'Bloquear apps en segundo plano', 'Las apps UWP dejan de ejecutarse cuando no las usas. Pierdes notificaciones de apps de la Tienda cerradas.', 'safe',
  [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', 'GlobalUserDisabled', 'DWORD', 1), R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy', 'LetAppsRunInBackground', 'DWORD', 2)], { eco: 1, work: 1, tier: 1, warn: 'Deja de funcionar: notificaciones de apps de la Tienda cerradas.' });
add('edge-bg-off', 'rendimiento', 'Edge sin procesos en segundo plano', 'Impide que Edge se precargue al iniciar y siga ejecutándose cuando lo cierras.', 'safe', [R(LM, EDGE, 'StartupBoostEnabled', 'DWORD', 0), R(LM, EDGE, 'BackgroundModeEnabled', 'DWORD', 0)], { eco: 1, work: 1, tier: 1 });
add('foreground-lock', 'rendimiento', 'Ventanas al frente sin parpadeo', 'ForegroundLockTimeout=0: la ventana que abres pasa al frente al instante y no parpadea en la barra.', 'safe', [R(CU, 'Control Panel\\Desktop', 'ForegroundLockTimeout', 'DWORD', 0)], { relog: 1, tier: 1 });
add('auto-maintenance-off', 'rendimiento', 'Desactivar mantenimiento automático', 'Windows no ejecuta tareas de mantenimiento (desfragmentar, diagnósticos) mientras no usas el PC.', 'medium', [R(LM, 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Schedule\\Maintenance', 'MaintenanceDisabled', 'DWORD', 1)], { tier: 1, warn: 'Windows no se auto-mantendrá: ejecuta limpieza y actualizaciones tú mismo.' });
add('timer-coalescing-off', 'rendimiento', 'Sin agrupación de temporizadores', 'CoalescingTimerInterval=0: los timers se disparan a su hora exacta en vez de agruparse para ahorrar energía.', 'medium', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', 'CoalescingTimerInterval', 'DWORD', 0)], { tier: 2, noLaptop: 1 });
add('fth-off', 'rendimiento', 'Desactivar Fault Tolerant Heap', 'FTH oculta fallos de memoria de apps pero puede ralentizar juegos que "fallan" y se reinician.', 'medium', [R(LM, 'SOFTWARE\\Microsoft\\FTH', 'Enabled', 'DWORD', 0)], { tier: 2 });

// ───────── JUEGOS ─────────
add('gamedvr-off', 'juegos', 'Desactivar Game DVR (grabación en segundo plano)', 'Windows graba clips en segundo plano y cuesta FPS. Si usas Xbox Game Bar para capturar, déjalo apagado.', 'safe',
  [R(CU, 'System\\GameConfigStore', 'GameDVR_Enabled', 'DWORD', 0), R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 'DWORD', 0), R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR', 'AllowGameDVR', 'DWORD', 0)], { tier: 1, noStream: 1 });
add('gamedvr-audio-off', 'juegos', 'Game DVR: sin captura de audio/cursor/histórico', 'Apaga la captura de audio, cursor y buffer histórico de Game DVR.', 'safe',
  [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AudioCaptureEnabled', 'DWORD', 0), R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'CursorCaptureEnabled', 'DWORD', 0), R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'HistoricalCaptureEnabled', 'DWORD', 0)], { tier: 1, noStream: 1 });
add('gamebar-off', 'juegos', 'Quitar popups de Xbox Game Bar', 'Sin avisos de "Win+G" ni inicio del panel al abrir juegos.', 'safe', [R(CU, 'Software\\Microsoft\\GameBar', 'UseNexusForGameBarEnabled', 'DWORD', 0), R(CU, 'Software\\Microsoft\\GameBar', 'ShowStartupPanel', 'DWORD', 0)], { tier: 1, noStream: 1 });
add('gamemode-on', 'juegos', 'Activar Modo Juego de Windows', 'Windows prioriza el juego y evita que Windows Update instale drivers mientras juegas.', 'safe', [R(CU, 'Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', 'DWORD', 1), R(CU, 'Software\\Microsoft\\GameBar', 'AllowAutoGameMode', 'DWORD', 1)], { tier: 1 });
add('hags-on', 'juegos', 'Programación de GPU acelerada por hardware (HAGS)', 'Activa HAGS (necesita GPU GTX 1000+/RX 5000+ y driver reciente). Puede bajar latencia o no: mide.', 'medium', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode', 'DWORD', 2)], { reboot: 1, tier: 2 });
add('fso-off', 'juegos', 'Optimizaciones de pantalla completa: modo clásico', 'Fuerza pantalla completa exclusiva en vez de ventana sin bordes optimizada. Menos input lag en muchos juegos DX11.', 'medium',
  [R(CU, 'System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 'DWORD', 2), R(CU, 'System\\GameConfigStore', 'GameDVR_HonorUserFSEBehaviorMode', 'DWORD', 1), R(CU, 'System\\GameConfigStore', 'GameDVR_FSEBehavior', 'DWORD', 2), R(CU, 'System\\GameConfigStore', 'GameDVR_DXGIHonorFSEWindowsCompatible', 'DWORD', 1)], { tier: 2 });
add('windowed-game-opt', 'juegos', 'Optimizaciones para juegos en ventana', 'DirectX usa el modelo de presentación moderno en juegos en ventana/sin bordes (menos latencia y VRR).', 'safe', [R(CU, 'Software\\Microsoft\\DirectX\\UserGpuPreferences', 'DirectXUserGlobalSettings', 'SZ', 'SwapEffectUpgradeEnable=1;')], { tier: 1 });

// ───────── GRÁFICOS (NVIDIA / AMD / Windows) ─────────
const GD = 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers';
add('gpu-msi', 'gpu', 'GPU en modo MSI (interrupciones por mensaje)', 'Activa MSI en la tarjeta gráfica: menos latencia de interrupciones y mejores 1% lows. Reinicia para aplicar.', 'medium', [msi('Display')], { reboot: 1, tier: 2 });
add('dwm-mpo-off', 'gpu', 'Desactivar Multiplane Overlay (MPO)', 'Soluciona parpadeos y tirones en algunas GPU NVIDIA/AMD con varios monitores o HDR.', 'medium', [R(LM, 'SOFTWARE\\Microsoft\\Windows\\Dwm', 'OverlayTestMode', 'DWORD', 5)], { reboot: 1, tier: 2 });
add('gpu-tdr-delay', 'gpu', 'TDR más tolerante (evita "driver dejó de responder")', 'Sube a 10 s el tiempo que Windows espera a la GPU antes de reiniciar el driver.', 'safe', [R(LM, GD, 'TdrDelay', 'DWORD', 10), R(LM, GD, 'TdrDdiDelay', 'DWORD', 10)], { reboot: 1, tier: 1 });
add('gpu-tdr-off', 'gpu', 'Desactivar recuperación de GPU (TDR)', 'Windows no reinicia el driver si la GPU se cuelga.', 'advanced', [R(LM, GD, 'TdrLevel', 'DWORD', 0)], { reboot: 1, warn: 'Si la GPU se cuelga, el PC se congela y tendrás que reiniciarlo a la fuerza.' });
add('gpu-preemption-off', 'gpu', 'Desactivar preempción de GPU', 'Quita la expropiación de tareas de GPU: baja latencia a cambio de estabilidad.', 'advanced', [R(LM, GD + '\\Scheduler', 'EnablePreemption', 'DWORD', 0)], { reboot: 1, tier: 3, warn: 'Puede causar pantallazos o cierres de juegos con ciertos drivers.' });
add('nv-max-perf', 'gpu', 'NVIDIA: modo de máximo rendimiento (PowerMizer)', 'Fuerza el estado de máximo rendimiento del driver NVIDIA en reposo y carga. Más consumo y calor.', 'medium',
  [gpuProps('NVIDIA', { PerfLevelSrc: 8738, PowerMizerEnable: 1, PowerMizerLevel: 1, PowerMizerLevelAC: 1 })], { req: 'nvidia', reboot: 1, tier: 2, noLaptop: 1 });
add('nv-no-dynamic-pstate', 'gpu', 'NVIDIA: sin cambios dinámicos de P-State', 'DisableDynamicPstate=1: la GPU se mantiene en el estado más alto (menos tirones de reloj).', 'advanced',
  [gpuProps('NVIDIA', { DisableDynamicPstate: 1 })], { req: 'nvidia', reboot: 1, tier: 3, noLaptop: 1, warn: 'La GPU funciona caliente y a toda frecuencia aunque no hagas nada.' });
add('nv-preempt-off', 'gpu', 'NVIDIA: sin preempción de cómputo', 'KMD_EnableComputePreemption=0: menos latencia en juegos, puede afectar cargas de cómputo.', 'advanced', [gpuProps('NVIDIA', { KMD_EnableComputePreemption: 0 })], { req: 'nvidia', reboot: 1, tier: 3 });
add('nv-hdcp-off', 'gpu', 'NVIDIA: desactivar HDCP', 'Quita la protección HDCP del driver (algo menos de carga).', 'advanced', [gpuProps('NVIDIA', { RMHdcpKeyglobZero: 1 })], { req: 'nvidia', reboot: 1, warn: 'Netflix/Disney+ 4K y algunos monitores HDMI dejarán de mostrar contenido protegido.' });
add('nv-telemetry', 'gpu', 'NVIDIA: apagar telemetría', 'Desactiva el contenedor de telemetría y la participación en estadísticas.', 'safe',
  [SVC('NvTelemetryContainer'), R(LM, 'SOFTWARE\\NVIDIA Corporation\\NvControlPanel2\\Client', 'OptInOrOutPreference', 'DWORD', 0), R(LM, 'SOFTWARE\\NVIDIA Corporation\\Global\\FTS', 'EnableRID44231', 'DWORD', 0), R(LM, 'SOFTWARE\\NVIDIA Corporation\\Global\\FTS', 'EnableRID64640', 'DWORD', 0), R(LM, 'SOFTWARE\\NVIDIA Corporation\\Global\\FTS', 'EnableRID66610', 'DWORD', 0)], { req: 'nvidia', ...EW, tier: 1 });
add('amd-ulps-off', 'gpu', 'AMD: desactivar ULPS', 'EnableUlps=0: evita el ahorro "Ultra Low Power State" que causa pantallas negras y tirones.', 'medium', [gpuProps('Radeon|AMD', { EnableUlps: 0 })], { req: 'amd', reboot: 1, tier: 2, noLaptop: 1 });
add('amd-powerdown-off', 'gpu', 'AMD: no apagar la GPU en reposo', 'PP_GPUPowerDownEnabled=0: la GPU no baja a estados de energía profundos.', 'medium', [gpuProps('Radeon|AMD', { PP_GPUPowerDownEnabled: 0 })], { req: 'amd', reboot: 1, tier: 2, noLaptop: 1 });
add('amd-drmdma', 'gpu', 'AMD: sin power gating DRMDMA', 'DisableDrmdmaPowerGating=1: evita latencia al despertar el motor DMA.', 'medium', [gpuProps('Radeon|AMD', { DisableDrmdmaPowerGating: 1 })], { req: 'amd', reboot: 1, tier: 2, noLaptop: 1 });
add('amd-aspm-off', 'gpu', 'AMD: sin ahorro ASPM de la GPU', 'Desactiva L0s/L1 del enlace PCIe de la GPU Radeon.', 'medium', [gpuProps('Radeon|AMD', { EnableAspmL0s: 0, EnableAspmL1: 0 })], { req: 'amd', reboot: 1, tier: 2, noLaptop: 1 });
add('amd-preempt-off', 'gpu', 'AMD: sin preempción de cómputo', 'KMD_EnableComputePreemption=0 en Radeon.', 'advanced', [gpuProps('Radeon|AMD', { KMD_EnableComputePreemption: 0 })], { req: 'amd', reboot: 1, tier: 3 });
add('amd-crash-defender', 'gpu', 'AMD: desactivar Crash Defender', 'Detiene el servicio de informes de fallos de AMD.', 'safe', [SVC('AMD Crash Defender Service')], { req: 'amd', ...EW, tier: 1 });

// ───────── CPU Y ENERGÍA ─────────
add('power-plan-ultimate', 'energia', 'Plan de energía "Máximo rendimiento"', 'Activa el plan Ultimate Performance (o Alto rendimiento si tu PC no lo ofrece). Tu plan anterior se restaura al revertir. En portátiles aumenta consumo y calor.', 'medium', [{ t: 'ps',
  s: '(powercfg /getactivescheme) -replace \'.*GUID:\\s*([0-9a-fA-F-]{36}).*\',\'$1\'',
  a: `powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 ${GUID_ULT} | Out-Null; if ($LASTEXITCODE -eq 0) { powercfg -setactive ${GUID_ULT} } else { powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c }`,
  r: `if ($prev -match '^[0-9a-fA-F-]{36}$') { powercfg -setactive $prev } else { powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e }; powercfg -delete ${GUID_ULT} | Out-Null`,
  c: `[bool]((powercfg /getactivescheme) -match '${GUID_ULT}|8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c')` }], { tier: 1, noLaptop: 1 });
add('cpu-min-100', 'energia', 'CPU siempre a frecuencia plena', 'Estado mínimo del procesador al 100% (sin bajar frecuencia en reposo). Menos microtirones, más calor y consumo.', 'medium', [pcfg(SUB_PROC, PROCMIN, 100)], { tier: 2, noLaptop: 1 });
add('cpu-max-100', 'energia', 'CPU máximo al 100% (turbo permitido)', 'Asegura que el estado máximo del procesador sea 100% y el turbo no esté limitado.', 'safe', [pcfg(SUB_PROC, PROCMAX, 100)], { tier: 1, noLaptop: 1 });
add('core-parking-off', 'energia', 'Desactivar aparcamiento de núcleos', 'CPMINCORES=100: todos los núcleos siempre despiertos, sin latencia al "despertarlos".', 'medium', [pcfg(SUB_PROC, CPMINCORES, 100)], { tier: 2, noLaptop: 1 });
add('perf-boost-aggressive', 'energia', 'Boost de CPU agresivo', 'PERFBOOSTMODE=2: el procesador sube de frecuencia lo antes posible.', 'medium', [pcfg(SUB_PROC, BOOSTMODE, 2)], { tier: 2, noLaptop: 1 });
add('perf-epp-performance', 'energia', 'Preferencia de energía: rendimiento (EPP 0)', 'Pide a la CPU (Intel HWP / AMD CPPC) máximo rendimiento en lugar de ahorro.', 'medium', [pcfg(SUB_PROC, EPP, 0)], { tier: 2, noLaptop: 1 });
add('idle-disable', 'energia', 'Desactivar estados de reposo de la CPU (C-States)', 'IDLEDISABLE=1: la CPU nunca entra en reposo profundo. Latencia mínima, temperatura alta.', 'advanced', [pcfg(SUB_PROC, IDLEDIS, 1)], { tier: 3, noLaptop: 1, warn: 'La CPU se mantiene al 100% de actividad: más calor, ruido y consumo siempre.' });
add('pcie-aspm-off', 'energia', 'PCIe sin ahorro de energía (ASPM)', 'Evita que la GPU/NVMe entren en estados de bajo consumo y tarden en despertar.', 'safe', [pcfg(SUB_PCIE, ASPM, 0)], { tier: 2, noLaptop: 1 });
add('usb-suspend-off', 'energia', 'USB sin suspensión selectiva', 'Evita que ratón/teclado/mando se "duerman" y tarden en responder.', 'safe', [pcfg(SUB_USB, USBSS, 0)], { tier: 1, noLaptop: 1 });
add('disk-never-sleep', 'energia', 'Discos duros nunca se apagan', 'El disco no se detiene por inactividad (evita el retardo al volver a usarlo).', 'safe', [pcfg(SUB_DISK, DISKOFF, 0)], { tier: 1, noLaptop: 1 });
add('wake-timers-off', 'energia', 'Sin temporizadores de reactivación', 'Ninguna tarea despierta el PC mientras duerme.', 'safe', [pcfg(SUB_SLEEP, WAKETMR, 0, 0)], { eco: 1, work: 1, lap: 1 });
add('fast-startup-off', 'energia', 'Desactivar Inicio rápido', 'El inicio rápido guarda un estado a medias del kernel: provoca drivers raros y "apagar" que no apaga. Con esto el apagado es completo.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', 'HiberbootEnabled', 'DWORD', 0)], { tier: 3 });
add('hibernate-off', 'energia', 'Desactivar hibernación', 'Libera varios GB (hiberfil.sys). No podrás hibernar.', 'medium', [{ t: 'ps', a: 'powercfg -h off', r: 'powercfg -h on', c: '(Get-ItemProperty \'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\').HibernateEnabled -eq 0' }]);

// ───────── RED Y LATENCIA ─────────
add('net-throttle-off', 'red', 'Quitar limitación de red multimedia', 'Windows limita el procesamiento de paquetes mientras suena multimedia. Esto lo quita.', 'safe', [R(LM, SYSPROF, 'NetworkThrottlingIndex', 'DWORD', 0xffffffff)], { tier: 1 });
add('qos-reserve-off', 'red', 'No reservar ancho de banda para QoS', 'Quita el límite de 20% reservado por el planificador de paquetes.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Psched', 'NonBestEffortLimit', 'DWORD', 0)], { tier: 1 });
add('nagle-off', 'red', 'Desactivar algoritmo de Nagle', 'TcpAckFrequency=1 y TCPNoDelay=1 en tus interfaces: los paquetes pequeños salen sin esperar. Mejor ping en juegos TCP.', 'medium', [{ t: 'ps',
  a: "Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' | ForEach-Object { New-ItemProperty -Path $_.PSPath -Name TcpAckFrequency -Value 1 -PropertyType DWord -Force | Out-Null; New-ItemProperty -Path $_.PSPath -Name TCPNoDelay -Value 1 -PropertyType DWord -Force | Out-Null }",
  r: "Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' | ForEach-Object { Remove-ItemProperty -Path $_.PSPath -Name TcpAckFrequency -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $_.PSPath -Name TCPNoDelay -ErrorAction SilentlyContinue }",
  c: "@(Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' | Get-ItemProperty | Where-Object { $_.TcpAckFrequency -eq 1 -and $_.TCPNoDelay -eq 1 }).Count -gt 0" }], { reboot: 1, tier: 2 });
add('delivery-opt-off', 'red', 'Sin Optimización de distribución (P2P de Windows Update)', 'Tu PC deja de subir actualizaciones de Windows a otros equipos usando tu internet.', 'safe', [R(LM, 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config', 'DODownloadMode', 'DWORD', 0)], { ...EW, tier: 1 });
add('tcp-autotune-normal', 'red', 'TCP: auto-ajuste de ventana normal', 'Garantiza AutoTuningLevel=Normal (algunas guías lo ponen mal en Disabled y dañan la velocidad).', 'safe', [tcp('AutoTuningLevelLocal', 'Normal')], { tier: 1 });
add('tcp-ecn-off', 'red', 'TCP: desactivar ECN', 'Quita la notificación explícita de congestión: algunos routers antiguos la manejan mal.', 'safe', [tcp('EcnCapability', 'Disabled')], { tier: 2 });
add('tcp-timestamps-off', 'red', 'TCP: sin marcas de tiempo', 'Reduce 12 bytes por paquete y algo de CPU.', 'medium', [tcp('Timestamps', 'Disabled')], { tier: 2 });
add('tcp-heuristics-off', 'red', 'TCP: sin heurística de escalado', 'Evita que Windows reduzca la ventana por su cuenta.', 'medium', [tcp('ScalingHeuristics', 'Disabled')], { tier: 2 });
add('tcp-congestion-ctcp', 'red', 'TCP: control de congestión CTCP', 'Usa Compound TCP: recupera más rápido tras pérdidas de paquetes.', 'medium', [tcp('CongestionProvider', 'CTCP')], { tier: 2 });
add('tcp-rsc-off', 'red', 'Desactivar RSC (coalescencia de segmentos)', 'Evita que la tarjeta junte paquetes antes de entregarlos: menos latencia.', 'medium', [offl('ReceiveSegmentCoalescing', 'Disabled')], { tier: 2 });
add('tcp-rss-on', 'red', 'Activar RSS (escalado de recepción)', 'Reparte la carga de red entre núcleos de la CPU.', 'safe', [offl('ReceiveSideScaling', 'Enabled')], { tier: 1 });
add('nic-eee-off', 'red', 'Tarjeta de red: sin Ethernet de bajo consumo (EEE)', 'Evita microcortes y picos de ping por el ahorro de energía de la tarjeta.', 'safe', [nic('*EEE', 0, 1)], { tier: 1, noLaptop: 1 });
add('nic-green-off', 'red', 'Tarjeta de red: sin Green Ethernet', 'Desactiva el ahorro de energía GreenEthernet de Realtek/Intel.', 'safe', [nic('EnableGreenEthernet', 0, 1)], { tier: 1, noLaptop: 1 });
add('nic-interrupt-mod-off', 'red', 'Tarjeta de red: sin moderación de interrupciones', 'Cada paquete se procesa al instante. Menos latencia, algo más de CPU.', 'medium', [nic('*InterruptModeration', 0, 1)], { tier: 2, noLaptop: 1 });
add('nic-flow-control-off', 'red', 'Tarjeta de red: sin control de flujo', 'Evita pausas de transmisión pedidas por el switch.', 'medium', [nic('*FlowControl', 0, 3)], { tier: 2 });
add('nic-lso-off', 'red', 'Tarjeta de red: sin Large Send Offload', 'Desactiva LSO v2 (IPv4/IPv6). Puede bajar el ping con Wi-Fi/Ethernet problemáticos.', 'medium', [nic('*LsoV2IPv4', 0, 1), nic('*LsoV2IPv6', 0, 1)], { tier: 2 });
add('nic-wol-off', 'red', 'Tarjeta de red: sin Wake-on-LAN', 'La red no despierta el PC. Menos eventos y más seguridad.', 'safe', [nic('*WakeOnMagicPacket', 0, 1), nic('*WakeOnPattern', 0, 1)], { eco: 1, work: 1 });
add('nic-power-off', 'red', 'Tarjeta de red: no apagarla para ahorrar energía', 'PnPCapabilities=24: Windows no apaga la tarjeta de red.', 'safe', [classProps(CLS_NET, '$p.NetCfgInstanceId -and ($g -contains $p.NetCfgInstanceId)', { PnPCapabilities: 24 }, '$g=@(Get-NetAdapter -Physical | ForEach-Object { $_.InterfaceGuid });')], { reboot: 1, tier: 1, noLaptop: 1 });
add('nic-msi', 'red', 'Tarjeta de red en modo MSI', 'Activa interrupciones por mensaje en la tarjeta de red. Menos latencia.', 'medium', [msi('Net')], { reboot: 1, tier: 2 });
add('ipv4-prefer', 'red', 'Preferir IPv4 sobre IPv6', 'Windows intenta primero IPv4 (muchos juegos y routers van mejor).', 'medium', [R(LM, 'SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters', 'DisabledComponents', 'DWORD', 32)], { reboot: 1, tier: 2 });
add('ipv6-off', 'red', 'Desactivar IPv6 por completo', 'Apaga IPv6 en todas las interfaces.', 'advanced', [R(LM, 'SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters', 'DisabledComponents', 'DWORD', 255)], { reboot: 1, warn: 'Algunas redes (operadoras con CGNAT) y apps de Microsoft usan IPv6: pueden fallar.' });
add('browser-connections', 'red', 'Más conexiones simultáneas por servidor', 'Sube a 16 conexiones por servidor para descargas web más rápidas.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', 'MaxConnectionsPerServer', 'DWORD', 16), R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', 'MaxConnectionsPer1_0Server', 'DWORD', 16)], { work: 1 });

// ───────── INPUT LAG ─────────
add('mouse-accel-off', 'input', 'Desactivar aceleración del ratón', 'Quita "Mejorar precisión del puntero": el movimiento es 1:1, imprescindible para puntería consistente.', 'safe',
  [R(CU, 'Control Panel\\Mouse', 'MouseSpeed', 'SZ', '0'), R(CU, 'Control Panel\\Mouse', 'MouseThreshold1', 'SZ', '0'), R(CU, 'Control Panel\\Mouse', 'MouseThreshold2', 'SZ', '0')], { relog: 1, tier: 1 });
add('mouse-curve-1to1', 'input', 'Curva del ratón 1:1 (100% DPI)', 'Sustituye la curva suavizada por una lineal exacta (para escala de pantalla 100%).', 'medium',
  [R(CU, 'Control Panel\\Mouse', 'SmoothMouseXCurve', 'BINARY', ['0000000000000000','c0cc0c0000000000','8099190000000000','4066260000000000','0033330000000000'].join('')),
   R(CU, 'Control Panel\\Mouse', 'SmoothMouseYCurve', 'BINARY', '0000000000000000000038000000000000007000000000000000a800000000000000e00000000000')], { relog: 1, tier: 2, warn: 'Pensado para escala de pantalla al 100%. Con otra escala el movimiento se siente distinto.' });
add('mouse-sens-6-11', 'input', 'Sensibilidad del ratón 6/11 (sin escalado)', 'Velocidad de puntero estándar de Windows (6/11): relación 1:1 con los DPI de tu ratón.', 'safe', [R(CU, 'Control Panel\\Mouse', 'MouseSensitivity', 'SZ', '10')], { relog: 1, tier: 1 });
add('mouse-queue', 'input', 'Cola del ratón reducida', 'MouseDataQueueSize=20: procesa menos eventos acumulados (menos retraso con ratones de alta frecuencia).', 'medium', [R(LM, 'SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters', 'MouseDataQueueSize', 'DWORD', 20)], { reboot: 1, tier: 2 });
add('kb-queue', 'input', 'Cola del teclado reducida', 'KeyboardDataQueueSize=20.', 'medium', [R(LM, 'SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters', 'KeyboardDataQueueSize', 'DWORD', 20)], { reboot: 1, tier: 2 });
add('kb-fast', 'input', 'Teclado: repetición y retardo mínimos', 'Retardo de repetición 0 y velocidad máxima.', 'safe', [R(CU, 'Control Panel\\Keyboard', 'KeyboardDelay', 'SZ', '0'), R(CU, 'Control Panel\\Keyboard', 'KeyboardSpeed', 'SZ', '31')], { relog: 1, tier: 2 });
add('touch-viz-off', 'input', 'Sin efectos visuales táctiles', 'Quita el círculo de toque y los gestos animados.', 'safe', [R(CU, 'Control Panel\\Cursors', 'ContactVisualization', 'DWORD', 0), R(CU, 'Control Panel\\Cursors', 'GestureVisualization', 'DWORD', 0)], { relog: 1, tier: 1 });


// ───────── JUEGOS: PRIORIDAD PERSISTENTE (IFEO) ─────────
const GEXE = ['FortniteClient-Win64-Shipping.exe','RobloxPlayerBeta.exe','VALORANT-Win64-Shipping.exe','cs2.exe','RocketLeague.exe','r5apex.exe','javaw.exe','Overwatch.exe','eurotrucks2.exe','GTA5.exe'];
const IFEO = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\';
add('ifeo-cpu-high', 'juegos', 'Prioridad de CPU Alta permanente para juegos', 'Fortnite, Roblox, Valorant, CS2, Apex, Rocket League, Minecraft y otros se abren siempre con prioridad Alta (IFEO PerfOptions), sin depender de que la app esté abierta.', 'medium', GEXE.map((e) => R(LM, IFEO + e + '\\PerfOptions', 'CpuPriorityClass', 'DWORD', 3)), { tier: 2 });
add('ifeo-io-high', 'juegos', 'Prioridad de disco Alta para juegos', 'Los juegos leen assets y shaders antes que cualquier otra tarea de disco (IoPriority=3). Menos tirones al cargar mapas.', 'medium', GEXE.map((e) => R(LM, IFEO + e + '\\PerfOptions', 'IoPriority', 'DWORD', 3)), { tier: 2 });


// ───────── EXTRA (reales, reversibles) ─────────
add('hook-timeout', 'rendimiento', 'Tiempo máximo para hooks de teclado/ratón', 'LowLevelHooksTimeout=1000 ms: si un programa se cuelga procesando entradas, Windows lo suelta antes y el ratón no se traba.', 'safe', [R(CU, 'Control Panel\\Desktop', 'LowLevelHooksTimeout', 'DWORD', 1000)], { tier: 1 });
add('ntfs-lastaccess-off', 'almacenamiento', 'NTFS: no registrar el último acceso', 'Evita una escritura en disco cada vez que se lee un archivo. Menos desgaste y algo menos de latencia al cargar juegos.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\FileSystem', 'NtfsDisableLastAccessUpdate', 'DWORD', 0x80000001)], { tier: 1 });
add('ntfs-8dot3-off', 'almacenamiento', 'NTFS: sin nombres cortos 8.3', 'Deja de crear nombres DOS para cada archivo; carpetas con muchos archivos (juegos) listan más rápido.', 'medium', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\FileSystem', 'NtfsDisable8dot3NameCreation', 'DWORD', 1)], { tier: 2 });
add('bing-search-off', 'privacidad', 'Buscador de Windows sin Bing/web', 'El menú Inicio deja de enviar lo que escribes a Bing y deja de abrir resultados web: busca más rápido y solo en tu PC.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'BingSearchEnabled', 'DWORD', 0), R(CU, 'Software\\Policies\\Microsoft\\Windows\\Explorer', 'DisableSearchBoxSuggestions', 'DWORD', 1)], { tier: 1, ...EW });
add('consumer-features-off', 'privacidad', 'Sin apps y anuncios sugeridos por Windows', 'Windows deja de instalar apps promocionadas (juegos de relleno, TikTok…) y de mostrar sugerencias.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent', 'DisableWindowsConsumerFeatures', 'DWORD', 1), R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent', 'DisableSoftLanding', 'DWORD', 1)], { tier: 1, ...EW });
add('ceip-off', 'privacidad', 'Sin programa de mejora de experiencia (CEIP)', 'Apaga el envío de datos de uso a Microsoft y su recolector en segundo plano.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\SQMClient\\Windows', 'CEIPEnable', 'DWORD', 0)], { tier: 1, ...EW });
add('tcp-retrans', 'red', 'TCP: menos reintentos antes de cortar', 'TcpMaxDataRetransmissions=5: detecta antes una conexión caída y reconecta, en vez de quedarse colgado.', 'medium', [R(LM, 'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters', 'TcpMaxDataRetransmissions', 'DWORD', 5)], { tier: 2 });
add('tcp-timewait', 'red', 'TCP: liberar puertos más rápido', 'TcpTimedWaitDelay=30: los puertos se reutilizan en 30 s (por defecto 120 s). Evita agotarlos con muchas conexiones.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters', 'TcpTimedWaitDelay', 'DWORD', 30)], { tier: 1 });
add('tcp-ttl', 'red', 'TCP: TTL por defecto 64', 'DefaultTTL=64 (valor estándar usado por la mayoría de redes), mejor compatibilidad con servidores de juego.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters', 'DefaultTTL', 'DWORD', 64)], { tier: 2 });
add('icmp-redirect-off', 'red', 'Ignorar redirecciones ICMP', 'Evita que un equipo de la red cambie tus rutas (más seguro y estable).', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters', 'EnableICMPRedirect', 'DWORD', 0)], { tier: 2 });
add('paging-combine-off', 'memoria', 'Sin combinar páginas de memoria', 'DisablePageCombining=1: Windows deja de gastar CPU buscando páginas de RAM duplicadas.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management', 'DisablePageCombining', 'DWORD', 1)], { tier: 2 });
add('feeds-off', 'personalizacion', 'Sin «Noticias e intereses» en la barra', 'Quita el widget de noticias y el proceso web que lo alimenta.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Feeds', 'EnableFeeds', 'DWORD', 0)], { tier: 1, ...EW });


// ───────── SERVICIOS EXTRA (cada uno individual y reversible) ─────────
add('svc-trkwks', 'servicios', 'Seguimiento de vínculos de archivos', 'Rastrea accesos directos NTFS entre PCs de red. Casi nadie lo usa.', 'safe', [SVC('TrkWks')], { tier: 1, ...EW });
add('svc-stisvc', 'servicios', 'Adquisición de imágenes (escáner/cámara antigua)', 'Solo hace falta con escáneres antiguos.', 'safe', [SVC('stisvc')], { tier: 1, ...EW });
add('svc-wfdsconmgrsvc', 'servicios', 'Wi‑Fi Direct', 'Administrador de conexiones Wi‑Fi Direct, rara vez usado.', 'safe', [SVC('WFDSConMgrSvc')], { tier: 1, ...EW });
add('svc-printnotify', 'servicios', 'Notificaciones de impresora', 'Sin impresora no sirve. Si imprimes, déjalo.', 'safe', [SVC('PrintNotify')], { tier: 1, ...EW });
add('svc-lltdsvc', 'servicios', 'Descubrimiento de topología de red (LLTD)', 'Dibuja el mapa de red. Innecesario para jugar.', 'safe', [SVC('lltdsvc')], { tier: 1, ...EW });
add('svc-fdrespub', 'servicios', 'Publicación de recursos de red', 'Hace visible tu PC en la red local.', 'medium', [SVC('FDResPub')], { tier: 2 });
add('svc-fdphost', 'servicios', 'Host de descubrimiento de funciones', 'Descubre dispositivos de red; apágalo si no compartes archivos.', 'medium', [SVC('fdPHost')], { tier: 2 });
add('svc-p2pimsvc', 'servicios', 'Identidad de red P2P', 'Servicio P2P casi sin uso.', 'safe', [SVC('p2pimsvc')], { tier: 1, ...EW });
add('svc-pnrpsvc', 'servicios', 'Protocolo de resolución de nombres P2P', 'Servicio P2P casi sin uso.', 'safe', [SVC('PNRPsvc')], { tier: 1, ...EW });
add('svc-p2psvc', 'servicios', 'Agrupación de redes P2P', 'Servicio P2P casi sin uso.', 'safe', [SVC('p2psvc')], { tier: 1, ...EW });
add('svc-pnrpautoreg', 'servicios', 'Publicación de nombres P2P', 'Servicio P2P casi sin uso.', 'safe', [SVC('PNRPAutoReg')], { tier: 1, ...EW });
add('svc-sharedaccess', 'servicios', 'Conexión compartida a Internet (ICS)', 'Solo para compartir tu internet como zona wifi.', 'medium', [SVC('SharedAccess')], { tier: 2 });
add('svc-remoteaccess', 'servicios', 'Enrutamiento y acceso remoto', 'Servidor VPN/enrutador. No lo necesita un PC gamer.', 'safe', [SVC('RemoteAccess')], { tier: 1, ...EW });
add('svc-termservice', 'servicios', 'Escritorio remoto', 'Permite que se conecten a tu PC. Apágalo si no lo usas (más seguro).', 'medium', [SVC('TermService')], { tier: 2 });
add('svc-sessionenv', 'servicios', 'Configuración de Escritorio remoto', 'Complemento del Escritorio remoto.', 'medium', [SVC('SessionEnv')], { tier: 2 });
add('svc-umrdpservice', 'servicios', 'Redirector de puertos de Escritorio remoto', 'Complemento del Escritorio remoto.', 'medium', [SVC('UmRdpService')], { tier: 2 });
add('svc-vmicheartbeat', 'servicios', 'Hyper‑V: latido', 'Solo útil dentro de máquinas virtuales Hyper‑V.', 'safe', [SVC('vmicheartbeat')], { tier: 1, ...EW });
add('svc-vmickvpexchange', 'servicios', 'Hyper‑V: intercambio de datos', 'Solo útil dentro de máquinas virtuales Hyper‑V.', 'safe', [SVC('vmickvpexchange')], { tier: 1, ...EW });
add('svc-vmicshutdown', 'servicios', 'Hyper‑V: apagado de invitado', 'Solo útil dentro de máquinas virtuales Hyper‑V.', 'safe', [SVC('vmicshutdown')], { tier: 1, ...EW });
add('svc-vmictimesync', 'servicios', 'Hyper‑V: sincronización de hora', 'Solo útil dentro de máquinas virtuales Hyper‑V.', 'safe', [SVC('vmictimesync')], { tier: 1, ...EW });
add('svc-vmicvss', 'servicios', 'Hyper‑V: instantáneas VSS', 'Solo útil dentro de máquinas virtuales Hyper‑V.', 'safe', [SVC('vmicvss')], { tier: 1, ...EW });
add('svc-vmicrdv', 'servicios', 'Hyper‑V: virtualización de escritorio remoto', 'Solo útil dentro de máquinas virtuales Hyper‑V.', 'safe', [SVC('vmicrdv')], { tier: 1, ...EW });
add('svc-vmicguestinterface', 'servicios', 'Hyper‑V: interfaz de servicio invitado', 'Solo útil dentro de máquinas virtuales Hyper‑V.', 'safe', [SVC('vmicguestinterface')], { tier: 1, ...EW });
add('svc-walletservice', 'servicios', 'Cartera de Windows', 'Pagos NFC de la tienda; sin uso en un PC.', 'safe', [SVC('WalletService')], { tier: 1, ...EW });
add('svc-ajrouter', 'servicios', 'Enrutador AllJoyn (IoT)', 'Dispositivos IoT AllJoyn; casi nadie lo usa.', 'safe', [SVC('AJRouter')], { tier: 1, ...EW });
add('svc-alg', 'servicios', 'Puerta de enlace de capa de aplicación', 'Solo para ICS. Sin uso normal.', 'safe', [SVC('ALG')], { tier: 1, ...EW });
add('svc-naturalauthentication', 'servicios', 'Autenticación natural', 'Desbloqueo por proximidad. No sirve en un PC de escritorio.', 'safe', [SVC('NaturalAuthentication')], { tier: 1, ...EW });
add('svc-smsrouter', 'servicios', 'Enrutador de SMS de Microsoft', 'Mensajes de texto vía el móvil; sin uso.', 'safe', [SVC('SmsRouter')], { tier: 1, ...EW });
add('svc-snmptrap', 'servicios', 'Captura SNMP', 'Monitoreo de red empresarial.', 'safe', [SVC('SNMPTRAP')], { tier: 1, ...EW });
add('svc-svsvc', 'servicios', 'Comprobación de puntos de restauración de volumen', 'Solo repara puntos de volumen.', 'medium', [SVC('svsvc')], { tier: 2 });
add('svc-tzautoupdate', 'servicios', 'Zona horaria automática', 'Cambia la zona según tu ubicación. Si no viajas, sobra.', 'safe', [SVC('tzautoupdate')], { tier: 1, ...EW });
add('svc-uevagentservice', 'servicios', 'Virtualización de experiencia de usuario (UE‑V)', 'Servicio empresarial.', 'safe', [SVC('UevAgentService')], { tier: 1, ...EW });
add('svc-webclient', 'servicios', 'Cliente web (WebDAV)', 'Acceso WebDAV; también reduce una superficie de ataque.', 'safe', [SVC('WebClient')], { tier: 1, ...EW });
add('svc-wpcmonsvc', 'servicios', 'Control parental', 'Apágalo si no usas control parental.', 'safe', [SVC('WpcMonSvc')], { tier: 1, ...EW });
add('svc-shpamsvc', 'servicios', 'Agente de directivas de Shared PC', 'Servicio de PC compartido empresarial.', 'safe', [SVC('shpamsvc')], { tier: 1, ...EW });
add('svc-diagnosticshub-standardcollector-service', 'servicios', 'Recolector del Hub de diagnóstico', 'Recolecta trazas de rendimiento para desarrolladores.', 'safe', [SVC('diagnosticshub.standardcollector.service')], { tier: 1, ...EW });
add('svc-dusmsvc', 'servicios', 'Uso de datos', 'Cuenta el consumo de datos por red; sin impacto para jugar.', 'medium', [SVC('DusmSvc')], { tier: 2 });
add('svc-cdpsvc', 'servicios', 'Plataforma de dispositivos conectados', 'Sincroniza con el móvil. Apágalo si no usas «Enviar a dispositivo».', 'medium', [SVC('CDPSvc', 3)], { tier: 2 });
add('svc-mixedrealityopenxrsvc', 'servicios', 'Realidad mixta OpenXR', 'Solo con gafas de Windows Mixed Reality.', 'safe', [SVC('MixedRealityOpenXRSvc')], { tier: 1, ...EW });
add('svc-semgrsvc', 'servicios', 'Administrador de pagos NFC', 'Pagos NFC; sin uso en PC.', 'safe', [SVC('SEMgrSvc')], { tier: 1, ...EW });
add('svc-troubleshootingsvc', 'servicios', 'Servicio de solución de problemas recomendada', 'Windows ejecuta solucionadores solo; no hace falta.', 'safe', [SVC('TroubleshootingSvc')], { tier: 1, ...EW });
add('svc-rmsvc', 'servicios', 'Administración de radio', 'Apaga wifi/bluetooth desde el modo avión. Déjalo en portátiles.', 'medium', [SVC('RmSvc', 3)], { tier: 2 });
add('svc-dosvc', 'servicios', 'Optimización de distribución (descargas P2P de Windows)', 'Windows envía partes de updates a otros PCs usando tu ancho de banda.', 'safe', [SVC('DoSvc', 3)], { tier: 1, ...EW });
add('svc-inventorysvc', 'servicios', 'Inventario y compatibilidad', 'Recolecta datos de apps instaladas.', 'safe', [SVC('InventorySvc')], { tier: 1, ...EW });

// ───────── RATÓN Y TECLADO EXTRA ─────────
const CPA = 'Control Panel\\Accessibility\\';
add('mouse-trails-off', 'input', 'Ratón: sin estela del puntero', 'Quita el efecto de estela; menos trabajo para el escritorio y el cursor responde limpio.', 'safe', [R(CU, 'Control Panel\\Mouse', 'MouseTrails', 'SZ', '0')], { tier: 1, ...EW });
add('mouse-snap-off', 'input', 'Ratón: sin salto automático al botón', 'Desactiva «Ajustar al botón predeterminado», que mueve el puntero solo.', 'safe', [R(CU, 'Control Panel\\Mouse', 'SnapToDefaultButton', 'SZ', '0')], { tier: 1, ...EW });
add('mouse-hover-fast', 'input', 'Ratón: tooltips y hover instantáneos', 'MouseHoverTime=10 ms: la interfaz reacciona al instante al pasar el ratón.', 'safe', [R(CU, 'Control Panel\\Mouse', 'MouseHoverTime', 'SZ', '10')], { tier: 1, ...EW });
add('mousekeys-off', 'input', 'Sin atajo de «Teclas del ratón»', 'Evita el aviso de accesibilidad al pulsar Alt+Mayús+BloqNum en pleno juego.', 'safe', [R(CU, CPA + 'MouseKeys', 'Flags', 'SZ', '186')], { tier: 1, ...EW });
add('kb-hotkey-lang-off', 'input', 'Sin atajo para cambiar idioma (Alt+Mayús)', 'Evita cambiar sin querer el idioma del teclado en medio de una partida.', 'safe', [R(CU, 'Keyboard Layout\\Toggle', 'Hotkey', 'SZ', '3'), R(CU, 'Keyboard Layout\\Toggle', 'Language Hotkey', 'SZ', '3'), R(CU, 'Keyboard Layout\\Toggle', 'Layout Hotkey', 'SZ', '3')], { tier: 1, ...EW });
add('kb-winkey-hotkeys', 'input', 'Teclado: sin autocorrección ni sugerencias', 'Quita la autocorrección y el resaltado de errores del teclado de Windows.', 'safe', [R(CU, 'Software\\Microsoft\\TabletTip\\1.7', 'EnableAutocorrection', 'DWORD', 0), R(CU, 'Software\\Microsoft\\TabletTip\\1.7', 'EnableSpellchecking', 'DWORD', 0)], { tier: 1, ...EW });
add('amd-extevents-off', 'gpu', 'AMD: servicio de eventos externos', 'Desactiva «AMD External Events Utility» (solo sirve para teclas de acceso rápido de la gráfica).', 'safe', [SVC('AMD External Events Utility')], { tier: 1, ...EW });
add('nv-container-net', 'gpu', 'NVIDIA: servicio de red del contenedor', 'Apaga «NVIDIA LocalSystem Container» de red; solo lo usa GeForce Experience para streaming a Shield.', 'medium', [SVC('NvContainerNetworkService')], { tier: 2 });


// ───────── EXTRA 2: PRIVACIDAD, EXPLORADOR, SEGURIDAD, RENDIMIENTO ─────────
add('priv-lang', 'privacidad', 'Sitios web sin acceso a tu lista de idiomas', 'Evita que las webs lean tus idiomas.', 'safe', [R(CU, 'Control Panel\\International\\User Profile', 'HttpAcceptLanguageOptOut', 'DWORD', 1)], { tier: 1, ...EW });
add('priv-suggest', 'privacidad', 'Sin sugerencias en Configuración', 'Quita anuncios dentro de Configuración.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', 'SubscribedContent-338393Enabled', 'DWORD', 0)], { tier: 1, ...EW });
add('priv-lockads', 'privacidad', 'Sin anuncios en la pantalla de bloqueo', 'Quita sugerencias y publicidad de la pantalla de bloqueo.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', 'RotatingLockScreenOverlayEnabled', 'DWORD', 0)], { tier: 1, ...EW });
add('priv-startads', 'privacidad', 'Sin apps sugeridas en Inicio', 'Quita las sugerencias del menú Inicio.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', 'SubscribedContent-338388Enabled', 'DWORD', 0)], { tier: 1, ...EW });
add('priv-smartscreen-apps', 'privacidad', 'SmartScreen no envía lo que ejecutas', 'Reduce el envío de apps abiertas a Microsoft.', 'medium', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\AppHost', 'EnableWebContentEvaluation', 'DWORD', 0)], { tier: 2 });
add('priv-msgsync', 'privacidad', 'Sin sincronización de mensajes', 'Apaga la sincronización de mensajes en la nube.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Messaging', 'AllowMessageSync', 'DWORD', 0)], { tier: 1, ...EW });
add('priv-themesync', 'privacidad', 'Sin sincronizar ajustes con la cuenta Microsoft', 'Apaga la sincronización de temas, contraseñas y ajustes.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\SettingSync', 'DisableSettingSync', 'DWORD', 2)], { tier: 1, ...EW });
add('priv-camera-lock', 'privacidad', 'Sin cámara en la pantalla de bloqueo', 'Evita usar la cámara desde la pantalla de bloqueo.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization', 'NoLockScreenCamera', 'DWORD', 1)], { tier: 1, ...EW });
add('vis-acrylic', 'visual', 'Sin efecto acrílico en el login', 'Quita el desenfoque acrílico del inicio de sesión.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'DisableAcrylicBackgroundOnLogon', 'DWORD', 1)], { tier: 1, ...EW });
add('vis-snap-assist', 'visual', 'Sin asistente de ajuste al arrastrar ventanas', 'Quita las sugerencias de ventanas al encajar.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'SnapAssist', 'DWORD', 0)], { tier: 1, ...EW });
add('vis-balloon', 'visual', 'Sin notificaciones de consejos de Windows', 'Quita «Obtén consejos al usar Windows».', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', 'SubscribedContent-338389Enabled', 'DWORD', 0)], { tier: 1, ...EW });
add('vis-notif-off', 'visual', 'Sin notificaciones emergentes de apps', 'No interrumpen juegos ni pantalla completa.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications', 'ToastEnabled', 'DWORD', 0)], { tier: 1, ...EW });
add('vis-quiet', 'visual', 'Horas de concentración activas', 'Silencia avisos mientras juegas en pantalla completa.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings', 'NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK', 'DWORD', 0)], { tier: 1, ...EW });
add('sys-lockscreen-slide', 'seguridad', 'Sin sugerencias de Windows Spotlight', 'Fondo fijo en vez de Spotlight en el bloqueo.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent', 'DisableWindowsSpotlightFeatures', 'DWORD', 1)], { tier: 1, ...EW });
add('sys-maps-update', 'actualizaciones', 'Sin actualizaciones automáticas de mapas', 'Los mapas offline no se actualizan solos.', 'safe', [R(LM, 'SYSTEM\\Maps', 'AutoUpdateEnabled', 'DWORD', 0)], { tier: 1 });
add('sys-wu-p2p', 'actualizaciones', 'Sin compartir actualizaciones por Internet', 'Optimización de distribución solo en tu red local.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization', 'DODownloadMode', 'DWORD', 0)], { tier: 1 });
add('perf-bsod-auto', 'rendimiento', 'No reiniciar solo tras un pantallazo azul', 'Te deja leer el código de error (útil para el diagnóstico).', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\CrashControl', 'AutoReboot', 'DWORD', 0)], { tier: 1 });
add('perf-dump-small', 'rendimiento', 'Volcado de memoria mínimo', 'Un crash guarda un archivo pequeño en vez de gigas.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\CrashControl', 'CrashDumpEnabled', 'DWORD', 3)], { tier: 1 });
add('perf-ntfs-encrypt', 'almacenamiento', 'NTFS: sin cifrado de rutas', 'Desactiva el cifrado de rutas EFS si no lo usas.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\FileSystem', 'NtfsDisableEncryption', 'DWORD', 1)], { tier: 1 });
add('perf-sleepstudy', 'energia', 'Sin Sleep Study', 'Evita la recolección de datos de suspensión.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\Power', 'SleepStudyDisabled', 'DWORD', 1)], { tier: 1 });
add('perf-bgproc-limit', 'rendimiento', 'Más hilos para colas de E/S', 'IoPriority de procesos de primer plano más alto.', 'medium', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'IRQ8Priority', 'DWORD', 1)], { tier: 2 });

// ───────── KERNEL Y TIMER ─────────
add('timer-resolution', 'kernel', 'Resolución del temporizador global (Win11)', 'Permite que cada app mantenga timer de 0,5 ms aunque esté minimizada. Solo Windows 11 / Server 2022+.', 'medium', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel', 'GlobalTimerResolutionRequests', 'DWORD', 1)], { req: 'win11', reboot: 1, tier: 2, noLaptop: 1 });
add('dynamic-tick-off', 'kernel', 'Desactivar tick dinámico', 'bcdedit disabledynamictick: el reloj del sistema no entra en modo ahorro. Efecto variable según CPU: mide antes y después.', 'advanced', [bcd('disabledynamictick', 'yes', 'Yes|S[ií]')], { reboot: 1, tier: 3, noLaptop: 1 });
add('bcd-platformclock-off', 'kernel', 'Quitar useplatformclock (HPET forzado)', 'Elimina el uso forzado del temporizador HPET si lo tenías activado; el reloj TSC es mucho más rápido.', 'safe', [{ t: 'ps',
  s: PS`[bool]((bcdedit /enum '{current}') -match 'useplatformclock\s+(Yes|S[ií])')`, a: 'bcdedit /deletevalue useplatformclock',
  r: PS`if($prev -eq 'True'){ bcdedit /set useplatformclock yes }`, c: PS`-not [bool]((bcdedit /enum '{current}') -match 'useplatformclock\s+(Yes|S[ií])')` }], { reboot: 1, tier: 1 });
add('bcd-platformtick', 'kernel', 'Forzar tick de plataforma (useplatformtick)', 'bcdedit useplatformtick yes: reloj de plataforma estable para el timer del sistema.', 'advanced', [bcd('useplatformtick', 'yes', 'Yes|S[ií]')], { reboot: 1, tier: 3, noLaptop: 1 });
add('bcd-tscsync', 'kernel', 'Sincronización TSC mejorada', 'tscsyncpolicy=enhanced: sincroniza los contadores de tiempo entre núcleos.', 'medium', [bcd('tscsyncpolicy', 'enhanced', 'Enhanced')], { reboot: 1, tier: 3 });
add('bcd-quietboot', 'kernel', 'Arranque sin animación de Windows', 'bootux=disabled: omite el logotipo animado de arranque.', 'safe', [{ t: 'ps', a: 'bcdedit /set bootux disabled', r: 'bcdedit /set bootux standard', c: PS`[bool]((bcdedit /enum '{current}') -match 'bootux\s+Disabled')` }], { reboot: 1, eco: 1, work: 1 });
add('bcd-timeout', 'kernel', 'Menú de arranque: espera de 3 s', 'Reduce la espera del selector de sistemas operativos de 30 s a 3 s.', 'safe', [{ t: 'ps', a: 'bcdedit /timeout 3', r: 'bcdedit /timeout 30', c: PS`[bool]((bcdedit /enum '{bootmgr}') -match 'timeout\s+3\b')` }], { eco: 1, work: 1 });

// ───────── MEMORIA ─────────
add('svchost-split', 'memoria', 'Menos procesos svchost (agrupar servicios)', 'SvcHostSplitThresholdInKB = tu RAM: Windows agrupa servicios en menos procesos y libera cientos de MB.', 'medium', [{ t: 'ps',
  s: "(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control').SvcHostSplitThresholdInKB",
  a: "$kb=[int][math]::Min((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1KB,[int]::MaxValue); Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control' -Name SvcHostSplitThresholdInKB -Value $kb -Type DWord",
  r: "if($prev -match '^\\d+$'){ Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control' -Name SvcHostSplitThresholdInKB -Value ([int]$prev) -Type DWord } else { Remove-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control' -Name SvcHostSplitThresholdInKB -ErrorAction SilentlyContinue }",
  c: "(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control').SvcHostSplitThresholdInKB -ge ([math]::Min((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1KB,[int]::MaxValue) - 1024)" }], { reboot: 1, tier: 1, eco: 1, warn: 'Úsalo con 8 GB de RAM o más. Si un servicio falla, ya no se aísla del resto.' });
add('memory-compression-off', 'memoria', 'Desactivar compresión de memoria', 'Windows deja de comprimir páginas de RAM: menos CPU, más uso de RAM. Mejor con 16 GB o más.', 'medium', [{ t: 'ps', a: 'Disable-MMAgent -MemoryCompression', r: 'Enable-MMAgent -MemoryCompression', c: '-not (Get-MMAgent).MemoryCompression' }], { reboot: 1, tier: 2, noLaptop: 1 });
add('prefetch-off', 'memoria', 'Desactivar Prefetch / Superfetch (registro)', 'Quita la precarga de apps en RAM. Recomendado en SSD/NVMe.', 'medium', [R(LM, MM + '\\PrefetchParameters', 'EnablePrefetcher', 'DWORD', 0), R(LM, MM + '\\PrefetchParameters', 'EnableSuperfetch', 'DWORD', 0)], { reboot: 1, eco: 1, tier: 1, warn: 'En un HDD las apps abrirán más lento.' });
add('disable-paging-executive', 'memoria', 'Mantener el kernel en RAM (DisablePagingExecutive)', 'Drivers y kernel no se envían al archivo de paginación. Necesita 16 GB de RAM o más.', 'medium', [R(LM, MM, 'DisablePagingExecutive', 'DWORD', 1)], { reboot: 1, tier: 2, warn: 'Con poca RAM puede causar falta de memoria.' });
add('large-system-cache', 'memoria', 'Caché de archivos grande (LargeSystemCache)', 'Dedica más RAM a la caché de archivos del sistema. Pensado para servidores; en PCs de juego rara vez ayuda.', 'advanced', [R(LM, MM, 'LargeSystemCache', 'DWORD', 1)], { reboot: 1, warn: 'En Windows de escritorio puede reducir la RAM disponible para juegos.' });
add('ntfs-memory-usage', 'memoria', 'NTFS: más memoria para caché de metadatos', 'NtfsMemoryUsage=2: acelera discos con muchos archivos pequeños.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\FileSystem', 'NtfsMemoryUsage', 'DWORD', 2)], { reboot: 1, tier: 1 });

// ───────── ALMACENAMIENTO ─────────
add('ntfs-lastaccess', 'almacenamiento', 'NTFS: no registrar último acceso', 'Windows no escribe la fecha de último acceso en cada lectura. Menos escrituras a disco.', 'safe', [{ t: 'ps', a: 'fsutil behavior set disablelastaccess 1', r: 'fsutil behavior set disablelastaccess 2', c: "[bool]((fsutil behavior query disablelastaccess) -match '=\\s*[13]\\b')" }], { tier: 1, eco: 1 });
add('trim-on', 'almacenamiento', 'Asegurar TRIM activo en SSD', 'Garantiza que Windows envíe TRIM al SSD para mantener su velocidad.', 'safe', [{ t: 'ps',
  s: "[regex]::Match((fsutil behavior query DisableDeleteNotify | Out-String),'=\\s*(\\d)').Groups[1].Value", a: 'fsutil behavior set DisableDeleteNotify 0',
  r: "if($prev -match '^\\d$'){ fsutil behavior set DisableDeleteNotify $prev }", c: "[regex]::Match((fsutil behavior query DisableDeleteNotify | Out-String),'=\\s*(\\d)').Groups[1].Value -eq '0'" }], { tier: 1, eco: 1 });
add('storage-sense-off', 'almacenamiento', 'Desactivar Sensor de almacenamiento', 'Windows no borra archivos temporales ni la papelera por su cuenta.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy', '01', 'DWORD', 0)], { eco: 1, work: 1 });
add('reserved-storage-off', 'almacenamiento', 'Liberar almacenamiento reservado (~7 GB)', 'Windows deja de reservar espacio para actualizaciones.', 'medium', [R(LM, 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ReserveManager', 'ShippedWithReserves', 'DWORD', 0)], { reboot: 1, warn: 'Si el disco se llena, una actualización de Windows puede fallar.' });

// ───────── EFECTOS VISUALES ─────────
add('visualfx-performance', 'visual', 'Efectos visuales: mejor rendimiento', 'Selecciona "Ajustar para obtener el mejor rendimiento".', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting', 'DWORD', 2)], { relog: 1, tier: 1, eco: 1 });
add('userpref-mask-fast', 'visual', 'Máscara de efectos: modo rápido', 'UserPreferencesMask de rendimiento: sin sombras de cursor, fundidos ni suavizado de menús.', 'safe', [R(CU, 'Control Panel\\Desktop', 'UserPreferencesMask', 'BINARY', '9012038010000000')], { relog: 1, tier: 1, eco: 1 });
add('drag-fullwindow-off', 'visual', 'No mostrar contenido al arrastrar ventanas', 'Arrastras solo el contorno, más fluido en equipos modestos.', 'safe', [R(CU, 'Control Panel\\Desktop', 'DragFullWindows', 'SZ', '0')], { relog: 1, eco: 1 });
add('listview-shadow-off', 'visual', 'Sin sombras ni selección translúcida en listas', 'Quita ListviewShadow y ListviewAlphaSelect.', 'safe', [R(CU, EXP, 'ListviewShadow', 'DWORD', 0), R(CU, EXP, 'ListviewAlphaSelect', 'DWORD', 0)], { relog: 1, eco: 1 });
add('hover-fast', 'visual', 'Vistas previas de la barra al instante', 'La miniatura de la barra de tareas aparece sin esperar.', 'safe', [R(CU, EXP, 'ExtendedUIHoverTime', 'DWORD', 1)], { relog: 1 });
add('icons-only', 'visual', 'Mostrar iconos en lugar de miniaturas', 'El Explorador no genera miniaturas: carpetas con muchas imágenes cargan al instante.', 'medium', [R(CU, EXP, 'IconsOnly', 'DWORD', 1)], { relog: 1, eco: 1 });
add('no-shake-minimize', 'visual', 'Desactivar "agitar para minimizar"', 'Evita minimizar ventanas por accidente al mover una.', 'safe', [R(CU, EXP, 'DisallowShaking', 'DWORD', 1)], { work: 1 });
add('wallpaper-quality', 'visual', 'Fondo de escritorio sin compresión', 'JPEGImportQuality=100: el fondo no se degrada.', 'safe', [R(CU, 'Control Panel\\Desktop', 'JPEGImportQuality', 'DWORD', 100)], { relog: 1 });

// ───────── SERVICIOS ─────────
add('svc-diagtrack', 'servicios', 'Desactivar servicio de telemetría (DiagTrack)', 'Experiencias del usuario conectado y telemetría. Menos CPU/disco/red en segundo plano.', 'safe', [SVC('DiagTrack'), SVC('dmwappushservice')], { ...EW, tier: 1 });
add('svc-sysmain', 'servicios', 'Desactivar SysMain (Superfetch)', 'Útil en SSD: evita lecturas de precarga que no hacen falta. En un HDD puede hacer que las apps abran más lento.', 'medium', [SVC('SysMain')], { eco: 1, tier: 1 });
add('svc-wsearch', 'servicios', 'Desactivar indexado de búsqueda (Windows Search)', 'Menos uso de disco, pero la búsqueda del menú Inicio y del Explorador será más lenta.', 'medium', [SVC('WSearch')], { warn: 'Deja de funcionar: la búsqueda rápida de archivos.' });
add('svc-misc', 'servicios', 'Desactivar servicios que casi nadie usa', 'Fax, Demo de tienda, Mapas descargados, Uso compartido de Media Player, Geolocalización y Hub de diagnóstico.', 'safe',
  [SVC('Fax'), SVC('RetailDemo'), SVC('MapsBroker'), SVC('WMPNetworkSvc'), SVC('lfsvc'), SVC('diagnosticshub.standardcollector.service')], { ...EW, tier: 1 });
add('svc-wersvc', 'servicios', 'Desactivar informe de errores de Windows', 'Evita que WER consuma CPU y disco tras un cierre inesperado.', 'safe', [SVC('WerSvc'), SVC('Wercplsupport'), R(LM, 'SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled', 'DWORD', 1)], { ...EW, tier: 1 });
add('svc-xbox', 'servicios', 'Desactivar servicios de Xbox', 'Xbox Live Auth, Game Save y Network. Solo si NO usas Game Pass, Xbox App ni juegos de Microsoft Store.', 'advanced', [SVC('XblAuthManager'), SVC('XblGameSave'), SVC('XboxNetApiSvc'), SVC('XboxGipSvc')], { warn: 'Deja de funcionar: juegos de Xbox/Microsoft Store y guardado en la nube de Xbox.' });
add('svc-pcasvc', 'servicios', 'Desactivar Asistente de compatibilidad (PcaSvc)', 'Analiza programas y consume recursos en segundo plano.', 'safe', [SVC('PcaSvc')], { ...EW, tier: 1 });
add('svc-tablet', 'servicios', 'Desactivar teclado táctil y escritura a mano', 'TabletInputService. Solo si no usas pantalla táctil ni lápiz.', 'medium', [SVC('TabletInputService')], { eco: 1, warn: 'El teclado en pantalla y la escritura a mano dejarán de funcionar.' });
add('svc-wu-manual', 'servicios', 'Windows Update en manual', 'El servicio solo arranca cuando buscas actualizaciones; no corre siempre.', 'medium', [SVC('wuauserv', 3), SVC('UsoSvc', 3)], { work: 1 });
add('svc-bits-manual', 'servicios', 'BITS en manual', 'El servicio de transferencia en segundo plano arranca solo bajo demanda.', 'safe', [SVC('BITS', 3)], EW);
add('svc-phone', 'servicios', 'Desactivar servicio de teléfono vinculado', 'PhoneSvc. Solo si no usas "Vincular teléfono".', 'safe', [SVC('PhoneSvc')], EW);
add('svc-remote-registry', 'servicios', 'Desactivar Registro remoto', 'Cierra el acceso remoto al registro desde la red.', 'safe', [SVC('RemoteRegistry')], EW);
add('svc-smartcard', 'servicios', 'Desactivar tarjetas inteligentes', 'SCardSvr, ScDeviceEnum, SCPolicySvc. Solo si no usas lectores de DNI/tarjeta.', 'safe', [SVC('SCardSvr'), SVC('ScDeviceEnum'), SVC('SCPolicySvc')], EW);
add('svc-cscservice', 'servicios', 'Desactivar archivos sin conexión', 'CscService y Servicio de carpetas de trabajo.', 'safe', [SVC('CscService'), SVC('workfolderssvc')], EW);
add('svc-fhsvc', 'servicios', 'Desactivar Historial de archivos', 'Si usas otro sistema de copias de seguridad.', 'safe', [SVC('fhsvc')], EW);
add('svc-wisvc', 'servicios', 'Desactivar Windows Insider', 'wisvc no hace falta si no eres Insider.', 'safe', [SVC('wisvc')], EW);
add('svc-updaters-3rd', 'servicios', 'Desactivar actualizadores de Edge, Chrome y Adobe', 'edgeupdate, gupdate, GoogleChromeElevationService y Adobe ARM dejan de arrancar solos.', 'safe',
  [SVC('edgeupdate'), SVC('edgeupdatem'), SVC('gupdate'), SVC('gupdatem'), SVC('GoogleChromeElevationService'), SVC('AdobeARMservice')], { ...EW, warn: 'Los navegadores se actualizarán solo cuando los abras.' });
add('svc-sensors', 'servicios', 'Desactivar sensores (rotación automática, luz ambiente)', 'SensrSvc y SensorService.', 'medium', [SVC('SensrSvc'), SVC('SensorService')], { warn: 'La rotación automática y el brillo adaptativo dejarán de funcionar.' });
add('svc-ssdp-upnp', 'servicios', 'Desactivar SSDP y UPnP', 'Evita descubrimiento de dispositivos de red (superficie de ataque).', 'medium', [SVC('SSDPSRV'), SVC('upnphost')], { warn: 'Algunos juegos y consolas usan UPnP para abrir puertos automáticamente.' });
add('svc-iphlpsvc', 'servicios', 'Desactivar Asistente IP (túneles IPv6)', 'iphlpsvc: Teredo/6to4 y túneles. No lo necesitas en IPv4.', 'medium', [SVC('iphlpsvc')], { warn: 'Rompe Teredo y algunos juegos Xbox/Microsoft Store que lo usan.' });
add('svc-diag-policy', 'servicios', 'Desactivar diagnóstico y solucionadores de problemas', 'DPS, WdiServiceHost y WdiSystemHost.', 'medium', [SVC('DPS'), SVC('WdiServiceHost'), SVC('WdiSystemHost')], { warn: 'Los solucionadores de problemas de Windows dejarán de funcionar.' });
add('svc-spooler', 'servicios', 'Desactivar cola de impresión', 'Spooler: ahorra RAM y cierra una puerta de ataque clásica.', 'advanced', [SVC('Spooler')], { warn: 'No podrás imprimir ni usar impresoras PDF virtuales.' });
add('svc-hotspot', 'servicios', 'Desactivar punto de acceso móvil', 'icssvc: compartir internet por Wi-Fi.', 'advanced', [SVC('icssvc')], { warn: 'No podrás compartir tu conexión.' });
add('svc-bluetooth', 'servicios', 'Desactivar Bluetooth', 'bthserv y servicios asociados.', 'advanced', [SVC('bthserv'), SVC('BluetoothUserService')], { warn: 'Auriculares, ratones y mandos Bluetooth no funcionarán.' });

// ───────── TAREAS PROGRAMADAS ─────────
add('task-telemetry', 'tareas', 'Desactivar tareas de telemetría de Microsoft', 'Compatibility Appraiser, ProgramDataUpdater, Consolidator, UsbCeip, StartupAppTask y recolector de disco.', 'safe',
  [TASK('\\Microsoft\\Windows\\Application Experience\\', 'Microsoft Compatibility Appraiser'), TASK('\\Microsoft\\Windows\\Application Experience\\', 'ProgramDataUpdater'), TASK('\\Microsoft\\Windows\\Application Experience\\', 'StartupAppTask'),
   TASK('\\Microsoft\\Windows\\Customer Experience Improvement Program\\', 'Consolidator'), TASK('\\Microsoft\\Windows\\Customer Experience Improvement Program\\', 'UsbCeip'), TASK('\\Microsoft\\Windows\\DiskDiagnostic\\', 'Microsoft-Windows-DiskDiagnosticDataCollector')], { ...EW, tier: 1 });
add('task-feedback', 'tareas', 'Desactivar tareas de comentarios (Siuf)', 'DmClient y DmClientOnScenarioDownload.', 'safe', [TASK('\\Microsoft\\Windows\\Feedback\\Siuf\\', 'DmClient'), TASK('\\Microsoft\\Windows\\Feedback\\Siuf\\', 'DmClientOnScenarioDownload')], EW);
add('task-error-reporting', 'tareas', 'Desactivar tarea de informe de errores', 'QueueReporting de Windows Error Reporting.', 'safe', [TASK('\\Microsoft\\Windows\\Windows Error Reporting\\', 'QueueReporting')], EW);
add('task-maps', 'tareas', 'Desactivar tareas de Mapas', 'MapsUpdateTask y MapsToastTask.', 'safe', [TASK('\\Microsoft\\Windows\\Maps\\', 'MapsUpdateTask'), TASK('\\Microsoft\\Windows\\Maps\\', 'MapsToastTask')], EW);
add('task-office-telemetry', 'tareas', 'Desactivar telemetría de Office', 'OfficeTelemetryAgent (si tienes Microsoft Office).', 'safe',
  [TASK('\\Microsoft\\Office\\', 'OfficeTelemetryAgentFallBack'), TASK('\\Microsoft\\Office\\', 'OfficeTelemetryAgentLogOn'), TASK('\\Microsoft\\Office\\', 'OfficeTelemetryAgentFallBack2016'), TASK('\\Microsoft\\Office\\', 'OfficeTelemetryAgentLogOn2016')], EW);
add('task-updaters-3rd', 'tareas', 'Desactivar tareas de actualización de Edge y Google', 'MicrosoftEdgeUpdate y GoogleUpdate programados.', 'safe',
  [TASK('\\', 'MicrosoftEdgeUpdateTaskMachineCore'), TASK('\\', 'MicrosoftEdgeUpdateTaskMachineUA'), TASK('\\', 'GoogleUpdateTaskMachineCore'), TASK('\\', 'GoogleUpdateTaskMachineUA')], EW);
add('task-sysmain', 'tareas', 'Desactivar tareas de SysMain', 'ResPriStaticDbSync y WsSwapAssessmentTask.', 'safe', [TASK('\\Microsoft\\Windows\\Sysmain\\', 'ResPriStaticDbSync'), TASK('\\Microsoft\\Windows\\Sysmain\\', 'WsSwapAssessmentTask')], EW);
add('task-diagnosis', 'tareas', 'Desactivar tareas de diagnóstico', 'Diagnosis Scheduled y Power Efficiency AnalyzeSystem.', 'safe', [TASK('\\Microsoft\\Windows\\Diagnosis\\', 'Scheduled'), TASK('\\Microsoft\\Windows\\Power Efficiency Diagnostics\\', 'AnalyzeSystem')], EW);
add('task-defrag', 'tareas', 'Desactivar desfragmentación programada', 'Solo recomendado en SSD (Windows ya hace TRIM). No lo hagas con HDD.', 'medium', [TASK('\\Microsoft\\Windows\\Defrag\\', 'ScheduledDefrag')], { warn: 'En un disco duro mecánico se fragmentará con el tiempo.' });
add('task-xbox', 'tareas', 'Desactivar tarea de guardado de Xbox', 'XblGameSaveTask.', 'advanced', [TASK('\\Microsoft\\XblGameSave\\', 'XblGameSaveTask')], { warn: 'Los guardados en la nube de Xbox no se sincronizarán.' });
add('task-cloudexp', 'tareas', 'Desactivar tarea de Cloud Experience', 'CreateObjectTask de CloudExperienceHost.', 'safe', [TASK('\\Microsoft\\Windows\\CloudExperienceHost\\', 'CreateObjectTask')], EW);
add('task-wu-scheduled', 'tareas', 'Desactivar inicio programado de Windows Update', 'Scheduled Start no busca actualizaciones solo.', 'medium', [TASK('\\Microsoft\\Windows\\WindowsUpdate\\', 'Scheduled Start')], { warn: 'Tendrás que buscar actualizaciones manualmente.' });

// ───────── PRIVACIDAD Y TELEMETRÍA ─────────
add('telemetry-policy', 'privacidad', 'Reducir telemetría al mínimo', 'Política AllowTelemetry=0 (en Windows Home/Pro se aplica el mínimo permitido).', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', 'DWORD', 0)], { ...EW, tier: 1 });
add('adid-off', 'privacidad', 'Desactivar ID de publicidad', 'Las apps no pueden seguirte con un identificador publicitario.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled', 'DWORD', 0)], EW);
add('activity-off', 'privacidad', 'Desactivar historial de actividad', 'Windows deja de registrar y subir tu actividad (Timeline).', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'EnableActivityFeed', 'DWORD', 0), R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'PublishUserActivities', 'DWORD', 0), R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'UploadUserActivities', 'DWORD', 0)], EW);
add('suggestions-off', 'privacidad', 'Quitar sugerencias, anuncios y apps preinstaladas', 'Sin anuncios en Inicio, pantalla de bloqueo ni "consejos" de Windows. No reinstala apps basura.', 'safe',
  [R(CU, CDM, 'SubscribedContent-338388Value', 'DWORD', 0), R(CU, CDM, 'SubscribedContent-338389Value', 'DWORD', 0), R(CU, CDM, 'SubscribedContent-353698Value', 'DWORD', 0), R(CU, CDM, 'SystemPaneSuggestionsEnabled', 'DWORD', 0), R(CU, CDM, 'SilentInstalledAppsEnabled', 'DWORD', 0), R(CU, CDM, 'PreInstalledAppsEnabled', 'DWORD', 0), R(CU, CDM, 'ContentDeliveryAllowed', 'DWORD', 0), R(CU, CDM, 'RotatingLockScreenEnabled', 'DWORD', 0)], EW);
add('copilot-off', 'privacidad', 'Desactivar Copilot', 'Oculta y desactiva Windows Copilot.', 'safe', [R(CU, 'Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', 'DWORD', 1)], EW);
add('widgets-off', 'privacidad', 'Desactivar Widgets y Noticias', 'Detiene el proceso de Widgets (usa RAM y red).', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Dsh', 'AllowNewsAndInterests', 'DWORD', 0)], { ...EW, tier: 1 });
add('recall-ai-off', 'privacidad', 'Desactivar Recall e IA de análisis de datos', 'DisableAIDataAnalysis: Windows no captura ni analiza tu actividad con IA.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis', 'DWORD', 1), R(CU, 'Software\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis', 'DWORD', 1)], EW);
add('location-off', 'privacidad', 'Desactivar ubicación de Windows', 'Las apps no pueden consultar tu ubicación.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors', 'DisableLocation', 'DWORD', 1)], { ...EW, warn: 'Mapas y el clima de Windows no sabrán dónde estás.' });
add('tailored-off', 'privacidad', 'Sin experiencias personalizadas con diagnóstico', 'Microsoft no usa tus datos de diagnóstico para sugerencias.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Privacy', 'TailoredExperiencesWithDiagnosticDataEnabled', 'DWORD', 0)], EW);
add('feedback-never', 'privacidad', 'No pedir valoraciones a Windows', 'Frecuencia de comentarios = nunca.', 'safe', [R(CU, 'Software\\Microsoft\\Siuf\\Rules', 'NumberOfSIUFInPeriod', 'DWORD', 0)], EW);
add('wifi-sense-off', 'privacidad', 'Desactivar Wi-Fi Sense', 'No te conecta automáticamente a redes sugeridas.', 'safe', [R(LM, 'SOFTWARE\\Microsoft\\WcmSvc\\wifinetworkmanager\\config', 'AutoConnectAllowedOEM', 'DWORD', 0)], EW);
add('spotlight-off', 'privacidad', 'Desactivar Windows Spotlight', 'Sin fondos y consejos de Spotlight.', 'safe', [R(CU, 'Software\\Policies\\Microsoft\\Windows\\CloudContent', 'DisableWindowsSpotlightFeatures', 'DWORD', 1), R(CU, 'Software\\Policies\\Microsoft\\Windows\\CloudContent', 'DisableTailoredExperiencesWithDiagnosticData', 'DWORD', 1)], EW);
add('inking-off', 'privacidad', 'No recopilar escritura ni tinta', 'Windows no aprende de lo que escribes.', 'safe', [R(CU, 'Software\\Microsoft\\InputPersonalization', 'RestrictImplicitInkCollection', 'DWORD', 1), R(CU, 'Software\\Microsoft\\InputPersonalization', 'RestrictImplicitTextCollection', 'DWORD', 1)], EW);
add('speech-online-off', 'privacidad', 'Desactivar reconocimiento de voz en línea', 'La voz no se envía a Microsoft.', 'safe', [R(CU, 'Software\\Microsoft\\Speech_OneCore\\Settings\\OnlineSpeechPrivacy', 'HasAccepted', 'DWORD', 0)], EW);
add('clipboard-sync-off', 'privacidad', 'Desactivar historial y sincronización del portapapeles', 'Win+V y sincronización entre dispositivos apagados.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'AllowClipboardHistory', 'DWORD', 0), R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'AllowCrossDeviceClipboard', 'DWORD', 0)], EW);
add('cdp-off', 'privacidad', 'Desactivar experiencias entre dispositivos', 'Sin "Continuar en otro dispositivo" (CDP).', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'EnableCdp', 'DWORD', 0), R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\CDP', 'CdpSessionUserAuthzPolicy', 'DWORD', 0), R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\CDP', 'RomeSdkChannelUserAuthzPolicy', 'DWORD', 0)], EW);
add('start-recommend-off', 'privacidad', 'Inicio sin "Recomendados" ni apps recientes', 'Menú Inicio más limpio.', 'safe', [R(CU, EXP, 'Start_IrisRecommendations', 'DWORD', 0), R(CU, EXP, 'Start_TrackProgs', 'DWORD', 0)], EW);
add('taskbar-chat-off', 'privacidad', 'Quitar Chat/Teams y botón de Widgets de la barra', 'Oculta Chat y Widgets en la barra (Win11).', 'safe', [R(CU, EXP, 'TaskbarMn', 'DWORD', 0), R(CU, EXP, 'TaskbarDa', 'DWORD', 0), R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Chat', 'ChatIcon', 'DWORD', 3)], { req: 'win11', ...EW });
add('cortana-off', 'privacidad', 'Desactivar Cortana y búsqueda en la nube', 'AllowCortana=0 y sin búsqueda web.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowCortana', 'DWORD', 0), R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowCloudSearch', 'DWORD', 0), R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'ConnectedSearchUseWeb', 'DWORD', 0)], EW);
add('handwriting-reports-off', 'privacidad', 'Sin informes de errores de escritura a mano', 'PreventHandwritingErrorReports.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\HandwritingErrorReports', 'PreventHandwritingErrorReports', 'DWORD', 1)], EW);
add('defender-cloud-off', 'privacidad', 'Defender: no enviar muestras a Microsoft', 'Desactiva el envío automático de muestras y la protección en la nube (Defender sigue activo).', 'medium', [R(LM, DEF + '\\Spynet', 'SpynetReporting', 'DWORD', 0), R(LM, DEF + '\\Spynet', 'SubmitSamplesConsent', 'DWORD', 2)], { warn: 'Defender detectará amenazas nuevas algo más tarde.' });
add('edge-telemetry-off', 'privacidad', 'Edge: telemetría y primera ejecución', 'Sin métricas, informes personalizados ni asistente de bienvenida.', 'safe', [R(LM, EDGE, 'MetricsReportingEnabled', 'DWORD', 0), R(LM, EDGE, 'PersonalizationReportingEnabled', 'DWORD', 0), R(LM, EDGE, 'UserFeedbackAllowed', 'DWORD', 0), R(LM, EDGE, 'HideFirstRunExperience', 'DWORD', 1)], EW);
add('edge-shopping-sidebar-off', 'privacidad', 'Edge: sin compras, barra lateral ni Copilot', 'Quita el asistente de compras y la barra lateral.', 'safe', [R(LM, EDGE, 'EdgeShoppingAssistantEnabled', 'DWORD', 0), R(LM, EDGE, 'HubsSidebarEnabled', 'DWORD', 0)], EW);
add('chrome-privacy', 'privacidad', 'Chrome: sin segundo plano ni métricas', 'Chrome no queda residente y no envía métricas.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Google\\Chrome', 'BackgroundModeEnabled', 'DWORD', 0), R(LM, 'SOFTWARE\\Policies\\Google\\Chrome', 'MetricsReportingEnabled', 'DWORD', 0), R(LM, 'SOFTWARE\\Policies\\Google\\Chrome', 'StartupBoostEnabled', 'DWORD', 0)], { ...EW, tier: 1 });
add('onedrive-off', 'privacidad', 'Desactivar OneDrive por política', 'Impide la sincronización de OneDrive.', 'medium', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows\\OneDrive', 'DisableFileSyncNGSC', 'DWORD', 1)], { warn: 'Tus archivos no se sincronizarán con OneDrive.' });
add('store-autoupdate-off', 'privacidad', 'Microsoft Store: sin actualizaciones automáticas', 'Las apps de la Tienda no se actualizan solas.', 'medium', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\WindowsStore', 'AutoDownload', 'DWORD', 2)], { warn: 'Actualiza las apps de la Tienda manualmente.' });

// ───────── ACTUALIZACIONES ─────────
add('wu-no-autoreboot', 'actualizaciones', 'No reiniciar solo con usuarios conectados', 'Windows nunca reinicia por una actualización mientras estás en sesión.', 'safe', [R(LM, WU + '\\AU', 'NoAutoRebootWithLoggedOnUsers', 'DWORD', 1)], { ...EW, tier: 1 });
add('wu-no-driver-updates', 'actualizaciones', 'Windows Update no reemplaza tus drivers', 'ExcludeWUDriversInQualityUpdate=1: evita que Windows pise tu driver de GPU/chipset con otro más antiguo.', 'medium', [R(LM, WU, 'ExcludeWUDriversInQualityUpdate', 'DWORD', 1)], { tier: 1 });
add('wu-defer-feature', 'actualizaciones', 'Aplazar actualizaciones de versión 1 año', 'Las grandes actualizaciones (23H2→24H2…) esperan 365 días.', 'medium', [R(LM, WU, 'DeferFeatureUpdates', 'DWORD', 1), R(LM, WU, 'DeferFeatureUpdatesPeriodInDays', 'DWORD', 365)], { work: 1 });
add('wu-defer-quality', 'actualizaciones', 'Aplazar actualizaciones de calidad 7 días', 'Esperas una semana a que otros detecten fallos.', 'medium', [R(LM, WU, 'DeferQualityUpdates', 'DWORD', 1), R(LM, WU, 'DeferQualityUpdatesPeriodInDays', 'DWORD', 7)], { work: 1 });
add('wu-notify-only', 'actualizaciones', 'Windows Update solo notifica', 'AUOptions=2: avisa antes de descargar e instalar.', 'advanced', [R(LM, WU + '\\AU', 'NoAutoUpdate', 'DWORD', 0), R(LM, WU + '\\AU', 'AUOptions', 'DWORD', 2)], { warn: 'Si olvidas actualizar, te quedarás sin parches de seguridad.' });
add('wu-no-msrt', 'actualizaciones', 'Sin herramienta de eliminación de malware vía Update', 'DontOfferThroughWUAU: no instala MRT en cada actualización.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\MRT', 'DontOfferThroughWUAU', 'DWORD', 1)], EW);
add('wu-insider-hide', 'actualizaciones', 'Ocultar página Insider', 'Quita las opciones del Programa Insider.', 'safe', [R(LM, 'SOFTWARE\\Microsoft\\WindowsSelfHost\\UI\\Visibility', 'HideInsiderPage', 'DWORD', 1)], EW);

// ───────── SEGURIDAD (suben seguridad) ─────────
add('remote-assist-off', 'seguridad', 'Desactivar Asistencia remota', 'Cierra una puerta de acceso remoto que casi nadie usa.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\Remote Assistance', 'fAllowToGetHelp', 'DWORD', 0)], EW);
add('autorun-off', 'seguridad', 'Desactivar AutoRun/AutoPlay de USB', 'Evita que un pendrive infectado ejecute algo al conectarlo.', 'safe', [R(LM, 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'NoDriveTypeAutoRun', 'DWORD', 255)], EW);
add('smbv1-off', 'seguridad', 'Desactivar SMBv1', 'Protocolo obsoleto usado por ransomware tipo WannaCry.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters', 'SMB1', 'DWORD', 0)], { ...EW, warn: 'Dispositivos muy antiguos (NAS viejos) pueden dejar de conectar.' });
add('llmnr-off', 'seguridad', 'Desactivar LLMNR', 'Evita ataques de suplantación en la red local.', 'safe', [R(LM, 'SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient', 'EnableMulticast', 'DWORD', 0)], EW);
add('rdp-off', 'seguridad', 'Desactivar Escritorio remoto', 'Nadie podrá conectarse a tu PC por RDP.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\Terminal Server', 'fDenyTSConnections', 'DWORD', 1)], { ...EW, warn: 'Si te conectas a este PC con RDP, no lo actives.' });
add('lm-hash-off', 'seguridad', 'No guardar hashes LM de contraseñas', 'NoLMHash=1.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\Lsa', 'NoLMHash', 'DWORD', 1)], EW);
add('ntlmv2-only', 'seguridad', 'Solo NTLMv2', 'LmCompatibilityLevel=5: rechaza protocolos de autenticación antiguos.', 'medium', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\Lsa', 'LmCompatibilityLevel', 'DWORD', 5)], { warn: 'Equipos o NAS muy antiguos no podrán autenticarse.' });
add('restrict-anon', 'seguridad', 'Restringir enumeración anónima', 'RestrictAnonymous=1.', 'safe', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\Lsa', 'RestrictAnonymous', 'DWORD', 1)], EW);

// ───────── PERSONALIZACIÓN ─────────
add('classic-context-menu', 'personalizacion', 'Menú contextual clásico (Windows 11)', 'Vuelve el clic derecho completo sin "Mostrar más opciones".', 'safe', [KEYDEF(CU, 'Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32')], { req: 'win11', relog: 1, work: 1 });
add('dark-mode', 'personalizacion', 'Modo oscuro', 'Tema oscuro para Windows y apps.', 'safe', [R(CU, PERS, 'AppsUseLightTheme', 'DWORD', 0), R(CU, PERS, 'SystemUsesLightTheme', 'DWORD', 0)]);
add('taskbar-left', 'personalizacion', 'Barra de tareas a la izquierda (Win11)', 'Alinea los iconos a la izquierda como en Windows 10.', 'safe', [R(CU, EXP, 'TaskbarAl', 'DWORD', 0)], { req: 'win11' });
add('clock-seconds', 'personalizacion', 'Segundos en el reloj', 'La hora de la barra muestra segundos.', 'safe', [R(CU, EXP, 'ShowSecondsInSystemClock', 'DWORD', 1)]);
add('desktop-thispc-icon', 'personalizacion', 'Icono "Este equipo" en el escritorio', 'Muestra el icono clásico.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel', '{20D04FE0-3AEA-1069-A2D8-08002B30309D}', 'DWORD', 0)]);
add('taskbar-search-hidden', 'personalizacion', 'Ocultar cuadro de búsqueda de la barra', 'Más espacio en la barra.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'SearchboxTaskbarMode', 'DWORD', 0)], EW);
add('taskview-hidden', 'personalizacion', 'Ocultar botón Vista de tareas', 'Quita el botón de la barra.', 'safe', [R(CU, EXP, 'ShowTaskViewButton', 'DWORD', 0)]);
add('full-path-title', 'personalizacion', 'Ruta completa en el título del Explorador', 'Muestra la ruta completa de la carpeta.', 'safe', [R(CU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\CabinetState', 'FullPath', 'DWORD', 1)], { work: 1 });
add('compact-view', 'personalizacion', 'Explorador en vista compacta', 'Más archivos por pantalla.', 'safe', [R(CU, EXP, 'UseCompactMode', 'DWORD', 1)], { work: 1 });

// ───────── LAPTOP Y TEMPERATURA (solo se ofrecen en portátiles) ─────────
add('lap-cap-boost', 'laptop', 'Limitar el turbo de la CPU al 99% (mucho menos calor)', 'PROCTHROTTLEMAX=99: en la mayoría de CPUs Intel desactiva el turbo y baja 10-20 °C con poca pérdida de FPS. Ideal si tu portátil se calienta o hace thermal throttling.', 'medium', [pcfg(SUB_PROC, PROCMAX, 99, 99)], { req: 'laptop', lap: 1, warn: 'Pierdes algo de rendimiento máximo en CPU (no suele notarse en juegos limitados por la GPU).' });
add('lap-epp-balanced', 'laptop', 'Preferencia de energía equilibrada (EPP 40)', 'Pide a la CPU un equilibrio entre rendimiento y calor en vez de subir al máximo siempre.', 'safe', [pcfg(SUB_PROC, EPP, 40, 60)], { req: 'laptop', lap: 1 });
add('lap-boost-efficient', 'laptop', 'Boost eficiente de CPU', 'PERFBOOSTMODE=3: sube de frecuencia solo cuando hace falta, no en cada pico.', 'safe', [pcfg(SUB_PROC, BOOSTMODE, 3, 3)], { req: 'laptop', lap: 1 });
add('lap-cooling-active', 'laptop', 'Refrigeración activa antes de reducir frecuencia', 'SYSCOOLPOL=1: Windows sube primero el ventilador y solo después baja la velocidad de la CPU.', 'safe', [pcfg(SUB_PROC, COOLPOL, 1, 0)], { req: 'laptop', lap: 1 });

// ───────── EXPERIMENTAL (riesgo alto: solo modo Extremo o manual) ─────────
add('mitigations-off', 'experimental', 'Desactivar mitigaciones Spectre/Meltdown', 'FeatureSettingsOverride=3: quita parches de CPU que cuestan 2-8% de rendimiento en algunas CPUs.', 'advanced', [R(LM, MM, 'FeatureSettingsOverride', 'DWORD', 3), R(LM, MM, 'FeatureSettingsOverrideMask', 'DWORD', 3)], { reboot: 1, tier: 4, noLaptop: 1, warn: 'Reduce la seguridad frente a ataques de canal lateral de CPU. Solo en un PC de juegos que no uses para banca ni trabajo sensible.' });
add('vbs-off', 'experimental', 'Desactivar Integridad de memoria (VBS/HVCI)', 'Puede dar +3-10% FPS en CPUs medias, pero QUITA una protección del kernel contra malware.', 'advanced', [R(LM, 'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity', 'Enabled', 'DWORD', 0), R(LM, 'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard', 'EnableVirtualizationBasedSecurity', 'DWORD', 0)], { reboot: 1, tier: 4, warn: 'Reduce la seguridad del sistema. Recomendado solo en un PC dedicado a juegos.' });
add('hypervisor-off', 'experimental', 'Desactivar el hipervisor de Windows', 'hypervisorlaunchtype=off: quita la capa de virtualización que usa Windows (VBS, Hyper-V). Menos latencia.', 'advanced', [bcd('hypervisorlaunchtype', 'off')], { reboot: 1, tier: 4, noLaptop: 1, warn: 'WSL2, Docker, Windows Sandbox, Android en Windows y máquinas Hyper-V dejarán de funcionar.' });
add('csrss-high', 'experimental', 'Prioridad alta para csrss (subsistema de ventanas)', 'Sube la prioridad de CPU y de E/S de csrss.exe: respuesta de ratón y ventanas más consistente bajo carga.', 'advanced', [R(LM, 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\csrss.exe\\PerfOptions', 'CpuPriorityClass', 'DWORD', 3), R(LM, 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\csrss.exe\\PerfOptions', 'IoPriority', 'DWORD', 3)], { reboot: 1, tier: 4, warn: 'Un valor mal elegido puede dejar el sistema sin respuesta. Se revierte borrando la clave.' });

// ───────── MODOS ─────────
const rank = (t) => t.tier || 0;
const MODES = [
  { id: 'normal', name: 'Normal', tag: 'Windows como lo dejaste', badge: 'Seguro', icon: 'circle', test: () => false, desc: 'Deshace lo que activaron los modos. Tus ajustes manuales se quedan.' },
  { id: 'eficiente', name: 'Eficiente', tag: 'Batería y silencio', badge: 'Seguro', icon: 'leaf', test: (t) => t.eco && t.risk === 'safe', desc: 'Menos telemetría y procesos de fondo. Ideal para ahorrar batería.' },
  { id: 'trabajo', name: 'Trabajo', tag: 'Fluido para trabajar', badge: 'Seguro', icon: 'briefcase', test: (t) => t.work && t.risk === 'safe', desc: 'Windows ágil sin tocar impresión, red ni búsqueda de archivos.' },
  { id: 'laptop', name: 'Laptop Gaming', tag: 'FPS sin sobrecalentar', badge: 'Seguro', icon: 'laptop', laptop: true, test: (t) => t.lap || (rank(t) === 1 && !t.noLaptop && t.risk !== 'advanced'), desc: 'Pensado para portátiles: limita el turbo, activa la refrigeración y no fuerza la CPU/GPU al máximo. Usa la GPU dedicada en tus juegos.' },
  { id: 'gaming', name: 'Gaming', tag: 'Juegos fluidos', badge: 'Seguro', icon: 'gamepad', test: (t) => rank(t) === 1 && t.risk !== 'advanced', desc: 'Prioridad al juego, plan de máximo rendimiento, red sin limitaciones.' },
  { id: 'streaming', name: 'Streaming', tag: 'Jugar y transmitir', badge: 'Seguro', icon: 'radio', test: (t) => rank(t) === 1 && !t.noStream && t.risk !== 'advanced', desc: 'Como Gaming, pero respeta la captura de Xbox/Game Bar y OBS.' },
  { id: 'competitivo', name: 'Competitivo', tag: 'Menos input lag', badge: 'Avanzado', icon: 'target', test: (t) => rank(t) >= 1 && rank(t) <= 2 && t.risk !== 'advanced', desc: 'Todo Gaming + CPU a plena frecuencia, MSI en GPU, Nagle off, timer fino y ajustes de GPU.' },
  { id: 'ultimate', name: 'Ultimate', tag: 'Todo al máximo', badge: 'Avanzado', icon: 'flame', test: (t) => rank(t) >= 1 && rank(t) <= 3, desc: 'Todo Competitivo + tick dinámico off, C-States off y ajustes avanzados de driver. Pide reiniciar.' },
  { id: 'extremo', name: 'Extremo', tag: 'Sin límites', badge: 'Riesgoso', icon: 'skull', test: (t) => rank(t) >= 1, desc: 'Todo Ultimate + desactivar mitigaciones de CPU, VBS y el hipervisor. Solo PC de escritorio dedicado a juegos.' },
];

function factOK(t, f) {
  if (!f) return true;
  if (f.laptop && t.noLaptop) return false;
  switch (t.req) {
    case 'nvidia': return !!f.nvidia; case 'amd': return !!f.amd; case 'intel': return !!f.intel;
    case 'laptop': return !!f.laptop; case 'desktop': return !f.laptop; case 'win11': return !!f.win11;
    default: return true;
  }
}
// Un tweak "req" no cumplido nunca se ofrece; noLaptop se omite en portátiles dentro de los modos.
// Ajustes que pueden congelar el PC o tumbar juegos (UE5/Fortnite, EAC): nunca entran en un modo, solo a mano y con aviso.
const CRASH = new Set(['svc-xbox','svc-bluetooth','svc-tablet','gpu-preemption-off', 'nv-preempt-off', 'amd-preempt-off', 'gpu-tdr-off', 'csrss-high', 'large-system-cache', 'idle-disable']);
for (const t of T) if (CRASH.has(t.id)) { t.crash = 1; t.warn = t.warn || 'Puede congelar el PC o cerrar juegos como Fortnite.'; if (/^svc-(xbox|bluetooth|tablet)$/.test(t.id)) t.warn = 'Puede dejar de funcionar mandos (GameSir, Xbox, PlayStation), Bluetooth o teclado táctil.'; }
// En portátiles solo entran ajustes de riesgo bajo (nada de tier 3-4, MSI, HAGS, preemption, mitigaciones, cambios de timer ni ahorro de energía forzado a 100%): los cuelgues en laptops vienen de forzar CPU/GPU al máximo.
const LAPTOP_BLOCK = new Set(['gpu-msi', 'nic-msi', 'hags-on', 'bcd-tscsync', 'svchost-split', 'memory-compression-off', 'disable-paging-executive', 'prefetch-off', 'mouse-queue', 'kb-queue', 'fast-startup-off', 'hibernate-off', 'ifeo-cpu-high', 'ifeo-io-high', 'nagle-off', 'dwm-mpo-off', 'amd-crash-defender']);
const laptopOK = (t) => !LAPTOP_BLOCK.has(t.id) && (t.lap || ((t.tier || 0) <= 2 && t.risk !== 'advanced'));
function modeTweakIds(mode, facts) { return T.filter((t) => !t.crash && mode.test(t) && factOK(t, facts) && (!facts || !facts.laptop || laptopOK(t))).map((t) => t.id); }
function reqOK(t, f) { if (!f || !t.req) return true; return factOK({ req: t.req }, f); }

for (const t of T) t.tier = t.tier || 0;
module.exports = { TWEAKS: T, CATEGORIES, MODES, modeTweakIds, reqOK };
