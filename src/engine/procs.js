'use strict';
// Procesos y servicios: lista todo con una explicación y deja "desactivar para siempre" solo donde es seguro.
// Nunca se puede tocar: procesos núcleo de Windows, Defender/antivirus, anti-cheat, drivers de GPU/audio, VPN/virtualización.
const startup = require('./startup');
const SVC_KEY = 'SYSTEM\\CurrentControlSet\\Services\\';

const CORE = new Set(['system', 'idle', 'registry', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'lsaiso', 'svchost', 'dwm', 'explorer', 'fontdrvhost', 'audiodg', 'ctfmon', 'sihost', 'taskhostw', 'runtimebroker',
  'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'textinputhost', 'conhost', 'wmiprvse', 'spoolsv', 'memcompression', 'securityhealthservice', 'securityhealthsystray', 'msmpeng', 'nissrv', 'smartscreen',
  'taskmgr', 'dllhost', 'lockapp', 'applicationframehost', 'wudfhost', 'dasHost'.toLowerCase(), 'sgrmbroker', 'unsecapp', 'electron', 'sveqzz optimizer']);
const PROTECT_RE = /nvidia|nvdisplay|nvcontainer|amd|radeon|intel|realtek|waves|easyanticheat|beservice|battleye|vgc|vgk|vanguard|faceit|esea|windefend|sense|security|antivirus|defender|avast|kaspersky|norton|mcafee|bitdefender|eset|malwarebytes|vpn|wireguard|openvpn|vmware|virtualbox|vbox|docker|hyper-v|vmms|gamingservices|gameinput/i;

// Conocidos que casi nadie necesita. svc = servicio a desactivar; app = patrón para detectar su entrada de inicio.
const KB = [
  { n: 'diagtrack', svc: 'DiagTrack', title: 'Telemetría de Windows', msg: 'Envía datos de uso a Microsoft. Desactivarlo no afecta a nada que uses.' },
  { svc: 'dmwappushservice', title: 'Mensajes push de telemetría', msg: 'Acompaña a la telemetría. Seguro de desactivar.' },
  { svc: 'SysMain', title: 'SysMain (Superfetch)', msg: 'Precarga apps en RAM. En SSD apenas ayuda y gasta disco. En HDD déjalo activo.' },
  { svc: 'WSearch', title: 'Indexado de búsqueda', msg: 'Indexa archivos para buscar rápido. Si lo desactivas, la búsqueda será más lenta.' },
  { svc: 'Fax', title: 'Fax', msg: 'Casi nadie usa fax. Seguro de desactivar.' },
  { svc: 'RetailDemo', title: 'Modo demo de tienda', msg: 'Solo sirve en equipos de exposición. Seguro de desactivar.' },
  { svc: 'MapsBroker', title: 'Mapas descargados', msg: 'Actualiza mapas sin conexión. Seguro de desactivar si no usas la app Mapas.' },
  { svc: 'WMPNetworkSvc', title: 'Uso compartido de Windows Media Player', msg: 'Comparte tu música en red. Seguro de desactivar.' },
  { svc: 'lfsvc', title: 'Geolocalización', msg: 'Ubicación para apps. Desactívalo si no usas apps que la pidan.' },
  { svc: 'WerSvc', title: 'Informe de errores de Windows', msg: 'Envía informes de bloqueos. Seguro de desactivar.' },
  { svc: 'diagnosticshub.standardcollector.service', title: 'Recolector de diagnóstico', msg: 'Para herramientas de Visual Studio. Seguro de desactivar.' },
  { svc: 'RemoteRegistry', title: 'Registro remoto', msg: 'Permite editar tu registro desde otro PC. Es mejor tenerlo desactivado.' },
  { svc: 'TrkWks', title: 'Seguimiento de vínculos', msg: 'Mantiene accesos directos entre PCs de red. Seguro de desactivar en un PC doméstico.' },
  { svc: 'icssvc', title: 'Zona Wi-Fi móvil', msg: 'Para compartir tu internet. Desactívalo si no lo usas.' },
  { svc: 'PhoneSvc', title: 'Servicio de teléfono', msg: 'Para vincular un teléfono. Seguro de desactivar si no lo usas.' },
  { svc: 'XblAuthManager', title: 'Xbox Live (autenticación)', msg: 'Necesario para Game Pass y juegos de Microsoft Store. Si no los usas, desactívalo.', warn: true },
  { svc: 'XblGameSave', title: 'Xbox Live (guardado)', msg: 'Guardado en la nube de Xbox. Si no usas Game Pass, desactívalo.', warn: true },
  { svc: 'XboxNetApiSvc', title: 'Xbox Live (red)', msg: 'Red de Xbox. Si no usas Game Pass, desactívalo.', warn: true },
  { svc: 'edgeupdate', title: 'Actualizador de Edge', msg: 'Actualiza Edge. Puedes desactivarlo; Edge se actualizará al abrirlo.' },
  { svc: 'gupdate', title: 'Actualizador de Google', msg: 'Actualiza Chrome en segundo plano. Chrome se actualiza solo al abrirlo.' },
  { svc: 'AdobeARMservice', title: 'Actualizador de Adobe', msg: 'Busca actualizaciones de Adobe. Seguro de desactivar.' },
  { svc: 'AdobeUpdateService', title: 'Actualizador de Adobe', msg: 'Busca actualizaciones de Adobe. Seguro de desactivar.' },
];
const APPS = [
  { re: /^onedrive$/, title: 'OneDrive', msg: 'Sincroniza tus archivos con la nube. Si no lo usas, gasta RAM y red.' },
  { re: /^(teams|ms-teams)$/, title: 'Microsoft Teams', msg: 'Se abre solo y consume bastante RAM. Ábrelo tú cuando lo necesites.' },
  { re: /^spotify$/, title: 'Spotify', msg: 'Se abre al iniciar Windows. Puedes abrirlo cuando quieras.' },
  { re: /^(epicgameslauncher|epicwebhelper)$/, title: 'Epic Games Launcher', msg: 'Se queda en segundo plano. Ábrelo solo cuando vayas a jugar.' },
  { re: /^(steam|steamwebhelper)$/, title: 'Steam', msg: 'Si no lo necesitas al arrancar, ábrelo cuando vayas a jugar.' },
  { re: /^discord$/, title: 'Discord', msg: 'Se abre al iniciar Windows. Puedes abrirlo cuando quieras.' },
  { re: /^(skype|skypeapp)$/, title: 'Skype', msg: 'Pocas personas lo usan ya. Seguro de cerrar.' },
  { re: /^(adobe.*|acrotray|creative cloud.*|ccxprocess|cclibrary)$/, title: 'Adobe en segundo plano', msg: 'Servicios de Adobe que se quedan abiertos. Seguro de cerrar.' },
  { re: /^(googledrivefs|dropbox|onedrivestandalone)$/, title: 'Sincronización en la nube', msg: 'Sincroniza archivos. Ciérralo si no lo usas ahora.' },
  { re: /^(cortana|widgets|widgetservice|yourphone|phoneexperiencehost|gamebar|gamebarftserver|gamebarpresencewriter)$/, title: 'Componente opcional de Windows', msg: 'No es necesario para que Windows funcione. Seguro de cerrar.' },
];
const safeName = (s) => /^[\w .()\-+]{1,80}$/.test(s);
const safeSvc = (s) => /^[\w.\-]{1,80}$/.test(s);

function parse(out) { const m = out.match(/@@SVQ@@(.*)$/m); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } }

async function readAll(be) {
  if (be.mock) return be._mockProcs || { p: [{ n: 'onedrive', c: 1, mb: 180, path: 'C:\\Users\\x\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe', co: 'Microsoft' }, { n: 'chrome', c: 14, mb: 1200, path: 'C:\\Program Files\\Google\\Chrome\\chrome.exe', co: 'Google' }, { n: 'svchost', c: 60, mb: 700, path: 'C:\\Windows\\System32\\svchost.exe', co: 'Microsoft' }, { n: 'lsass', c: 1, mb: 20, path: 'C:\\Windows\\System32\\lsass.exe', co: 'Microsoft' }], s: [{ n: 'DiagTrack', d: 'Experiencias del usuario conectado', st: 'Running', sm: 'Auto', path: 'C:\\Windows\\System32\\svchost.exe' }, { n: 'EasyAntiCheat', d: 'EasyAntiCheat', st: 'Running', sm: 'Manual', path: 'C:\\Games\\eac.exe' }, { n: 'MyVendorSvc', d: 'Vendor Helper', st: 'Running', sm: 'Auto', path: 'C:\\Program Files\\Vendor\\h.exe' }] };
  const ps = String.raw`$ErrorActionPreference='SilentlyContinue'
$p = Get-Process | Group-Object ProcessName | ForEach-Object { $f = $_.Group[0]; [pscustomobject]@{ n = $_.Name; c = $_.Count; mb = [math]::Round((($_.Group | Measure-Object WorkingSet64 -Sum).Sum) / 1MB); path = $f.Path; co = $f.Company } }
$s = Get-CimInstance Win32_Service | ForEach-Object { [pscustomobject]@{ n = $_.Name; d = $_.DisplayName; st = [string]$_.State; sm = $_.StartMode; path = $_.PathName } }
'@@SVQ@@' + (ConvertTo-Json -InputObject @{ p = @($p); s = @($s) } -Compress -Depth 4)`;
  const r = await be.ps(ps, 40000); return parse(r.stdout) || { p: [], s: [] };
}

const inWin = (p) => /^[a-z]:\\windows\\/i.test(String(p || '').replace(/^"/, ''));

async function list(be, state) {
  const [raw, su] = await Promise.all([readAll(be), startup.list(be).catch(() => [])]);
  const dis = state.data.procDisabled = state.data.procDisabled || {};
  const items = [];
  const kbSvc = new Map(KB.map((k) => [k.svc.toLowerCase(), k]));
  // servicios: conocidos, y de terceros (fuera de Windows)
  for (const s of raw.s || []) {
    const k = kbSvc.get(String(s.n).toLowerCase());
    const third = !inWin(s.path) && !/microsoft/i.test(s.path || '');
    if (!k && !third) continue;
    const prot = PROTECT_RE.test(s.n + ' ' + (s.d || '') + ' ' + (s.path || ''));
    const id = 'svc::' + s.n, off = s.sm === 'Disabled';
    items.push({ id, kind: 'svc', name: s.d || s.n, tech: s.n, running: s.st === 'Running', startMode: s.sm, mb: 0, count: 1,
      level: prot ? 'protected' : k ? 'known' : 'app', title: k ? k.title : (s.d || s.n), msg: prot ? 'Protegido: es parte de tu antivirus, drivers, anti-cheat o virtualización. Sveqzz no lo toca.' : k ? k.msg : 'Servicio de un programa instalado. Si no usas ese programa, puedes desactivarlo.',
      warn: !!(k && k.warn), canDisable: !prot && !off, disabled: !!dis[id] || off, byUs: !!dis[id] });
  }
  // procesos
  for (const p of raw.p || []) {
    const key = String(p.n).toLowerCase();
    const core = CORE.has(key) || inWin(p.path) || !p.path;
    const prot = PROTECT_RE.test(key + ' ' + (p.path || ''));
    const app = APPS.find((a) => a.re.test(key));
    const entry = su.find((e) => e.enabled && String(e.cmd).toLowerCase().includes('\\' + key + '.exe'));
    const level = core ? 'system' : prot ? 'protected' : app ? 'known' : 'app';
    items.push({ id: 'proc::' + p.n, kind: 'proc', name: p.n, tech: p.path || '', mb: p.mb, count: p.c, company: p.co || '', level,
      title: app ? app.title : p.n, msg: core ? 'Parte de Windows: necesario para que el sistema funcione. No se puede cerrar desde aquí.' : prot ? 'Protegido: antivirus, drivers, anti-cheat o virtualización. Sveqzz no lo toca.' : app ? app.msg : 'Programa abierto. Puedes cerrarlo ahora; si arranca con Windows, también puedes desactivar su inicio.',
      canKill: !core && !prot, canDisable: !core && !prot && !!entry, startupId: entry ? entry.id : null, disabled: !!dis['proc::' + p.n], byUs: !!dis['proc::' + p.n] });
  }
  // desactivados por nosotros que ya no aparecen en la lista (apps cerradas)
  for (const [id, d] of Object.entries(dis)) if (!items.some((i) => i.id === id)) items.push({ id, kind: d.type === 'svc' ? 'svc' : 'proc', name: d.name, tech: '', mb: 0, count: 0, level: 'known', title: d.name, msg: 'Desactivado por ti con Sveqzz.', canDisable: false, disabled: true, byUs: true });
  const order = { known: 0, app: 1, protected: 2, system: 3 };
  items.sort((a, b) => (b.byUs - a.byUs) || (order[a.level] - order[b.level]) || (b.mb - a.mb));
  return items;
}

async function kill(be, name) {
  if (!safeName(name)) throw new Error('Nombre no válido');
  const k = name.toLowerCase();
  if (CORE.has(k) || PROTECT_RE.test(k)) throw new Error('Ese proceso está protegido');
  const all = (await list(be, { data: {} })).find((i) => i.id === 'proc::' + name);
  if (all && !all.canKill) throw new Error('Ese proceso está protegido');
  await be.ps(`Stop-Process -Name '${name.replace(/'/g, "''")}' -Force -ErrorAction SilentlyContinue`, 20000);
}

async function disable(be, state, id) {
  const dis = state.data.procDisabled = state.data.procDisabled || {};
  const item = (await list(be, state)).find((i) => i.id === id);
  if (!item) throw new Error('Ya no está en la lista');
  if (!item.canDisable && !item.canKill) throw new Error('Ese elemento está protegido');
  if (item.kind === 'svc') {
    if (!item.canDisable || !safeSvc(item.tech)) throw new Error('No se puede desactivar');
    const prev = await be.regRead('HKLM', SVC_KEY + item.tech, 'Start');
    await be.regWrite('HKLM', SVC_KEY + item.tech, 'Start', 'DWORD', 4);
    await be.ps(`Stop-Service -Name '${item.tech}' -Force -ErrorAction SilentlyContinue`, 30000);
    dis[id] = { type: 'svc', name: item.title, ref: item.tech, prev: prev.exists ? prev.data : 3, at: Date.now() };
    state.log('proceso', `Servicio desactivado: ${item.title}`);
  } else {
    if (item.startupId) { await startup.toggle(be, item.startupId, false); dis[id] = { type: 'startup', name: item.title, ref: item.startupId, at: Date.now() }; state.log('proceso', `Inicio desactivado: ${item.title}`); }
    await kill(be, item.name);
  }
  state.save();
  return { persistent: !!dis[id] };
}

async function restore(be, state, id) {
  const dis = state.data.procDisabled || {}, d = dis[id];
  if (!d) throw new Error('Nada que restaurar');
  if (d.type === 'svc') { await be.regWrite('HKLM', SVC_KEY + d.ref, 'Start', 'DWORD', d.prev); if (d.prev !== 4) await be.ps(`Start-Service -Name '${d.ref}' -ErrorAction SilentlyContinue`, 30000); }
  else await startup.toggle(be, d.ref, true);
  delete dis[id]; state.log('proceso', `Reactivado: ${d.name}`); state.save();
}

module.exports = { list, kill, disable, restore, CORE, PROTECT_RE };
